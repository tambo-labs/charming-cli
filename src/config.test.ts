import { chmod, mkdtemp, readdir, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

import { loadAppToken, PRODUCTION_BASE_URL, resolveSession, saveAppToken } from './config.js';
import { type StoreOptions, updateStore } from './store.js';

const PREVIEW = 'https://preview.example';
const TRIGGER = { ['https://trigger.example']: { app: 'chrm_app_trigger' } };

type Options = StoreOptions & { configDir: string; cwd: string; legacyTokenPath: string };

async function legacyStore(config: unknown, credentials?: unknown): Promise<Options> {
  const configDir = await mkdtemp(join(tmpdir(), 'charming-config-'));
  await writeFile(join(configDir, 'config.json'), JSON.stringify(config));
  if (credentials) {
    await writeFile(join(configDir, 'credentials.json'), JSON.stringify(credentials));
  }
  return {
    configDir,
    cwd: configDir,
    env: {},
    legacyTokenPath: join(configDir, 'no-legacy-token'),
  };
}

async function readOptional(path: string): Promise<string | undefined> {
  return readFile(path, 'utf8').catch(() => undefined);
}

async function persisted(options: Options): Promise<{ config: unknown; credentials: unknown }> {
  await saveAppToken('https://trigger.example', 'app', 'chrm_app_trigger', options);
  const config = await readOptional(join(options.configDir, 'config.json'));
  const credentials = JSON.parse(
    await readFile(join(options.configDir, 'credentials.json'), 'utf8'),
  ) as { apps: Record<string, unknown> };
  delete credentials.apps['https://trigger.example'];
  if (Object.keys(credentials.apps).length === 0) delete (credentials as { apps?: unknown }).apps;
  return { config: config === undefined ? undefined : JSON.parse(config), credentials };
}

describe('migrating the single-file config', () => {
  test.each([
    {
      name: 'a production token',
      legacy: { token: 'chrm_user_default' },
      config: { profiles: { default: { origin: PRODUCTION_BASE_URL } } },
      credentials: {
        profiles: { default: { token: 'chrm_user_default' } },
        apps: TRIGGER,
      },
    },
    {
      name: 'origin-scoped tokens, dropping a bare token that tokens[production] supersedes',
      legacy: {
        token: 'chrm_user_old',
        tokens: {
          [PRODUCTION_BASE_URL]: 'chrm_user_default',
          [`${PREVIEW}/`]: 'chrm_user_preview',
          'http://127.0.0.1:3000': 'chrm_user_loopback',
        },
      },
      config: {
        profiles: {
          default: { origin: PRODUCTION_BASE_URL },
          'host-127-0-0-1-3000': { origin: 'http://127.0.0.1:3000' },
          'preview-example': { origin: PREVIEW },
        },
      },
      credentials: {
        profiles: {
          default: { token: 'chrm_user_default' },
          'host-127-0-0-1-3000': { token: 'chrm_user_loopback' },
          'preview-example': { token: 'chrm_user_preview' },
        },
        apps: TRIGGER,
      },
    },
    {
      name: 'a token for a host too long for a profile name',
      legacy: { tokens: { [`https://${'a'.repeat(80)}.example`]: 'chrm_user_long' } },
      config: { profiles: { ['a'.repeat(64)]: { origin: `https://${'a'.repeat(80)}.example` } } },
      credentials: {
        profiles: { ['a'.repeat(64)]: { token: 'chrm_user_long' } },
        apps: TRIGGER,
      },
    },
    {
      name: 'unscoped and origin-scoped app tokens',
      legacy: {
        appTokens: {
          'app-1': 'chrm_app_bare',
          [`${PREVIEW}|app-2`]: 'chrm_app_preview',
        },
      },
      config: undefined,
      credentials: {
        apps: {
          [PRODUCTION_BASE_URL]: { 'app-1': 'chrm_app_bare' },
          [PREVIEW]: { 'app-2': 'chrm_app_preview' },
          ...TRIGGER,
        },
      },
    },
  ])(
    'moves $name into credentials.json on the first write',
    async ({ legacy, config, credentials }) => {
      const options = await legacyStore(legacy);
      const before = await readFile(join(options.configDir, 'config.json'), 'utf8');

      await resolveSession(options);
      expect(await readFile(join(options.configDir, 'config.json'), 'utf8')).toBe(before);

      await saveAppToken('https://trigger.example', 'app', 'chrm_app_trigger', options);
      const configText = await readOptional(join(options.configDir, 'config.json'));
      const credentialsPath = join(options.configDir, 'credentials.json');

      expect(configText === undefined ? undefined : JSON.parse(configText)).toEqual(config);
      expect(configText ?? '').not.toContain('chrm_');
      expect(JSON.parse(await readFile(credentialsPath, 'utf8'))).toEqual(credentials);
      expect((await stat(credentialsPath)).mode & 0o777).toBe(0o600);
    },
  );

  test('keeps an unscoped app token on production only', async () => {
    const options = await legacyStore({ appTokens: { 'app-1': 'chrm_app_production' } });

    await expect(loadAppToken(PRODUCTION_BASE_URL, 'app-1', options)).resolves.toBe(
      'chrm_app_production',
    );
    await expect(loadAppToken(PREVIEW, 'app-1', options)).resolves.toBeUndefined();
  });

  test('lets a token an older CLI wrote after migration win over the saved one', async () => {
    const options = await legacyStore(
      {
        profile: 'default',
        profiles: { default: { origin: PRODUCTION_BASE_URL } },
        token: 'chrm_user_newer',
        appTokens: { 'app-1': 'chrm_app_newer' },
      },
      {
        profiles: { default: { token: 'chrm_user_older' } },
        apps: { [PRODUCTION_BASE_URL]: { 'app-1': 'chrm_app_older' } },
      },
    );

    await expect(resolveSession(options)).resolves.toMatchObject({ token: 'chrm_user_newer' });
    expect(await persisted(options)).toEqual({
      config: { profile: 'default', profiles: { default: { origin: PRODUCTION_BASE_URL } } },
      credentials: {
        profiles: { default: { token: 'chrm_user_newer' } },
        apps: { [PRODUCTION_BASE_URL]: { 'app-1': 'chrm_app_newer' } },
      },
    });
  });

  test('saves a legacy production token beside a default that points elsewhere', async () => {
    const options = await legacyStore(
      { profiles: { default: { origin: 'http://localhost:3000' } }, token: 'chrm_user_production' },
      { profiles: { default: { token: 'chrm_user_local' } } },
    );

    expect(await persisted(options)).toEqual({
      config: {
        profiles: {
          'charm-ing': { origin: PRODUCTION_BASE_URL },
          default: { origin: 'http://localhost:3000' },
        },
      },
      credentials: {
        profiles: {
          'charm-ing': { token: 'chrm_user_production' },
          default: { token: 'chrm_user_local' },
        },
      },
    });
  });

  test('keeps a lone non-production token signed in when --base-url targets its origin', async () => {
    const options = await legacyStore({ tokens: { [PREVIEW]: 'chrm_user_preview' } });

    await expect(resolveSession({ ...options, baseUrl: PREVIEW })).resolves.toMatchObject({
      origin: PREVIEW,
      token: 'chrm_user_preview',
      tokenSource: 'credentials',
    });
  });
});

describe('the user config files', () => {
  test('keeps credentials and keys the CLI does not recognize', async () => {
    const options = await legacyStore(
      { editor: 'vim', profiles: { default: { origin: PRODUCTION_BASE_URL } } },
      {
        note: 'kept',
        profiles: { default: { token: 'chrm_user_default' }, lost: { token: 'chrm_user_lost' } },
      },
    );

    expect(await persisted(options)).toEqual({
      config: { editor: 'vim', profiles: { default: { origin: PRODUCTION_BASE_URL } } },
      credentials: {
        note: 'kept',
        profiles: { default: { token: 'chrm_user_default' }, lost: { token: 'chrm_user_lost' } },
      },
    });
    expect((await readdir(options.configDir)).sort()).toEqual(['config.json', 'credentials.json']);
  });

  test('leaves the permissions of a config directory it did not create', async () => {
    const options = await legacyStore({});
    await chmod(options.configDir, 0o755);

    await saveAppToken(PREVIEW, 'app', 'chrm_app_preview', options);

    expect((await stat(options.configDir)).mode & 0o777).toBe(0o755);
    expect((await stat(join(options.configDir, 'credentials.json'))).mode & 0o777).toBe(0o600);
  });

  test.each([
    [
      { profiles: { [PRODUCTION_BASE_URL]: { work: 'chrm_user_work' } } },
      undefined,
      `config.json: profile "${PRODUCTION_BASE_URL}" needs a valid name and an "origin" string`,
    ],
    [{}, { apps: { x: null } }, 'credentials.json: "apps.x" must be an object'],
    [
      {},
      { profiles: { work: 'chrm_user_work' } },
      'credentials.json: profile "work" needs a "token" string',
    ],
  ])('reports a malformed file clearly: %j %j', async (config, credentials, message) => {
    const options = await legacyStore(config, credentials);

    await expect(resolveSession(options)).rejects.toThrow(message);
  });
});

describe('credential resolution', () => {
  test('never sends a production environment token to another origin', async () => {
    const options = await legacyStore({});

    const session = await resolveSession({
      ...options,
      baseUrl: PREVIEW,
      env: { CHARMING_TOKEN: 'chrm_user_environment' },
    });

    expect(session.token).toBeUndefined();
  });

  test('falls back to the legacy ~/.buildy token for the default profile and reports it alongside a saved one', async () => {
    const options = await legacyStore({});
    const legacyTokenPath = join(options.configDir, 'legacy-token');
    await writeFile(legacyTokenPath, 'chrm_user_legacy\n');

    await expect(resolveSession({ ...options, legacyTokenPath })).resolves.toMatchObject({
      token: 'chrm_user_legacy',
      tokenSource: 'legacy',
    });

    await writeFile(
      join(options.configDir, 'config.json'),
      JSON.stringify({ token: 'chrm_user_saved' }),
    );
    await expect(resolveSession({ ...options, legacyTokenPath })).resolves.toMatchObject({
      legacyFallback: true,
      token: 'chrm_user_saved',
      tokenSource: 'credentials',
    });
  });

  test('reports invalid user config instead of replacing it', async () => {
    const options = await legacyStore({});
    await writeFile(join(options.configDir, 'config.json'), '{broken');

    await expect(resolveSession(options)).rejects.toThrow(
      `Invalid JSON in ${join(options.configDir, 'config.json')}`,
    );
  });
});

describe('credential writes', () => {
  test('concurrent writes keep every credential', async () => {
    const configDir = await mkdtemp(join(tmpdir(), 'charming-config-'));
    const appIds = Array.from({ length: 8 }, (_, index) => `app-${index}`);

    await Promise.all(
      appIds.map((appId) => saveAppToken(PREVIEW, appId, `chrm_app_${appId}`, { configDir })),
    );

    for (const appId of appIds) {
      expect(await loadAppToken(PREVIEW, appId, { configDir })).toBe(`chrm_app_${appId}`);
    }
    expect(await readdir(configDir)).toEqual(['credentials.json']);
  });

  test('takes over a lock left by a crashed command', async () => {
    const configDir = await mkdtemp(join(tmpdir(), 'charming-config-'));
    const lock = join(configDir, 'credentials.lock');
    await writeFile(lock, 'crashed-holder');
    const longAgo = new Date(Date.now() - 60_000);
    await utimes(lock, longAgo, longAgo);

    await saveAppToken(PREVIEW, 'app', 'chrm_app_after_crash', { configDir });

    expect(await loadAppToken(PREVIEW, 'app', { configDir })).toBe('chrm_app_after_crash');
    expect(await readdir(configDir)).toEqual(['credentials.json']);
  });

  test('waits for a live lock instead of taking it over', async () => {
    const configDir = await mkdtemp(join(tmpdir(), 'charming-config-'));
    const lock = join(configDir, 'credentials.lock');
    await writeFile(lock, 'live-holder');
    let saved = false;

    const pending = saveAppToken(PREVIEW, 'app', 'chrm_app_waited', { configDir }).then(() => {
      saved = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(saved).toBe(false);
    expect(await readFile(lock, 'utf8')).toBe('live-holder');

    await rm(lock);
    await pending;
    expect(await loadAppToken(PREVIEW, 'app', { configDir })).toBe('chrm_app_waited');
  });

  test('releases the lock when the change throws', async () => {
    const configDir = await mkdtemp(join(tmpdir(), 'charming-config-'));

    await expect(
      updateStore({ configDir }, () => {
        throw new Error('refused');
      }),
    ).rejects.toThrow('refused');

    expect(await readdir(configDir)).toEqual([]);
  });
});
