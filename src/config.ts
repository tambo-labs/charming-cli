import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

type ConfigOptions = {
  baseUrl?: string;
  configDir?: string;
  env?: NodeJS.ProcessEnv;
  legacyTokenPath?: string;
};

export type ResolvedToken = {
  fallbackSource?: 'legacy';
  source?: 'BUILDY_USER_TOKEN' | 'CHARMING_TOKEN' | 'config' | 'legacy';
  token?: string;
};

type Config = {
  appTokens?: Record<string, string>;
  token?: string;
  tokens?: Record<string, string>;
};

export const PRODUCTION_BASE_URL = 'https://charm.ing';

function defaultConfigDirectory(env: NodeJS.ProcessEnv): string {
  return env.XDG_CONFIG_HOME
    ? join(env.XDG_CONFIG_HOME, 'charming')
    : join(homedir(), '.config', 'charming');
}

function configPath(options: ConfigOptions): string {
  return join(
    options.configDir ?? defaultConfigDirectory(options.env ?? process.env),
    'config.json',
  );
}

export async function loadToken(options: ConfigOptions = {}): Promise<string | undefined> {
  return (await resolveToken(options)).token;
}

export async function resolveToken(options: ConfigOptions = {}): Promise<ResolvedToken> {
  const env = options.env ?? process.env;
  if (baseUrl(options) === PRODUCTION_BASE_URL) {
    if (env.CHARMING_TOKEN) return { source: 'CHARMING_TOKEN', token: env.CHARMING_TOKEN };
    if (env.BUILDY_USER_TOKEN) return { source: 'BUILDY_USER_TOKEN', token: env.BUILDY_USER_TOKEN };
  }

  const parsed = await readConfig(options);
  const scoped = parsed.tokens?.[baseUrl(options)];
  if (typeof scoped === 'string' && scoped.length > 0) return { source: 'config', token: scoped };
  const saved =
    baseUrl(options) === PRODUCTION_BASE_URL &&
    typeof parsed.token === 'string' &&
    parsed.token.length > 0
      ? parsed.token
      : undefined;
  if (baseUrl(options) !== PRODUCTION_BASE_URL) return {};
  const legacy = await readLegacyToken(options);
  if (saved)
    return {
      fallbackSource: legacy ? 'legacy' : undefined,
      source: 'config',
      token: saved,
    };
  return legacy ? { source: 'legacy', token: legacy } : {};
}

export async function saveToken(token: string, options: ConfigOptions = {}): Promise<void> {
  const config = await readConfig(options);
  if (baseUrl(options) === PRODUCTION_BASE_URL) {
    config.token = token;
  } else {
    config.tokens = { ...config.tokens, [baseUrl(options)]: token };
  }
  await writeConfig(config, options);
}

export async function loadAppToken(
  appId: string,
  options: ConfigOptions = {},
): Promise<string | undefined> {
  const appTokens = (await readConfig(options)).appTokens;
  return (
    appTokens?.[appTokenKey(appId, options)] ??
    (baseUrl(options) === PRODUCTION_BASE_URL ? appTokens?.[appId] : undefined)
  );
}

export async function saveAppToken(
  appId: string,
  token: string,
  options: ConfigOptions = {},
): Promise<void> {
  const config = await readConfig(options);
  config.appTokens = { ...config.appTokens, [appTokenKey(appId, options)]: token };
  await writeConfig(config, options);
}

async function readConfig(options: ConfigOptions): Promise<Config> {
  try {
    return JSON.parse(await readFile(configPath(options), 'utf8')) as Config;
  } catch (error) {
    if (isMissingFile(error)) return {};
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in ${configPath(options)}. Fix or remove that file.`, {
        cause: error,
      });
    }
    throw error;
  }
}

async function writeConfig(config: Config, options: ConfigOptions): Promise<void> {
  const path = configPath(options);
  await mkdir(dirname(path), { mode: 0o700, recursive: true });
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  await chmod(path, 0o600);
}

export async function removeCredentials(
  options: ConfigOptions = {},
): Promise<{ appTokensRemoved: number }> {
  const config = await readConfig(options);
  const selectedBaseUrl = baseUrl(options);
  let appTokensRemoved = 0;
  if (selectedBaseUrl === PRODUCTION_BASE_URL) {
    delete config.token;
  }
  if (config.tokens) {
    delete config.tokens[selectedBaseUrl];
    if (Object.keys(config.tokens).length === 0) delete config.tokens;
  }
  if (config.appTokens) {
    config.appTokens = Object.fromEntries(
      Object.entries(config.appTokens).filter(([key]) => {
        const remove =
          key.startsWith(`${selectedBaseUrl}|`) ||
          (selectedBaseUrl === PRODUCTION_BASE_URL && !key.includes('|'));
        if (remove) appTokensRemoved += 1;
        return !remove;
      }),
    );
    if (Object.keys(config.appTokens).length === 0) delete config.appTokens;
  }
  if (Object.keys(config).length === 0) {
    await rm(configPath(options), { force: true });
    return { appTokensRemoved };
  }
  await writeConfig(config, options);
  return { appTokensRemoved };
}

function baseUrl(options: ConfigOptions): string {
  return (options.baseUrl ?? PRODUCTION_BASE_URL).replace(/\/+$/, '');
}

function appTokenKey(appId: string, options: ConfigOptions): string {
  return `${baseUrl(options)}|${appId}`;
}

function isMissingFile(error: unknown): boolean {
  return (
    error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

async function readLegacyToken(options: ConfigOptions): Promise<string | undefined> {
  try {
    const token = (
      await readFile(options.legacyTokenPath ?? join(homedir(), '.buildy', 'user-token'), 'utf8')
    ).trim();
    return token || undefined;
  } catch (error) {
    if (isMissingFile(error)) return undefined;
    throw error;
  }
}
