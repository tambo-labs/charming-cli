import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

import { captureOutput } from '@oclif/test';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { main } from './cli.js';
import { PRODUCTION_BASE_URL } from './config.js';

const PREVIEW = 'https://preview.example';
const APP_ID = '00000000-0000-4000-8000-000000000001';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

type Machine = { configDir: string; home: string; repo: string };

async function machine(state: { config?: unknown; credentials?: unknown } = {}): Promise<Machine> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'charming-profiles-')));
  const home = join(root, 'home');
  const configDir = join(root, 'config');
  const repo = join(home, 'repo');
  await mkdir(join(repo, '.git'), { recursive: true });
  if (state.config) await writeJson(join(configDir, 'config.json'), state.config);
  if (state.credentials) await writeJson(join(configDir, 'credentials.json'), state.credentials);
  vi.stubEnv('HOME', home);
  vi.stubEnv('CHARMING_CONFIG_DIR', configDir);
  vi.stubEnv('CHARMING_PROFILE', '');
  vi.stubEnv('CHARMING_BASE_URL', '');
  vi.stubEnv('CHARMING_TOKEN', '');
  vi.stubEnv('BUILDY_USER_TOKEN', '');
  return { configDir, home, repo };
}

function signedIn(
  profiles: Record<string, string>,
  selected?: string,
): {
  config: unknown;
  credentials: unknown;
} {
  return {
    config: {
      ...(selected ? { profile: selected } : {}),
      profiles: Object.fromEntries(
        Object.entries(profiles).map(([name, origin]) => [name, { origin }]),
      ),
    },
    credentials: {
      profiles: Object.fromEntries(
        Object.keys(profiles).map((name) => [name, { token: `chrm_user_${name}` }]),
      ),
    },
  };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, typeof value === 'string' ? value : JSON.stringify(value));
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8'));
}

function appsFetch() {
  return vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ apps: [] }));
}

function authorizations(fetchImpl: ReturnType<typeof appsFetch>): Array<string | null> {
  return fetchImpl.mock.calls.map(([, init]) => new Headers(init?.headers).get('Authorization'));
}

async function authorizationFor(args: string[], cwd: string): Promise<string | null> {
  const fetchImpl = appsFetch();
  const result = await captureOutput(() => main(['apps', 'list', ...args], { cwd, fetchImpl }));
  expect(result.stderr).toBe('');
  return authorizations(fetchImpl)[0] ?? null;
}

async function runCli(args: string[], cwd: string): Promise<{ stderr: string; stdout: string }> {
  return promisify(execFile)(
    process.execPath,
    [join(import.meta.dirname, '../bin/run.js'), ...args],
    {
      cwd,
    },
  );
}

async function output(args: string[], cwd: string): Promise<unknown> {
  const { stderr, stdout } = await runCli(args, cwd);
  expect(stderr).toBe('');
  return JSON.parse(stdout);
}

async function login(args: string[], cwd: string, token: string): Promise<number> {
  vi.useFakeTimers();
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  const fetchImpl = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({
        device_code: 'chrm_pair_device',
        expires_in: 600,
        polling_interval: 1,
        user_code: 'CHRM-ABC234',
        verification_url: `${PRODUCTION_BASE_URL}/pair`,
      }),
    )
    .mockResolvedValueOnce(Response.json({ status: 'approved', token }));
  const running = main(['auth', 'login', '--no-open', ...args], { cwd, fetchImpl });
  await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
  await vi.advanceTimersByTimeAsync(1_000);
  const code = await running;
  vi.useRealTimers();
  vi.restoreAllMocks();
  return code;
}

describe('profile selection', () => {
  test('resolves flag, then CHARMING_PROFILE, then project, then user config, then default', async () => {
    const { repo } = await machine(
      signedIn(
        {
          default: PRODUCTION_BASE_URL,
          fromEnv: PRODUCTION_BASE_URL,
          fromFlag: PRODUCTION_BASE_URL,
          fromHome: PRODUCTION_BASE_URL,
          fromProject: PRODUCTION_BASE_URL,
        },
        'fromHome',
      ),
    );
    await writeJson(join(repo, '.config', 'charming.json'), { profile: 'fromProject' });
    vi.stubEnv('CHARMING_PROFILE', 'fromEnv');

    expect(await authorizationFor(['--profile', 'fromFlag'], repo)).toBe(
      'Bearer chrm_user_fromFlag',
    );
    expect(await authorizationFor([], repo)).toBe('Bearer chrm_user_fromEnv');
    vi.stubEnv('CHARMING_PROFILE', '');
    expect(await authorizationFor([], repo)).toBe('Bearer chrm_user_fromProject');
    const outside = await mkdtemp(join(tmpdir(), 'charming-no-project-'));
    expect(await authorizationFor([], outside)).toBe('Bearer chrm_user_fromHome');
    expect(await output(['profile', 'use', 'default'], outside)).toMatchObject({
      profile: 'default',
    });
    expect(await authorizationFor([], outside)).toBe('Bearer chrm_user_default');
  });

  test('reads .charming/config.json and walks up from a nested directory', async () => {
    const { repo } = await machine(
      signedIn({ default: PRODUCTION_BASE_URL, work: PRODUCTION_BASE_URL }),
    );
    await writeJson(join(repo, '.charming', 'config.json'), { profile: 'work' });
    const nested = join(repo, 'packages', 'app', 'src');
    await mkdir(nested, { recursive: true });

    expect(await authorizationFor([], nested)).toBe('Bearer chrm_user_work');
    expect(await output(['profile', 'current'], nested)).toEqual({
      origin: PRODUCTION_BASE_URL,
      originSource: 'profile',
      path: join(repo, '.charming', 'config.json'),
      profile: 'work',
      saved: true,
      source: 'project',
    });
  });

  test('uses the nearest project file without merging a farther one', async () => {
    const { repo } = await machine(
      signedIn({ outer: PRODUCTION_BASE_URL, work: PRODUCTION_BASE_URL }),
    );
    await writeJson(join(repo, '.config', 'charming.json'), { profile: 'outer' });
    const nested = join(repo, 'apps', 'site');
    await writeJson(join(nested, '.config', 'charming.json'), '{ "$schema": "x" }');

    expect(await output(['profile', 'current'], nested)).toEqual({
      origin: PRODUCTION_BASE_URL,
      originSource: 'default',
      profile: 'default',
      saved: false,
      source: 'default',
    });
  });

  test('stops at the git root and ignores project files outside a git repository', async () => {
    const { home, repo } = await machine(
      signedIn({ default: PRODUCTION_BASE_URL, work: PRODUCTION_BASE_URL }),
    );
    await writeJson(join(home, '.config', 'charming.json'), { profile: 'work' });
    await writeJson(join(dirname(home), '.config', 'charming.json'), { profile: 'work' });
    const scratch = join(home, 'scratch', 'notes');
    await writeJson(join(scratch, '.config', 'charming.json'), { profile: 'work' });

    expect(await authorizationFor([], repo)).toBe('Bearer chrm_user_default');
    expect(await authorizationFor([], scratch)).toBe('Bearer chrm_user_default');
    const refused = await captureOutput(() =>
      main(['profile', 'use', 'work', '--project'], { cwd: scratch }),
    );
    expect(refused.result).toBe(2);
    expect(refused.stderr).toContain('inside a git repository');
  });

  test('refuses a directory with both project files', async () => {
    const { repo } = await machine(signedIn({ work: PRODUCTION_BASE_URL }));
    await writeJson(join(repo, '.config', 'charming.json'), { profile: 'work' });
    await writeJson(join(repo, '.charming', 'config.json'), { profile: 'work' });
    const fetchImpl = appsFetch();

    const result = await captureOutput(() => main(['apps', 'list'], { cwd: repo, fetchImpl }));

    expect(result.result).toBe(2);
    expect(result.stderr).toContain('Keep .config/charming.json and delete .charming/config.json');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test.each([
    [{ profile: 'work', token: 'chrm_user_leaked' }],
    [{ profile: 'work', env: { KEY: 'chrm_user_leaked' } }],
  ])('refuses a project file that carries a credential: %j', async (content) => {
    const { repo } = await machine(signedIn({ work: PRODUCTION_BASE_URL }));
    await writeJson(join(repo, '.config', 'charming.json'), content);
    const fetchImpl = appsFetch();

    const result = await captureOutput(() => main(['apps', 'list'], { cwd: repo, fetchImpl }));

    expect(result.result).toBe(2);
    expect(result.stderr).toContain('charming auth login --profile NAME');
    expect(result.stderr).not.toContain('chrm_user_leaked');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('refuses an origin in a project file', async () => {
    const { repo } = await machine();
    await writeJson(join(repo, '.config', 'charming.json'), { origin: PREVIEW });

    const result = await captureOutput(() => main(['profile', 'current'], { cwd: repo }));

    expect(result.result).toBe(2);
    expect(result.stderr).toContain('unsupported keys: origin');
  });

  test('reads JSONC and reports a syntax error with its line and column', async () => {
    const { repo } = await machine(signedIn({ work: PRODUCTION_BASE_URL }));
    const path = join(repo, '.config', 'charming.json');
    await writeJson(path, '{\n  // the team account\n  "profile": "work",\n}\n');
    expect(await authorizationFor([], repo)).toBe('Bearer chrm_user_work');

    await writeJson(path, '{\n  "profile": "work"\n  "extra": 1\n}\n');
    const result = await captureOutput(() => main(['profile', 'current'], { cwd: repo }));
    expect(result.result).toBe(2);
    expect(result.stderr).toContain(`${path}:3:3`);
  });

  test('fails before any request when the selected profile is not saved here', async () => {
    const { repo } = await machine({
      ...signedIn({ default: PRODUCTION_BASE_URL }),
      credentials: {
        profiles: { default: { token: 'chrm_user_default' } },
        apps: { [PRODUCTION_BASE_URL]: { [APP_ID]: 'chrm_app_saved' } },
      },
    });
    await writeJson(join(repo, '.config', 'charming.json'), { profile: 'team' });
    const fetchImpl = appsFetch();

    const calls = [];
    for (const command of [
      ['apps', 'list'],
      ['apps', 'call', APP_ID, 'echo'],
      ['api', 'request', 'get-app-source', '--param', `id=${APP_ID}`],
      ['auth', 'status'],
      ['doctor'],
    ]) {
      calls.push(await captureOutput(() => main(command, { cwd: repo, fetchImpl })));
    }

    for (const call of calls) {
      expect(call.result).toBe(2);
      expect(call.stderr).toContain('charming auth login --profile team');
    }
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await output(['agent-context'], repo)).toMatchObject({ profile: 'team' });
    expect(await output(['api', 'list'], repo)).toEqual(expect.anything());
  });

  test('rejects an invalid profile name before starting device pairing', async () => {
    const { repo } = await machine();
    const fetchImpl = vi.fn<typeof fetch>();
    const result = await captureOutput(() =>
      main(['auth', 'login', '--profile', '../other', '--no-open'], { cwd: repo, fetchImpl }),
    );

    expect(result.result).toBe(2);
    expect(result.stderr).toContain('Profile names must start with a letter');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('an explicit token and the production environment token beat the selected profile', async () => {
    const { repo } = await machine(signedIn({ work: PRODUCTION_BASE_URL }, 'work'));

    expect(await authorizationFor(['--token', 'chrm_user_explicit'], repo)).toBe(
      'Bearer chrm_user_explicit',
    );
    vi.stubEnv('CHARMING_TOKEN', 'chrm_user_environment');
    expect(await authorizationFor(['--profile', 'work'], repo)).toBe(
      'Bearer chrm_user_environment',
    );
  });
});

describe('profile use', () => {
  test('selects a profile in the user config and refuses one that is not saved', async () => {
    const { configDir, repo } = await machine(signedIn({ work: PRODUCTION_BASE_URL }));

    expect(await output(['profile', 'use', 'work'], repo)).toEqual({
      current: expect.objectContaining({ profile: 'work', source: 'home' }),
      path: join(configDir, 'config.json'),
      profile: 'work',
    });
    const refused = await captureOutput(() => main(['profile', 'use', 'nosuch'], { cwd: repo }));

    expect(refused.result).toBe(2);
    expect(refused.stderr).toContain('charming auth login --profile nosuch');
    expect(await readJson(join(configDir, 'config.json'))).toMatchObject({ profile: 'work' });
  });

  test('reports when a project file still overrides the new user selection', async () => {
    const { repo } = await machine(
      signedIn({ team: PRODUCTION_BASE_URL, work: PRODUCTION_BASE_URL }),
    );
    await writeJson(join(repo, '.config', 'charming.json'), { profile: 'team' });

    expect(await output(['profile', 'use', 'work'], repo)).toMatchObject({
      current: { path: join(repo, '.config', 'charming.json'), profile: 'team', source: 'project' },
      profile: 'work',
    });
  });

  test('--project creates .config/charming.json at the git root', async () => {
    const { repo } = await machine(signedIn({ work: PRODUCTION_BASE_URL }));
    const nested = join(repo, 'src');
    await mkdir(nested);

    expect(await output(['profile', 'use', 'work', '--project'], nested)).toEqual({
      current: expect.objectContaining({ profile: 'work', source: 'project' }),
      path: join(repo, '.config', 'charming.json'),
      profile: 'work',
    });
    expect(await readJson(join(repo, '.config', 'charming.json'))).toEqual({ profile: 'work' });
  });

  test('--project edits the existing project file and keeps its comments', async () => {
    const { repo } = await machine(
      signedIn({ personal: PRODUCTION_BASE_URL, work: PRODUCTION_BASE_URL }),
    );
    const path = join(repo, '.charming', 'config.json');
    await writeJson(path, '{\n    // shared by the team\n    "profile": "personal", // keep\n}\n');

    await output(['profile', 'use', 'work', '--project'], repo);

    expect(await readFile(path, 'utf8')).toBe(
      '{\n    // shared by the team\n    "profile": "work", // keep\n}\n',
    );
    expect(await authorizationFor([], repo)).toBe('Bearer chrm_user_work');
  });
});

describe('profile list', () => {
  test('shows each profile with its origin and the selection source, never a token', async () => {
    const { repo } = await machine({
      config: {
        profile: 'default',
        profiles: {
          default: { origin: PRODUCTION_BASE_URL },
          local: { origin: 'http://localhost:3000' },
          work: { origin: PRODUCTION_BASE_URL },
        },
      },
      credentials: {
        profiles: { default: { token: 'chrm_user_default' }, work: { token: 'chrm_user_work' } },
      },
    });
    await writeJson(join(repo, '.config', 'charming.json'), { profile: 'work' });

    const { stdout } = await runCli(['profile', 'list'], repo);

    expect(stdout).not.toContain('chrm_');
    expect(JSON.parse(stdout)).toEqual({
      current: {
        origin: PRODUCTION_BASE_URL,
        originSource: 'profile',
        path: join(repo, '.config', 'charming.json'),
        profile: 'work',
        saved: true,
        source: 'project',
      },
      profiles: [
        { name: 'default', origin: PRODUCTION_BASE_URL, selected: false, signedIn: true },
        { name: 'local', origin: 'http://localhost:3000', selected: false, signedIn: false },
        { name: 'work', origin: PRODUCTION_BASE_URL, selected: true, signedIn: true },
      ],
    });
  });
});

describe('auth login', () => {
  test('creates the default profile on first login without selecting it', async () => {
    const { configDir, repo } = await machine();

    expect(await login([], repo, 'chrm_user_first')).toBe(0);

    expect(await readJson(join(configDir, 'config.json'))).toEqual({
      profiles: { default: { origin: PRODUCTION_BASE_URL } },
    });
    expect(await readJson(join(configDir, 'credentials.json'))).toEqual({
      profiles: { default: { token: 'chrm_user_first' } },
    });
    expect((await stat(join(configDir, 'credentials.json'))).mode & 0o777).toBe(0o600);
    expect((await stat(configDir)).mode & 0o777).toBe(0o700);
  });

  test('--profile saves and selects a second account without touching the first', async () => {
    const { configDir, repo } = await machine(signedIn({ default: PRODUCTION_BASE_URL }));

    expect(await login(['--profile', 'work'], repo, 'chrm_user_work')).toBe(0);

    expect(await readJson(join(configDir, 'config.json'))).toEqual({
      profile: 'work',
      profiles: {
        default: { origin: PRODUCTION_BASE_URL },
        work: { origin: PRODUCTION_BASE_URL },
      },
    });
    expect(await authorizationFor([], repo)).toBe('Bearer chrm_user_work');
    expect(await authorizationFor(['--profile', 'default'], repo)).toBe('Bearer chrm_user_default');
  });

  test('a login with no flag refreshes the selected profile', async () => {
    const { configDir, repo } = await machine(
      signedIn({ default: PRODUCTION_BASE_URL, work: PRODUCTION_BASE_URL }, 'work'),
    );

    expect(await login([], repo, 'chrm_user_work-refreshed')).toBe(0);

    expect(await readJson(join(configDir, 'credentials.json'))).toEqual({
      profiles: {
        default: { token: 'chrm_user_default' },
        work: { token: 'chrm_user_work-refreshed' },
      },
    });
  });

  test('a project-selected profile is created with the current origin and not selected in the user config', async () => {
    const { configDir, repo } = await machine();
    await writeJson(join(repo, '.config', 'charming.json'), { profile: 'team' });

    expect(await login(['--base-url', 'http://localhost:3000'], repo, 'chrm_user_team')).toBe(0);

    expect(await readJson(join(configDir, 'config.json'))).toEqual({
      profiles: { team: { origin: 'http://localhost:3000' } },
    });
  });
});

describe('--base-url and a profile on another origin', () => {
  test('an explicit profile on another origin fails before any request', async () => {
    const { repo } = await machine(
      signedIn({ local: 'http://localhost:3000', work: PRODUCTION_BASE_URL }),
    );
    const fetchImpl = appsFetch();

    const result = await captureOutput(() =>
      main(['apps', 'list', '--profile', 'work', '--base-url', 'http://localhost:3000/'], {
        cwd: repo,
        fetchImpl,
      }),
    );

    expect(result.result).toBe(2);
    expect(result.stderr).toContain(
      `Profile work signs in to ${PRODUCTION_BASE_URL}, but --base-url is http://localhost:3000`,
    );
    expect(result.stderr).toContain('Saved profiles for that origin: local');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('an ambient selection yields to the one profile saved on the override origin', async () => {
    const { repo } = await machine(
      signedIn({ default: PRODUCTION_BASE_URL, local: 'http://localhost:3000' }),
    );
    vi.stubEnv('CHARMING_BASE_URL', 'http://localhost:3000');
    const fetchImpl = appsFetch();

    expect(await main(['apps', 'list'], { cwd: repo, fetchImpl })).toBe(0);

    expect(fetchImpl.mock.calls[0]?.[0]).toBe('http://localhost:3000/app');
    expect(authorizations(fetchImpl)).toEqual(['Bearer chrm_user_local']);
    expect(await output(['profile', 'current'], repo)).toMatchObject({
      origin: 'http://localhost:3000',
      originSource: 'env',
      profile: 'local',
      source: 'origin',
    });
  });

  test('with no profile on the override origin, create pairs anonymously and saves an app token there', async () => {
    const { configDir, repo } = await machine(signedIn({ default: PRODUCTION_BASE_URL }));
    const bundle = await mkdtemp(join(tmpdir(), 'charming-profile-app-'));
    await writeFile(join(bundle, 'module.js'), 'export default {}');
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ id: APP_ID, token: 'chrm_app_local' }));

    const result = await captureOutput(() =>
      main(['apps', 'create', bundle, '--base-url', 'http://localhost:3000'], {
        cwd: repo,
        fetchImpl,
      }),
    );

    expect(result.result).toBe(0);
    expect(authorizations(fetchImpl)).toEqual([null]);
    expect(await readJson(join(configDir, 'credentials.json'))).toEqual({
      profiles: { default: { token: 'chrm_user_default' } },
      apps: { 'http://localhost:3000': { [APP_ID]: 'chrm_app_local' } },
    });
  });

  test('CHARMING_PROFILE on another origin fails like --profile', async () => {
    const { repo } = await machine(
      signedIn({ local: 'http://localhost:3000', work: PRODUCTION_BASE_URL }),
    );
    vi.stubEnv('CHARMING_PROFILE', 'work');
    const fetchImpl = appsFetch();

    const result = await captureOutput(() =>
      main(['apps', 'list', '--base-url', 'http://localhost:3000'], { cwd: repo, fetchImpl }),
    );

    expect(result.result).toBe(2);
    expect(result.stderr).toContain(
      `Profile work signs in to ${PRODUCTION_BASE_URL}, but --base-url is http://localhost:3000`,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('an explicit token skips origin matching and never sends a saved token', async () => {
    const { repo } = await machine(
      signedIn({
        a: 'http://localhost:3000',
        b: 'http://localhost:3000',
        work: PRODUCTION_BASE_URL,
      }),
    );
    const fetchImpl = appsFetch();

    for (const args of [
      ['--profile', 'work', '--base-url', 'http://localhost:3000', '--token', 'chrm_user_explicit'],
      ['--base-url', 'http://localhost:3000', '--token', 'chrm_user_explicit'],
    ]) {
      const result = await captureOutput(() =>
        main(['apps', 'list', ...args], { cwd: repo, fetchImpl }),
      );
      expect(result.stderr).toBe('');
    }

    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      'http://localhost:3000/app',
      'http://localhost:3000/app',
    ]);
    expect(authorizations(fetchImpl)).toEqual([
      'Bearer chrm_user_explicit',
      'Bearer chrm_user_explicit',
    ]);
  });

  test('CHARMING_TOKEN stays on production when the selected profile is on localhost', async () => {
    const { repo } = await machine(signedIn({ local: 'http://localhost:3000' }, 'local'));
    vi.stubEnv('CHARMING_TOKEN', 'chrm_user_production');
    const fetchImpl = appsFetch();

    expect(await main(['apps', 'list'], { cwd: repo, fetchImpl })).toBe(0);

    expect(fetchImpl.mock.calls[0]?.[0]).toBe('http://localhost:3000/app');
    expect(authorizations(fetchImpl)).toEqual(['Bearer chrm_user_local']);
  });

  test('the sign-in hint keeps the origin override', async () => {
    const { repo } = await machine();

    const result = await captureOutput(() =>
      main(['apps', 'list', '--base-url', 'http://localhost:3000'], { cwd: repo }),
    );

    expect(result.result).toBe(2);
    expect(result.stderr).toContain('charming auth login --base-url http://localhost:3000');
  });

  test('several profiles on the override origin ask for --profile', async () => {
    const { repo } = await machine(
      signedIn({ a: PREVIEW, b: PREVIEW, default: PRODUCTION_BASE_URL }),
    );
    const fetchImpl = appsFetch();

    const result = await captureOutput(() =>
      main(['apps', 'list', '--base-url', PREVIEW], { cwd: repo, fetchImpl }),
    );

    expect(result.result).toBe(2);
    expect(result.stderr).toContain(`Several profiles sign in to ${PREVIEW}: a, b`);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('a login on a new origin saves an origin-named profile and keeps the default', async () => {
    const { configDir, repo } = await machine(signedIn({ default: PRODUCTION_BASE_URL }));

    expect(await login(['--base-url', 'http://localhost:3000'], repo, 'chrm_user_local')).toBe(0);

    expect(await readJson(join(configDir, 'config.json'))).toEqual({
      profiles: {
        default: { origin: PRODUCTION_BASE_URL },
        'localhost-3000': { origin: 'http://localhost:3000' },
      },
    });
    expect(await authorizationFor(['--base-url', 'http://localhost:3000'], repo)).toBe(
      'Bearer chrm_user_local',
    );
    expect(await authorizationFor([], repo)).toBe('Bearer chrm_user_default');
  });
});

describe('auth logout', () => {
  test('a named profile logout keeps other profiles and app tokens and returns to default', async () => {
    const { configDir, repo } = await machine({
      config: {
        profile: 'work',
        profiles: {
          default: { origin: PRODUCTION_BASE_URL },
          demo: { origin: PRODUCTION_BASE_URL },
          work: { origin: PRODUCTION_BASE_URL },
        },
      },
      credentials: {
        profiles: {
          default: { token: 'chrm_user_default' },
          demo: { token: 'chrm_user_demo' },
          work: { token: 'chrm_user_work' },
        },
        apps: { [PRODUCTION_BASE_URL]: { [APP_ID]: 'chrm_app_saved' } },
      },
    });

    expect(await output(['auth', 'logout'], repo)).toEqual({
      appTokensRemoved: 0,
      authenticated: false,
      profile: 'work',
    });

    expect(await readJson(join(configDir, 'credentials.json'))).toEqual({
      profiles: { default: { token: 'chrm_user_default' }, demo: { token: 'chrm_user_demo' } },
      apps: { [PRODUCTION_BASE_URL]: { [APP_ID]: 'chrm_app_saved' } },
    });
    expect(await authorizationFor([], repo)).toBe('Bearer chrm_user_default');
  });

  test('logging out a profile that is not selected keeps the selection', async () => {
    const { configDir, repo } = await machine(
      signedIn({ demo: PRODUCTION_BASE_URL, work: PRODUCTION_BASE_URL }, 'work'),
    );

    expect(await output(['auth', 'logout', '--profile', 'demo'], repo)).toEqual({
      appTokensRemoved: 0,
      authenticated: false,
      profile: 'demo',
    });

    expect(await readJson(join(configDir, 'config.json'))).toEqual({
      profile: 'work',
      profiles: { work: { origin: PRODUCTION_BASE_URL } },
    });
  });

  test('a default logout also removes the app tokens for its origin', async () => {
    const { configDir, repo } = await machine({
      ...signedIn({ default: PRODUCTION_BASE_URL, work: PRODUCTION_BASE_URL }),
      credentials: {
        profiles: { default: { token: 'chrm_user_default' }, work: { token: 'chrm_user_work' } },
        apps: {
          [PRODUCTION_BASE_URL]: { [APP_ID]: 'chrm_app_production' },
          [PREVIEW]: { [APP_ID]: 'chrm_app_preview' },
        },
      },
    });

    expect(await output(['auth', 'logout'], repo)).toEqual({
      appTokensRemoved: 1,
      authenticated: false,
      profile: 'default',
    });
    expect(await readJson(join(configDir, 'credentials.json'))).toEqual({
      profiles: { work: { token: 'chrm_user_work' } },
      apps: { [PREVIEW]: { [APP_ID]: 'chrm_app_preview' } },
    });
  });
});

describe('upgrading from the single-file config', () => {
  test('a machine signed in only to a local server keeps working and moves its token on the first save', async () => {
    const { configDir, repo } = await machine({
      config: { tokens: { 'http://localhost:3000/': 'chrm_user_local' } },
    });
    vi.stubEnv('CHARMING_BASE_URL', 'http://localhost:3000');
    const local = appsFetch();

    expect(await main(['apps', 'list'], { cwd: repo, fetchImpl: local })).toBe(0);
    expect(local.mock.calls[0]?.[0]).toBe('http://localhost:3000/app');
    expect(authorizations(local)).toEqual(['Bearer chrm_user_local']);

    vi.stubEnv('CHARMING_BASE_URL', '');
    const production = appsFetch();
    await captureOutput(() => main(['apps', 'list'], { cwd: repo, fetchImpl: production }));
    expect(production).not.toHaveBeenCalled();

    await output(['profile', 'use', 'localhost-3000'], repo);
    expect(await readJson(join(configDir, 'config.json'))).toEqual({
      profile: 'localhost-3000',
      profiles: { 'localhost-3000': { origin: 'http://localhost:3000' } },
    });
    expect(await readJson(join(configDir, 'credentials.json'))).toEqual({
      profiles: { 'localhost-3000': { token: 'chrm_user_local' } },
    });
  });
});

describe('agent context', () => {
  test('describes the profile flag, environment, project files, and precedence', async () => {
    const { repo } = await machine();

    const { stdout } = await runCli(['agent-context'], repo);
    const context = JSON.parse(stdout);

    expect(context.auth.environment).toEqual(
      expect.arrayContaining(['CHARMING_PROFILE', 'CHARMING_CONFIG_DIR']),
    );
    expect(context.profiles).toMatchObject({
      flag: '--profile NAME',
      projectFiles: ['.config/charming.json', '.charming/config.json'],
    });
    expect(context.profiles.precedence[0]).toBe('--profile NAME');
    expect(context.commands.profile).toEqual(['list', 'current', 'use']);
  });
});
