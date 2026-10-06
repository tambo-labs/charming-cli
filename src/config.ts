import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { PRODUCTION_BASE_URL, normalizeOrigin } from './origin.js';
import { DEFAULT_PROFILE, validateProfileName } from './profile-name.js';
import { findProjectConfig, writeProjectProfile } from './project-config.js';
import {
  configPath,
  deleteAppSecret,
  isMissingFile,
  originProfileName,
  readStore,
  setAppSecret,
  type Store,
  type StoreOptions,
  writeStore,
} from './store.js';

export { PRODUCTION_BASE_URL } from './origin.js';

type ProfileSource = 'default' | 'env' | 'flag' | 'home' | 'origin' | 'project';

type TokenSource = 'BUILDY_USER_TOKEN' | 'CHARMING_TOKEN' | 'credentials' | 'flag' | 'legacy';

export type Session = {
  legacyFallback: boolean;
  origin: string;
  originSource: 'default' | 'env' | 'flag' | 'profile';
  profile?: string;
  profileSource: ProfileSource;
  projectPath?: string;
  saved: boolean;
  token?: string;
  tokenSource?: TokenSource;
};

export type SessionRequest = StoreOptions & {
  baseUrl?: string;
  legacyTokenPath?: string;
  cwd?: string;
  profile?: string;
  purpose?: 'inspect' | 'login' | 'use';
  token?: string;
};

type Selection = { name: string; path?: string; source: ProfileSource };

export async function resolveSession(request: SessionRequest = {}): Promise<Session> {
  const env = request.env ?? process.env;
  const purpose = request.purpose ?? 'use';
  const store = await readStore(request);
  const selection = await selectProfile(request, env, store);
  const override = originOverride(request, env);
  const lenient =
    purpose !== 'login' &&
    override !== undefined &&
    overrideToken(request, env, override.origin) !== undefined;
  const matched = matchOrigin(selection, override, store, lenient);
  const name = matched?.name ?? (purpose === 'login' ? loginName(override, store) : undefined);
  const saved = name ? store.profiles[name] : undefined;
  const origin = override?.origin ?? saved?.origin ?? PRODUCTION_BASE_URL;
  const session: Session = {
    legacyFallback: false,
    origin,
    originSource: override?.source ?? (saved ? 'profile' : 'default'),
    profile: name,
    profileSource: matched?.source ?? 'origin',
    ...(matched?.path ? { projectPath: matched.path } : {}),
    saved: saved !== undefined,
  };
  if (purpose === 'login') return session;

  const explicit = overrideToken(request, env, origin);
  if (explicit) return { ...session, ...explicit };
  if (purpose === 'use' && name && name !== DEFAULT_PROFILE && !saved) {
    throw new Error(
      `Profile ${name} (selected by ${describeSelection(matched)}) is not saved on this machine. Run \`charming auth login --profile ${name}\` to sign in to it.`,
    );
  }
  const legacy = await legacyFallback(session, request);
  if (saved?.token) {
    return {
      ...session,
      legacyFallback: legacy !== undefined,
      token: saved.token,
      tokenSource: 'credentials',
    };
  }
  return legacy ? { ...session, token: legacy, tokenSource: 'legacy' } : session;
}

export async function saveLogin(session: Session, token: string): Promise<void> {
  const name = requireProfile(session);
  const store = await readStore({});
  store.profiles[name] = { origin: session.origin, token };
  delete store.pairings[session.origin];
  if (session.profileSource === 'flag') store.selected = name;
  await writeStore(store, {});
}

export async function logout(
  session: Session,
): Promise<{ appTokensRemoved: number; profile: string | null }> {
  const store = await readStore({});
  const name = session.profile;
  if (name && name !== DEFAULT_PROFILE && !store.profiles[name]) {
    throw new Error(`Profile ${name} has no saved credential.`);
  }
  if (name && store.profiles[name]?.origin === session.origin) {
    delete store.profiles[name];
    if (store.selected === name) delete store.selected;
  }
  const originStillSignedIn = Object.values(store.profiles).some(
    (profile) => profile.origin === session.origin,
  );
  let appTokensRemoved = 0;
  if (name === undefined || name === DEFAULT_PROFILE || !originStillSignedIn) {
    appTokensRemoved = Object.keys(store.appTokens[session.origin] ?? {}).length;
    delete store.appTokens[session.origin];
    delete store.pairings[session.origin];
  }
  await writeStore(store, {});
  return { appTokensRemoved, profile: name ?? null };
}

export async function listProfiles(request: SessionRequest = {}): Promise<{
  current: CurrentProfile;
  profiles: Array<{ name: string; origin: string; selected: boolean; signedIn: boolean }>;
}> {
  const current = await currentProfile(request);
  const store = await readStore(request);
  return {
    current,
    profiles: Object.entries(store.profiles)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, profile]) => ({
        name,
        origin: profile.origin,
        selected: name === current.profile,
        signedIn: profile.token !== undefined,
      })),
  };
}

type CurrentProfile = {
  origin: string;
  originSource: Session['originSource'];
  path?: string;
  profile: string | null;
  saved: boolean;
  source: ProfileSource;
};

export async function currentProfile(request: SessionRequest = {}): Promise<CurrentProfile> {
  const session = await resolveSession({ ...request, purpose: 'inspect' });
  return {
    origin: session.origin,
    originSource: session.originSource,
    ...(session.projectPath ? { path: session.projectPath } : {}),
    profile: session.profile ?? null,
    saved: session.saved,
    source: session.profileSource,
  };
}

export async function useProfile(
  name: string,
  request: StoreOptions & { cwd?: string; project?: boolean } = {},
): Promise<{ path: string; profile: string }> {
  validateProfileName(name);
  const store = await readStore(request);
  if (name !== DEFAULT_PROFILE && !store.profiles[name]) {
    throw new Error(
      `Profile ${name} is not saved on this machine. Run \`charming auth login --profile ${name}\` first.`,
    );
  }
  if (request.project) {
    return {
      ...(await writeProjectProfile(name, boundaries(request, request.env ?? process.env))),
      profile: name,
    };
  }
  const path = configPath(request);
  if ((store.selected ?? DEFAULT_PROFILE) !== name) {
    store.selected = name;
    await writeStore(store, request);
  }
  return { path, profile: name };
}

export async function loadAppToken(
  origin: string,
  appId: string,
  options: StoreOptions = {},
): Promise<string | undefined> {
  return (await readStore(options)).appTokens[origin]?.[appId];
}

export async function saveAppToken(
  origin: string,
  appId: string,
  token: string,
  options: StoreOptions = {},
): Promise<void> {
  const store = await readStore(options);
  setAppSecret(store.appTokens, origin, appId, token);
  await writeStore(store, options);
}

export async function savePairing(
  origin: string,
  appId: string,
  deviceCode: string,
): Promise<void> {
  const store = await readStore({});
  setAppSecret(store.pairings, origin, appId, deviceCode);
  await writeStore(store, {});
}

export async function loadPairings(origin: string): Promise<Record<string, string>> {
  return (await readStore({})).pairings[origin] ?? {};
}

export async function dropPairing(origin: string, appId: string): Promise<void> {
  const store = await readStore({});
  deleteAppSecret(store.pairings, origin, appId);
  await writeStore(store, {});
}

export async function dropAppToken(origin: string, appId: string): Promise<void> {
  const store = await readStore({});
  deleteAppSecret(store.appTokens, origin, appId);
  await writeStore(store, {});
}

async function selectProfile(
  request: SessionRequest,
  env: NodeJS.ProcessEnv,
  store: Store,
): Promise<Selection> {
  if (request.profile !== undefined) return validated({ name: request.profile, source: 'flag' });
  if (env.CHARMING_PROFILE) return validated({ name: env.CHARMING_PROFILE, source: 'env' });
  const project = await findProjectConfig(boundaries(request, env));
  if (project?.profile) return { name: project.profile, path: project.path, source: 'project' };
  if (store.selected) return validated({ name: store.selected, source: 'home' });
  return { name: DEFAULT_PROFILE, source: 'default' };
}

function describeSelection(selection: Selection | undefined): string {
  if (selection?.source === 'flag') return '--profile';
  if (selection?.source === 'env') return 'CHARMING_PROFILE';
  if (selection?.source === 'project') return selection.path ?? 'the project config';
  return 'your user config';
}

function validated(selection: Selection): Selection {
  validateProfileName(selection.name);
  return selection;
}

function originOverride(
  request: SessionRequest,
  env: NodeJS.ProcessEnv,
): { origin: string; source: 'env' | 'flag' } | undefined {
  if (request.baseUrl) return { origin: normalizeOrigin(request.baseUrl), source: 'flag' };
  if (env.CHARMING_BASE_URL)
    return { origin: normalizeOrigin(env.CHARMING_BASE_URL), source: 'env' };
  return undefined;
}

function matchOrigin(
  selection: Selection,
  override: { origin: string; source: 'env' | 'flag' } | undefined,
  store: Store,
  lenient: boolean,
): Selection | undefined {
  const saved = store.profiles[selection.name];
  if (!override || saved?.origin === override.origin) return selection;
  const onOrigin = Object.keys(store.profiles)
    .filter((name) => store.profiles[name].origin === override.origin)
    .sort();
  if (!saved && (selection.source !== 'default' || onOrigin.length === 0)) return selection;
  const flag = override.source === 'flag' ? '--base-url' : 'CHARMING_BASE_URL';
  const choices =
    onOrigin.length > 0 ? ` Saved profiles for that origin: ${onOrigin.join(', ')}.` : '';
  if (lenient) return undefined;
  if (saved && (selection.source === 'flag' || selection.source === 'env')) {
    throw new Error(
      `Profile ${selection.name} signs in to ${saved.origin}, but ${flag} is ${override.origin}. Drop ${flag}, pick a profile for that origin, or run \`charming auth login --profile NAME --base-url ${override.origin}\`.${choices}`,
    );
  }
  if (onOrigin.length > 1) {
    throw new Error(
      `Several profiles sign in to ${override.origin}: ${onOrigin.join(', ')}. Pass --profile NAME to pick one.`,
    );
  }
  return onOrigin.length === 1 ? { name: onOrigin[0], source: 'origin' } : undefined;
}

function loginName(override: { origin: string } | undefined, store: Store): string {
  if (!store.profiles[DEFAULT_PROFILE]) return DEFAULT_PROFILE;
  return originProfileName(override?.origin ?? PRODUCTION_BASE_URL, store.profiles);
}

function overrideToken(
  request: SessionRequest,
  env: NodeJS.ProcessEnv,
  origin: string,
): Pick<Session, 'token' | 'tokenSource'> | undefined {
  if (request.token) return { token: request.token, tokenSource: 'flag' };
  if (origin !== PRODUCTION_BASE_URL) return undefined;
  if (env.CHARMING_TOKEN) return { token: env.CHARMING_TOKEN, tokenSource: 'CHARMING_TOKEN' };
  if (env.BUILDY_USER_TOKEN) {
    return { token: env.BUILDY_USER_TOKEN, tokenSource: 'BUILDY_USER_TOKEN' };
  }
  return undefined;
}

async function legacyFallback(
  session: Session,
  options: { legacyTokenPath?: string },
): Promise<string | undefined> {
  if (session.origin !== PRODUCTION_BASE_URL) return undefined;
  if (session.profile !== undefined && session.profile !== DEFAULT_PROFILE) return undefined;
  try {
    const path = options.legacyTokenPath ?? join(homedir(), '.buildy', 'user-token');
    return (await readFile(path, 'utf8')).trim() || undefined;
  } catch (error) {
    if (isMissingFile(error)) return undefined;
    throw error;
  }
}

function requireProfile(session: Session): string {
  if (!session.profile) throw new Error('No profile selected. Pass --profile NAME.');
  return session.profile;
}

function boundaries(
  request: { cwd?: string },
  env: NodeJS.ProcessEnv,
): { cwd: string; home: string } {
  return { cwd: request.cwd ?? process.cwd(), home: env.HOME ?? homedir() };
}
