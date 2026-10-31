import { existsSync } from 'node:fs';
import {
  link,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test, vi } from 'vitest';

import type { CommandContext } from './commands.js';
import { devTarget, PULLED_STATE_PATH, pullLiveApp } from './dev-pull.js';
import { readAppPackage } from './files.js';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, rename: vi.fn(actual.rename) };
});

const APP_ID = '00000000-0000-4000-8000-000000000001';
const FILES = {
  'package.json': '{"name":"todo","charming":{"name":"Todo"}}',
  'server.js': 'export const routes = [];',
};

const directories: string[] = [];

afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

interface FakeOperation {
  readOnly: boolean;
  method?: 'GET' | 'POST';
  /** The response body; defaults to the `{ok: true, value}` envelope around `value`. */
  value?: unknown;
  body?: unknown;
  /** The HTTP status of the operation's answer; defaults to 200. */
  status?: number;
}

/** A fake Charming that serves the App's source, its descriptor, and one answer per operation. */
function liveApp(
  operations: Record<string, FakeOperation>,
  descriptorStatus = 200,
  files: Record<string, string> | null = FILES,
) {
  const calls: Array<{ method: string; path: string }> = [];
  const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const method = init?.method ?? 'GET';
    calls.push({ method, path: url.pathname });
    if (url.pathname === `/app/${APP_ID}/source`) {
      if (!files) {
        return Response.json(
          { ok: false, error: { kind: 'app_not_found', message: 'No such app.' } },
          { status: 404 },
        );
      }
      return Response.json({ ok: true, source: { files } });
    }
    if (url.pathname === `/app/${APP_ID}/agent.json`) {
      if (descriptorStatus !== 200) {
        return Response.json(
          { ok: false, error: { kind: 'app_not_found', message: 'No such app.' } },
          { status: descriptorStatus },
        );
      }
      return Response.json({
        operations: Object.entries(operations).map(([op, operation]) => ({
          op,
          method: operation.method ?? (operation.readOnly ? 'GET' : 'POST'),
          path: `/api/${op}`,
          readOnly: operation.readOnly,
          discoveredFrom: ['routes_export'],
        })),
      });
    }
    const operation = operations[url.pathname.split('/').at(-1) ?? ''];
    return Response.json(operation?.body ?? { ok: true, value: operation?.value }, {
      status: operation?.status ?? 200,
    });
  });
  const context: CommandContext = {
    options: {},
    session: {
      legacyFallback: false,
      origin: 'https://charming.test',
      originSource: 'flag',
      profileSource: 'origin',
      saved: false,
      token: 'chrm_user_fixture',
      tokenSource: 'flag',
    },
    fetchImpl,
  };
  return { context, calls };
}

async function emptyDirectory(): Promise<string> {
  const parent = await mkdtemp(join(tmpdir(), 'charming-dev-pull-'));
  directories.push(parent);
  return join(parent, 'app');
}

function live(directory: string) {
  const target = devTarget(APP_ID, { out: directory });
  if (target.kind !== 'live') throw new Error('expected a live target');
  return target;
}

describe('devTarget', () => {
  test('treats an App ID as a live App, and a directory as local', () => {
    expect(devTarget(APP_ID, {})).toMatchObject({ kind: 'live', appId: APP_ID, pullSource: true });
    expect(devTarget('./my-app', {})).toEqual({ kind: 'local', directory: './my-app' });
    expect(devTarget(undefined, {})).toEqual({ kind: 'local', directory: undefined });
  });

  test('pulls by ID whenever --out or --pull-data is given, even after an earlier pull', async () => {
    const directory = await emptyDirectory();
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'server.js'), 'edited locally');

    expect(devTarget(APP_ID, { out: directory, pullData: 'exportData' })).toMatchObject({
      kind: 'live',
      directory,
      pullSource: false,
    });
  });

  test.each([{ out: './x' }, { pullData: 'exportData' }])(
    'refuses %o without an App ID',
    (flags) => {
      expect(() => devTarget('./my-app', flags)).toThrow('--out and --pull-data need the ID');
    },
  );

  test('runs an existing directory named like an App ID locally, without pulling', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'charming-dev-pull-'));
    directories.push(parent);
    await mkdir(join(parent, APP_ID));
    await writeFile(join(parent, APP_ID, 'server.js'), 'edited locally');
    const cwd = process.cwd();
    process.chdir(parent);
    try {
      expect(devTarget(APP_ID, {})).toEqual({ kind: 'local', directory: APP_ID });
    } finally {
      process.chdir(cwd);
    }
  });

  test('pulls into an empty directory named like an App ID, as an interrupted pull leaves', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'charming-dev-pull-'));
    directories.push(parent);
    await mkdir(join(parent, APP_ID, '.charming-dev'), { recursive: true });
    const cwd = process.cwd();
    process.chdir(parent);
    try {
      expect(devTarget(APP_ID, {})).toMatchObject({
        kind: 'live',
        appId: APP_ID,
        directory: join(process.cwd(), APP_ID),
        pullSource: true,
      });
    } finally {
      process.chdir(cwd);
    }
  });

  test('refuses an empty --pull-data, which names no operation', () => {
    expect(() => devTarget(APP_ID, { pullData: '' })).toThrow(
      expect.objectContaining({
        kind: 'invalid_arguments',
        message: expect.stringContaining('--pull-data needs the name'),
      }),
    );
  });

  test('pulls into a directory that holds only hidden entries', async () => {
    const directory = await emptyDirectory();
    await mkdir(join(directory, '.git'), { recursive: true });
    await writeFile(join(directory, '.DS_Store'), '');

    expect(devTarget(APP_ID, { out: directory })).toMatchObject({ pullSource: true });
  });

  test('refuses an --out that is a file', async () => {
    const directory = await emptyDirectory();
    await mkdir(join(directory, '..'), { recursive: true });
    await writeFile(directory, 'not a directory');

    expect(() => devTarget(APP_ID, { out: directory })).toThrow(
      expect.objectContaining({
        kind: 'invalid_arguments',
        message: expect.stringContaining('is not a directory'),
      }),
    );
  });

  test('refuses --pull-data with --save-state, which would copy live data out of the private file', () => {
    expect(() => devTarget(APP_ID, { pullData: 'exportData', saveState: 'saved.json' })).toThrow(
      expect.objectContaining({
        kind: 'invalid_arguments',
        message: expect.stringContaining('Drop --save-state'),
      }),
    );
  });

  test.each([
    [APP_ID, { pullData: 'exportData' }],
    ['./my-app', { state: join('my-app', PULLED_STATE_PATH) }],
    ['./my-app', { saveState: join('my-app', PULLED_STATE_PATH) }],
    ['./my-app', { state: join('my-app', '.charming-dev', 'backup.json') }],
    ['./my-app', { saveState: join('my-app', '.charming-dev', 'old', 'state.json') }],
  ])('refuses --check on pulled data: %s %o', (argument, flags) => {
    expect(() => devTarget(argument, { ...flags, check: true })).toThrow(
      expect.objectContaining({
        kind: 'invalid_arguments',
        message: expect.stringContaining('never renders live data'),
      }),
    );
  });

  test.each([
    ['a symlink to .charming-dev', join('data', 'state.json')],
    ['a symlink to .charming-dev, under another file name', join('data', 'backup.json')],
    ['a case variant of .charming-dev', join('.CHARMING-DEV', 'state.json')],
  ])('refuses --check on pulled state named through %s', async (_label, named) => {
    const parent = await mkdtemp(join(tmpdir(), 'charming-dev-pull-'));
    directories.push(parent);
    await mkdir(join(parent, '.charming-dev'));
    await writeFile(join(parent, PULLED_STATE_PATH), '{}');
    await symlink(join(parent, '.charming-dev'), join(parent, 'data'));

    for (const flag of ['state', 'saveState'] as const) {
      expect(() => devTarget('./my-app', { [flag]: join(parent, named), check: true })).toThrow(
        expect.objectContaining({ kind: 'invalid_arguments' }),
      );
    }
  });

  test("refuses --check on a hard link to the App directory's pulled state", async () => {
    const parent = await mkdtemp(join(tmpdir(), 'charming-dev-pull-'));
    directories.push(parent);
    const app = join(parent, 'app');
    await mkdir(join(app, '.charming-dev'), { recursive: true });
    await writeFile(join(app, PULLED_STATE_PATH), '{}');
    await link(join(app, PULLED_STATE_PATH), join(parent, 'seed.json'));
    await writeFile(join(parent, 'written.json'), '{}');

    for (const flag of ['state', 'saveState'] as const) {
      expect(() => devTarget(app, { [flag]: join(parent, 'seed.json'), check: true })).toThrow(
        expect.objectContaining({ kind: 'invalid_arguments' }),
      );
      expect(devTarget(app, { [flag]: join(parent, 'written.json'), check: true })).toEqual({
        kind: 'local',
        directory: app,
      });
    }
  });

  test('allows --check on a bare App ID, and refuses a hard link to the pulled state in ./<app-id>', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'charming-dev-pull-'));
    directories.push(parent);
    const cwd = process.cwd();
    process.chdir(parent);
    try {
      const pulled = { kind: 'live', appId: APP_ID, directory: join(process.cwd(), APP_ID) };
      expect(devTarget(APP_ID, { check: true })).toEqual({ ...pulled, pullSource: true });

      await mkdir(join(APP_ID, '.charming-dev'), { recursive: true });
      await writeFile(join(APP_ID, PULLED_STATE_PATH), '{}');
      await link(join(APP_ID, PULLED_STATE_PATH), 'seed.json');
      await writeFile('written.json', '{}');

      for (const flag of ['state', 'saveState'] as const) {
        expect(() => devTarget(APP_ID, { [flag]: 'seed.json', check: true })).toThrow(
          expect.objectContaining({ kind: 'invalid_arguments' }),
        );
        expect(devTarget(APP_ID, { [flag]: 'written.json', check: true })).toEqual({
          ...pulled,
          pullSource: true,
        });
      }
    } finally {
      process.chdir(cwd);
    }
  });

  test('allows --check on state from a file you wrote', () => {
    expect(devTarget('./my-app', { state: 'state.json', check: true })).toEqual({
      kind: 'local',
      directory: './my-app',
    });
  });

  test.each(['0.0.0.0', '192.168.1.5', '::'])(
    'refuses --pull-data on the non-loopback --host %s',
    (host) => {
      expect(() => devTarget(APP_ID, { pullData: 'exportData', host })).toThrow(
        expect.objectContaining({
          kind: 'invalid_arguments',
          message: expect.stringContaining('loopback --host'),
        }),
      );
    },
  );

  test.each(['127.0.0.1', 'localhost', '::1', '[::1]'])(
    'allows --pull-data on the loopback --host %s',
    (host) => {
      expect(devTarget(APP_ID, { pullData: 'exportData', host })).toMatchObject({ kind: 'live' });
    },
  );

  test('refuses --pull-data with --state before anything is fetched', () => {
    expect(() => devTarget(APP_ID, { pullData: 'exportData', state: 'state.json' })).toThrow(
      'Pass one of them',
    );
  });
});

describe('pullLiveApp', () => {
  test('writes the live source and nothing else without --pull-data', async () => {
    const { context, calls } = liveApp({});
    const directory = await emptyDirectory();

    expect(await pullLiveApp(context, live(directory), { log: () => {} })).toEqual({});
    expect(await readFile(join(directory, 'server.js'), 'utf8')).toBe(FILES['server.js']);
    expect(calls).toEqual([{ method: 'GET', path: `/app/${APP_ID}/source` }]);
  });

  test('leaves no partial source tree when a write fails partway', async () => {
    const { context } = liveApp({}, 200, { ...FILES, 'server.js/extra.js': 'x' });
    const directory = await emptyDirectory();

    const error = await pullLiveApp(context, live(directory), { log: () => {} }).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(Error);
    expect(await readdir(join(directory, '..'))).toEqual([]);
    expect(live(directory).pullSource).toBe(true);
  });

  test('takes back the entries it moved when a later move fails', async () => {
    const { context } = liveApp({});
    const directory = await emptyDirectory();
    const actualRename = vi.mocked(rename).getMockImplementation()!;
    let moves = 0;
    vi.mocked(rename).mockImplementation(async (from, to) => {
      moves += 1;
      if (moves === 2) throw Object.assign(new Error('EIO: rename failed'), { code: 'EIO' });
      return actualRename(from, to);
    });

    try {
      const error = await pullLiveApp(context, live(directory), { log: () => {} }).catch(
        (caught: unknown) => caught,
      );

      expect(moves).toBe(2);
      expect((error as Error).message).toContain('rename failed');
      expect(await readdir(directory)).toEqual([]);
      expect(live(directory).pullSource).toBe(true);
    } finally {
      vi.mocked(rename).mockImplementation(actualRename);
    }
  });

  test('never overwrites a directory that already holds files', async () => {
    const { context, calls } = liveApp({});
    const directory = await emptyDirectory();
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'server.js'), 'edited locally');
    const lines: string[] = [];

    await pullLiveApp(context, live(directory), { log: (line) => lines.push(line) });

    expect(await readFile(join(directory, 'server.js'), 'utf8')).toBe('edited locally');
    expect(calls).toEqual([]);
    expect(lines.at(-1)).toContain('was not pulled over them');
  });

  test('seeds storage from a read-only GET into a private file git and --files saves ignore', async () => {
    const { context, calls } = liveApp({
      exportData: { readOnly: true, value: { todos: ['milk'] } },
    });
    const directory = await emptyDirectory();
    const lines: string[] = [];

    const pulled = await pullLiveApp(context, live(directory), {
      dataOperation: 'exportData',
      log: (line) => lines.push(line),
    });

    expect(pulled.statePath).toBe(join(directory, PULLED_STATE_PATH));
    expect(JSON.parse(await readFile(pulled.statePath!, 'utf8'))).toEqual({ todos: ['milk'] });
    expect((await stat(pulled.statePath!)).mode & 0o777).toBe(0o600);
    expect((await stat(join(directory, '.charming-dev'))).mode & 0o777).toBe(0o700);
    expect(await readFile(join(directory, '.charming-dev', '.gitignore'), 'utf8')).toBe('*\n');
    expect(Object.keys(await readAppPackage(directory))).toEqual(['package.json', 'server.js']);
    expect(calls.every((call) => call.method === 'GET')).toBe(true);
    expect(lines.at(-1)).toContain('real user data');
  });

  test('seeds storage into a directory an earlier pull left, keeping its edits', async () => {
    const { context, calls } = liveApp({
      exportData: { readOnly: true, value: { todos: ['milk'] } },
    });
    const directory = await emptyDirectory();
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'server.js'), 'edited locally');
    const target = devTarget(APP_ID, { out: directory, pullData: 'exportData' });
    if (target.kind !== 'live') throw new Error('expected a live target');

    const pulled = await pullLiveApp(context, target, {
      dataOperation: 'exportData',
      log: () => {},
    });

    expect(await readFile(join(directory, 'server.js'), 'utf8')).toBe('edited locally');
    expect(calls.some((call) => call.path.endsWith('/source'))).toBe(false);
    expect(JSON.parse(await readFile(pulled.statePath!, 'utf8'))).toEqual({ todos: ['milk'] });
  });

  test('refuses a symlinked .charming-dev in an otherwise empty --out, writing no source', async () => {
    const { context, calls } = liveApp({ exportData: { readOnly: true, value: { secret: 1 } } });
    const directory = await emptyDirectory();
    await mkdir(directory, { recursive: true });
    const elsewhere = await mkdtemp(join(tmpdir(), 'charming-dev-pull-elsewhere-'));
    directories.push(elsewhere);
    await symlink(elsewhere, join(directory, '.charming-dev'));
    const target = live(directory);

    const error = await pullLiveApp(context, target, {
      dataOperation: 'exportData',
      log: () => {},
    }).catch((caught: unknown) => caught);

    expect(target.pullSource).toBe(true);
    expect(error).toMatchObject({ kind: 'invalid_state' });
    expect(existsSync(join(directory, 'server.js'))).toBe(false);
    expect(calls.some((call) => call.path.endsWith('/source'))).toBe(false);
  });

  test('tightens a state file left readable by others', async () => {
    const { context } = liveApp({ exportData: { readOnly: true, value: { a: 1 } } });
    const directory = await emptyDirectory();
    await mkdir(join(directory, '.charming-dev'), { recursive: true, mode: 0o755 });
    await writeFile(join(directory, PULLED_STATE_PATH), '{}', { mode: 0o644 });

    await pullLiveApp(context, live(directory), {
      dataOperation: 'exportData',
      log: () => {},
    });

    expect((await stat(join(directory, PULLED_STATE_PATH))).mode & 0o777).toBe(0o600);
    expect((await stat(join(directory, '.charming-dev'))).mode & 0o777).toBe(0o700);
  });

  test.each([
    ['not read-only', { readOnly: false }],
    ['read-only but not a GET', { readOnly: true, method: 'POST' as const }],
  ])('refuses an operation that is %s, never calls it, and writes nothing', async (_label, op) => {
    const { context, calls } = liveApp({ reset: op });
    const directory = await emptyDirectory();

    const error = await pullLiveApp(context, live(directory), {
      dataOperation: 'reset',
      log: () => {},
    }).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ kind: 'invalid_arguments' });
    expect((error as Error).message).toContain('declares no read-only GET operation named `reset`');
    expect(calls.some((call) => call.path.endsWith('/api/reset'))).toBe(false);
    expect(calls.some((call) => call.path.endsWith('/source'))).toBe(false);
  });

  test('refuses an operation the App does not declare, and never calls it', async () => {
    const { context, calls } = liveApp({ exportData: { readOnly: true, value: {} } });
    const directory = await emptyDirectory();

    const error = await pullLiveApp(context, live(directory), {
      dataOperation: 'missing',
      log: () => {},
    }).catch((caught: unknown) => caught);

    expect((error as Error).message).toContain(
      'declares no read-only GET operation named `missing`',
    );
    expect(calls.some((call) => call.path.includes('/api/'))).toBe(false);
    expect(existsSync(directory)).toBe(false);
  });

  test('surfaces a failed descriptor read as the API error, and writes nothing', async () => {
    const { context } = liveApp({ exportData: { readOnly: true, value: {} } }, 404);
    const directory = await emptyDirectory();

    const error = await pullLiveApp(context, live(directory), {
      dataOperation: 'exportData',
      log: () => {},
    }).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ name: 'ApiError', status: 404, kind: 'app_not_found' });
    expect(existsSync(directory)).toBe(false);
  });

  test('writes no data when the source read fails after the data read', async () => {
    const { context, calls } = liveApp(
      { exportData: { readOnly: true, value: { todos: ['milk'] } } },
      200,
      null,
    );
    const directory = await emptyDirectory();

    const error = await pullLiveApp(context, live(directory), {
      dataOperation: 'exportData',
      log: () => {},
    }).catch((caught: unknown) => caught);

    expect(calls.some((call) => call.path.endsWith('/api/exportData'))).toBe(true);
    expect(error).toMatchObject({ name: 'ApiError', status: 404, kind: 'app_not_found' });
    expect(existsSync(join(directory, PULLED_STATE_PATH))).toBe(false);
    expect(live(directory).pullSource).toBe(true);
  });

  test('surfaces a failed operation call as the API error, and writes nothing', async () => {
    const { context } = liveApp({
      exportData: {
        readOnly: true,
        status: 403,
        body: { ok: false, error: { kind: 'forbidden', message: 'Not yours.' } },
      },
    });
    const directory = await emptyDirectory();

    const error = await pullLiveApp(context, live(directory), {
      dataOperation: 'exportData',
      log: () => {},
    }).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ name: 'ApiError', status: 403, kind: 'forbidden' });
    expect(existsSync(directory)).toBe(false);
  });

  test.each(['.charming-dev', PULLED_STATE_PATH])(
    'refuses to write live data through a symlinked %s',
    async (linked) => {
      const { context } = liveApp({ exportData: { readOnly: true, value: { secret: 1 } } });
      const directory = await emptyDirectory();
      await mkdir(join(directory, '.charming-dev'), { recursive: true });
      await writeFile(join(directory, 'server.js'), 'edited locally');
      const elsewhere = await mkdtemp(join(tmpdir(), 'charming-dev-pull-elsewhere-'));
      directories.push(elsewhere);
      const target = join(elsewhere, linked === PULLED_STATE_PATH ? 'state.json' : 'dir');
      if (linked === PULLED_STATE_PATH) await writeFile(target, 'untouched');
      else await mkdir(target);
      await rm(join(directory, linked), { recursive: true, force: true });
      await symlink(target, join(directory, linked));

      const error = await pullLiveApp(context, live(directory), {
        dataOperation: 'exportData',
        log: () => {},
      }).catch((caught: unknown) => caught);

      expect(error).toMatchObject({ kind: 'invalid_state' });
      expect((error as Error).message).toContain('is a symlink');
      if (linked === PULLED_STATE_PATH) expect(await readFile(target, 'utf8')).toBe('untouched');
      else expect(existsSync(join(target, 'state.json'))).toBe(false);
    },
  );

  test.each([
    ['an array', { value: ['milk'] }],
    ['null', { value: null }],
    ['a number', { value: 3 }],
  ])('refuses a result that is %s', async (_label, answer) => {
    const { context } = liveApp({ list: { readOnly: true, ...answer } });

    const error = await pullLiveApp(context, live(await emptyDirectory()), {
      dataOperation: 'list',
      log: () => {},
    }).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ kind: 'invalid_state' });
  });

  test('accepts an empty object, and refuses an answer without the value envelope', async () => {
    const empty = liveApp({ exportData: { readOnly: true, value: {} } });
    const pulled = await pullLiveApp(empty.context, live(await emptyDirectory()), {
      dataOperation: 'exportData',
      log: () => {},
    });
    expect(JSON.parse(await readFile(pulled.statePath!, 'utf8'))).toEqual({});

    const bare = liveApp({ exportData: { readOnly: true, body: { todos: [] } } });
    const error = await pullLiveApp(bare.context, live(await emptyDirectory()), {
      dataOperation: 'exportData',
      log: () => {},
    }).catch((caught: unknown) => caught);
    expect((error as Error).message).toContain('answered without a value');
  });
});
