import { randomUUID } from 'node:crypto';
import { chmod, link, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import * as Clock from 'effect/Clock';
import * as Effect from 'effect/Effect';
import * as Result from 'effect/Result';

import { fileOperation, readOptionalText } from './file-io.js';
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

export function readStore(options: StoreOptions): Promise<Store> {
  return Effect.runPromise(loadStore(options));
}

export const loadStore = Effect.fnUntraced(function* (options: StoreOptions) {
  const directory = configDirectory(options);
  const configFile = join(directory, CONFIG_FILE);
  const credentialsFile = join(directory, CREDENTIALS_FILE);
  const config = (yield* readJson(configFile)) ?? {};
  const credentials = (yield* readJson(credentialsFile)) ?? {};
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
});

// Parallel CLI commands share one store, so every read-modify-write holds a lock
// file carrying a per-holder nonce. A lock older than LOCK_STALE_MS belongs to a
// process that died holding it.
export function updateStore<T>(options: StoreOptions, mutate: (store: Store) => T): Promise<T> {
  return Effect.runPromise(updateStoreEffect(options, mutate));
}

export const updateStoreEffect = Effect.fnUntraced(function* <T>(
  options: StoreOptions,
  mutate: (store: Store) => T,
): Effect.fn.Return<T, Error> {
  const directory = configDirectory(options);
  const lock = join(directory, LOCK_FILE);
  const nonce = `${process.pid}-${randomUUID()}`;
  yield* fileOperation(() => ensureDirectory(directory));
  return yield* Effect.gen(function* () {
    yield* acquireLock(lock, nonce);
    const store = yield* loadStore(options);
    const result = mutate(store);
    yield* Effect.uninterruptible(writeStore(store, options));
    return result;
  }).pipe(
    Effect.onExit(() =>
      fileOperation(async () => {
        if ((await readLock(lock)) === nonce) await rm(lock, { force: true });
      }),
    ),
  );
});

const acquireLock = Effect.fnUntraced(function* (path: string, nonce: string) {
  const startedAt = yield* Clock.currentTimeMillis;
  let announced = false;
  while (true) {
    const attempt = yield* Effect.result(
      Effect.uninterruptible(
        fileOperation(() => writeFile(path, nonce, { flag: 'wx', mode: 0o600 })),
      ),
    );
    if (Result.isSuccess(attempt)) return;
    if ((attempt.failure as NodeJS.ErrnoException).code !== 'EEXIST')
      return yield* Effect.fail(attempt.failure);
    const holder = yield* fileOperation(() => readLock(path));
    const lockedAt = yield* fileOperation(() => stat(path)).pipe(
      Effect.map(({ mtimeMs }) => mtimeMs),
      Effect.catch(() => Effect.succeed(undefined)),
    );
    const now = yield* Clock.currentTimeMillis;
    if (holder !== undefined && lockedAt !== undefined && now - lockedAt > LOCK_STALE_MS) {
      yield* Effect.uninterruptible(fileOperation(() => reclaimStaleLock(path, holder, nonce)));
      continue;
    }
    if (!announced && now - startedAt > LOCK_NOTICE_MS) {
      announced = true;
      process.stderr.write(
        `${JSON.stringify({
          event: 'credentials_locked',
          message: `Waiting for another charming command to finish writing ${path}. A lock left by a crashed command clears after ${LOCK_STALE_MS / 1000} seconds.`,
        })}\n`,
      );
    }
    yield* Effect.sleep(LOCK_RETRY_MS);
  }
});

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

const writeStore = Effect.fnUntraced(function* (store: Store, options: StoreOptions) {
  const directory = configDirectory(options);
  yield* fileOperation(() => ensureDirectory(directory));

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
  yield* writeAtomically(
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
  yield* writeAtomically(
    join(directory, CONFIG_FILE),
    {
      ...store.unknown.config,
      ...(store.selected ? { profile: store.selected } : {}),
      ...(Object.keys(profiles).length > 0 ? { profiles } : {}),
    },
    0o644,
  );
});

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

const writeAtomically = Effect.fnUntraced(function* (
  path: string,
  value: Record<string, unknown>,
  mode: number,
) {
  if (Object.keys(value).length === 0) {
    yield* fileOperation(() => rm(path, { force: true }));
    return;
  }
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  yield* fileOperation(async () => {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode });
    await chmod(temporary, mode);
    await rename(temporary, path);
  }).pipe(
    Effect.catch((error) =>
      Effect.andThen(
        fileOperation(() => rm(temporary, { force: true })),
        Effect.fail(error),
      ),
    ),
  );
});

const readJson = Effect.fnUntraced(function* (path: string) {
  const text = yield* readOptionalText(path);
  if (text === undefined) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid JSON in ${path}. Fix or remove that file.`, { cause: error });
  }
  if (!isRecord(value)) invalid(path, 'the file must contain a JSON object');
  return value;
});

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

export { isMissingFile } from './file-io.js';
