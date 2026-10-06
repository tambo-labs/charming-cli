import { randomUUID } from 'node:crypto';
import { chmod, link, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { normalizeOrigin, PRODUCTION_BASE_URL } from './origin.js';
import { DEFAULT_PROFILE, isValidProfileName, MAX_PROFILE_NAME_LENGTH } from './profile-name.js';

export type StoreOptions = {
  configDir?: string;
  env?: NodeJS.ProcessEnv;
};

type Profile = { origin: string; token?: string };

type AppSecrets = Record<string, Record<string, string>>;

export type Store = {
  appTokens: AppSecrets;
  pairings: AppSecrets;
  profiles: Record<string, Profile>;
  selected?: string;
  unknown: {
    config: Record<string, unknown>;
    credentials: Record<string, unknown>;
    credentialProfiles: Record<string, unknown>;
  };
};

const CONFIG_FILE = 'config.json';
const CREDENTIALS_FILE = 'credentials.json';
const LOCK_FILE = 'credentials.lock';
const LOCK_RETRY_MS = 20;
const LOCK_STALE_MS = 10_000;
const LOCK_NOTICE_MS = 2_000;
const LEGACY_CONFIG_KEYS = new Set(['activeProfiles', 'appTokens', 'token', 'tokens']);

export function configPath(options: StoreOptions): string {
  return join(configDirectory(options), CONFIG_FILE);
}

export async function readStore(options: StoreOptions): Promise<Store> {
  const directory = configDirectory(options);
  const configFile = join(directory, CONFIG_FILE);
  const credentialsFile = join(directory, CREDENTIALS_FILE);
  const config = (await readJson(configFile)) ?? {};
  const credentials = (await readJson(credentialsFile)) ?? {};
  const store: Store = {
    appTokens: {},
    pairings: {},
    profiles: {},
    unknown: { config: {}, credentials: {}, credentialProfiles: {} },
  };

  const { profile: selected, profiles, ...restConfig } = config;
  if (selected !== undefined) {
    if (typeof selected !== 'string') invalid(configFile, '"profile" must be a string');
    store.selected = selected;
  }
  for (const [name, entry] of Object.entries(record(profiles, configFile, 'profiles'))) {
    if (!isValidProfileName(name) || !isRecord(entry) || typeof entry.origin !== 'string') {
      invalid(configFile, `profile "${name}" needs a valid name and an "origin" string`);
    }
    store.profiles[name] = { origin: normalizeOrigin(entry.origin) };
  }
  for (const [key, value] of Object.entries(restConfig)) {
    if (!LEGACY_CONFIG_KEYS.has(key)) store.unknown.config[key] = value;
  }

  const { apps, pairings, profiles: tokens, ...restCredentials } = credentials;
  store.unknown.credentials = restCredentials;
  for (const [name, entry] of Object.entries(record(tokens, credentialsFile, 'profiles'))) {
    if (!isRecord(entry) || typeof entry.token !== 'string') {
      invalid(credentialsFile, `profile "${name}" needs a "token" string`);
    }
    if (store.profiles[name]) store.profiles[name].token = entry.token;
    else store.unknown.credentialProfiles[name] = entry;
  }
  readAppSecrets(store.appTokens, apps, credentialsFile, 'apps');
  readAppSecrets(store.pairings, pairings, credentialsFile, 'pairings');

  migrateLegacy(config, store);
  return store;
}

// Parallel CLI commands share one store, so every read-modify-write holds a lock
// file carrying a per-holder nonce. A lock older than LOCK_STALE_MS belongs to a
// process that died holding it.
export async function updateStore<T>(
  options: StoreOptions,
  mutate: (store: Store) => T,
): Promise<T> {
  const directory = configDirectory(options);
  await ensureDirectory(directory);
  const lock = join(directory, LOCK_FILE);
  const nonce = `${process.pid}-${randomUUID()}`;
  await acquireLock(lock, nonce);
  try {
    const store = await readStore(options);
    const result = mutate(store);
    await writeStore(store, options);
    return result;
  } finally {
    if ((await readLock(lock)) === nonce) await rm(lock, { force: true });
  }
}

async function acquireLock(path: string, nonce: string): Promise<void> {
  const startedAt = Date.now();
  let announced = false;
  while (true) {
    try {
      await writeFile(path, nonce, { flag: 'wx', mode: 0o600 });
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    const holder = await readLock(path);
    const lockedAt = await stat(path).then(
      ({ mtimeMs }) => mtimeMs,
      () => undefined,
    );
    if (holder !== undefined && lockedAt !== undefined && Date.now() - lockedAt > LOCK_STALE_MS) {
      await reclaimStaleLock(path, holder, nonce);
      continue;
    }
    if (!announced && Date.now() - startedAt > LOCK_NOTICE_MS) {
      announced = true;
      process.stderr.write(
        `${JSON.stringify({
          event: 'credentials_locked',
          message: `Waiting for another charming command to finish writing ${path}. A lock left by a crashed command clears after ${LOCK_STALE_MS / 1000} seconds.`,
        })}\n`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
  }
}

// Only one waiter's rename of the stale file succeeds. A moved file that holds a
// different nonce than the stale one belongs to a new holder, so it goes back.
async function reclaimStaleLock(path: string, staleHolder: string, nonce: string): Promise<void> {
  const moved = `${path}.${nonce}`;
  try {
    await rename(path, moved);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  if ((await readLock(moved)) !== staleHolder) {
    await link(moved, path).catch(() => {});
  }
  await rm(moved, { force: true });
}

async function readLock(path: string): Promise<string | undefined> {
  return readFile(path, 'utf8').catch(() => undefined);
}

async function ensureDirectory(directory: string): Promise<void> {
  if (await mkdir(directory, { mode: 0o700, recursive: true })) await chmod(directory, 0o700);
}

async function writeStore(store: Store, options: StoreOptions): Promise<void> {
  const directory = configDirectory(options);
  await ensureDirectory(directory);

  const profileTokens = {
    ...store.unknown.credentialProfiles,
    ...Object.fromEntries(
      Object.entries(store.profiles)
        .filter(([, profile]) => profile.token !== undefined)
        .map(([name, profile]) => [name, { token: profile.token }]),
    ),
  };
  const apps = nonEmpty(store.appTokens);
  const pairings = nonEmpty(store.pairings);
  await writeAtomically(
    join(directory, CREDENTIALS_FILE),
    {
      ...store.unknown.credentials,
      ...(Object.keys(profileTokens).length > 0 ? { profiles: profileTokens } : {}),
      ...(Object.keys(apps).length > 0 ? { apps } : {}),
      ...(Object.keys(pairings).length > 0 ? { pairings } : {}),
    },
    0o600,
  );

  const profiles = Object.fromEntries(
    Object.entries(store.profiles).map(([name, profile]) => [name, { origin: profile.origin }]),
  );
  await writeAtomically(
    join(directory, CONFIG_FILE),
    {
      ...store.unknown.config,
      ...(store.selected ? { profile: store.selected } : {}),
      ...(Object.keys(profiles).length > 0 ? { profiles } : {}),
    },
    0o644,
  );
}

export function setAppSecret(
  secrets: AppSecrets,
  origin: string,
  appId: string,
  value: string,
): void {
  secrets[origin] = { ...secrets[origin], [appId]: value };
}

export function deleteAppSecret(secrets: AppSecrets, origin: string, appId: string): void {
  delete secrets[origin]?.[appId];
}

function readAppSecrets(target: AppSecrets, value: unknown, path: string, key: string): void {
  for (const [origin, secrets] of Object.entries(record(value, path, key))) {
    for (const [appId, secret] of Object.entries(record(secrets, path, `${key}.${origin}`))) {
      if (typeof secret !== 'string') invalid(path, `${key}.${origin}.${appId} must be a string`);
      setAppSecret(target, normalizeOrigin(origin), appId, secret);
    }
  }
}

function nonEmpty(secrets: AppSecrets): AppSecrets {
  return Object.fromEntries(
    Object.entries(secrets).filter(([, entries]) => Object.keys(entries).length > 0),
  );
}

export function originProfileName(origin: string, profiles: Store['profiles']): string {
  const base = originSlug(origin);
  if (profiles[base]?.origin === origin) return base;
  if (!profiles[base]) return base;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base.slice(0, MAX_PROFILE_NAME_LENGTH - String(suffix).length - 1)}-${suffix}`;
    if (!profiles[candidate] || profiles[candidate].origin === origin) return candidate;
  }
}

function migrateLegacy(config: Record<string, unknown>, store: Store): void {
  const originTokens = new Map<string, string>();
  for (const [origin, token] of Object.entries(isRecord(config.tokens) ? config.tokens : {})) {
    if (typeof token === 'string' && token.length > 0) {
      originTokens.set(normalizeOrigin(origin), token);
    }
  }
  const legacyToken =
    typeof config.token === 'string' && config.token.length > 0 ? config.token : undefined;
  const productionToken = originTokens.get(PRODUCTION_BASE_URL) ?? legacyToken;
  if (productionToken)
    adoptLegacyToken(store, PRODUCTION_BASE_URL, DEFAULT_PROFILE, productionToken);
  originTokens.delete(PRODUCTION_BASE_URL);
  for (const origin of [...originTokens.keys()].sort()) {
    adoptLegacyToken(
      store,
      origin,
      originProfileName(origin, store.profiles),
      originTokens.get(origin)!,
    );
  }

  for (const [key, token] of Object.entries(isRecord(config.appTokens) ? config.appTokens : {})) {
    if (typeof token !== 'string' || token.length === 0) continue;
    const separator = key.lastIndexOf('|');
    if (separator === -1) setAppSecret(store.appTokens, PRODUCTION_BASE_URL, key, token);
    else
      setAppSecret(
        store.appTokens,
        normalizeOrigin(key.slice(0, separator)),
        key.slice(separator + 1),
        token,
      );
  }
}

function adoptLegacyToken(store: Store, origin: string, preferred: string, token: string): void {
  const existing = store.profiles[preferred];
  const name =
    !existing || existing.origin === origin ? preferred : originProfileName(origin, store.profiles);
  store.profiles[name] = { origin, token };
}

function originSlug(origin: string): string {
  let host = origin;
  try {
    host = new URL(origin).host;
  } catch {}
  const slug = host.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return (/^[a-zA-Z]/.test(slug) ? slug : `host-${slug}`).slice(0, MAX_PROFILE_NAME_LENGTH);
}

function configDirectory(options: StoreOptions): string {
  if (options.configDir) return options.configDir;
  const env = options.env ?? process.env;
  if (env.CHARMING_CONFIG_DIR) return env.CHARMING_CONFIG_DIR;
  return env.XDG_CONFIG_HOME
    ? join(env.XDG_CONFIG_HOME, 'charming')
    : join(homedir(), '.config', 'charming');
}

async function writeAtomically(
  path: string,
  value: Record<string, unknown>,
  mode: number,
): Promise<void> {
  if (Object.keys(value).length === 0) {
    await rm(path, { force: true });
    return;
  }
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode });
    await chmod(temporary, mode);
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

async function readJson(path: string): Promise<Record<string, unknown> | undefined> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if (isMissingFile(error)) return undefined;
    throw error;
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid JSON in ${path}. Fix or remove that file.`, { cause: error });
  }
  if (!isRecord(value)) invalid(path, 'the file must contain a JSON object');
  return value;
}

function record(value: unknown, path: string, key: string): Record<string, unknown> {
  if (value === undefined) return {};
  if (!isRecord(value)) invalid(path, `"${key}" must be an object`);
  return value;
}

function invalid(path: string, problem: string): never {
  throw new Error(`Invalid ${path}: ${problem}. Fix or remove that file.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isMissingFile(error: unknown): boolean {
  return (
    error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}
