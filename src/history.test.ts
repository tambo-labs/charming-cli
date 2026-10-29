import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test, vi } from 'vitest';

import { directoryOutsideAnyProject } from '../test-helpers.js';
import { type CommandContext } from './commands.js';
import { resolveSession } from './config.js';
import { runHistory } from './history.js';
import { ApiError } from './http.js';

const ORIGIN = 'https://charming.test';
const APP_ID = '00000000-0000-4000-8000-000000000001';

async function context(
  fetchImpl: typeof fetch,
  options: CommandContext['options'] = {},
  token = 'chrm_user_test',
): Promise<CommandContext> {
  return {
    fetchImpl,
    options,
    session: await resolveSession({
      baseUrl: ORIGIN,
      cwd: await directoryOutsideAnyProject(),
      env: { ...process.env, CHARMING_PROFILE: '' },
      purpose: 'use',
      token,
    }),
  };
}

function urlOf(input: string | URL | Request): string {
  return typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
}

function requestsOf(fetchImpl: ReturnType<typeof vi.fn<typeof fetch>>) {
  return fetchImpl.mock.calls.map(([url, init]) => ({
    method: init?.method,
    url: urlOf(url),
    headers: new Headers(init?.headers),
    body: init?.body === undefined ? undefined : JSON.parse(init.body as string),
  }));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('apps history list', () => {
  test('lists revisions with the page the caller asked for', async () => {
    const page = { ok: true, currentRevision: 6, items: [{ revision: 6 }], nextBefore: 5 };
    const fetchImpl = vi.fn<typeof fetch>(async () => Response.json(page));

    await expect(
      runHistory('list', [APP_ID], await context(fetchImpl, { limit: '1', before: '6' })),
    ).resolves.toEqual(page);

    const [request] = requestsOf(fetchImpl);
    expect(request?.method).toBe('GET');
    expect(request?.url).toBe(`${ORIGIN}/api/v1/apps/${APP_ID}/revisions?limit=1&before=6`);
    expect(request?.headers.get('Authorization')).toBe('Bearer chrm_user_test');
  });

  test.each([
    ['limit', '0'],
    ['limit', 'many'],
    ['before', '-3'],
  ])('refuses --%s %s before any request', async (name, value) => {
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(
      runHistory('list', [APP_ID], await context(fetchImpl, { [name]: value })),
    ).rejects.toThrow(`--${name} must be a whole number from 1`);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('refuses something that is not an App ID before any request', async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(runHistory('list', ['my-app'], await context(fetchImpl))).rejects.toThrow(
      'Invalid app ID',
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('needs a signed-in user', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const signedOut = await context(fetchImpl);
    signedOut.session = { ...signedOut.session, token: undefined };

    await expect(runHistory('list', [APP_ID], signedOut)).rejects.toThrow('Not authenticated');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('apps history get', () => {
  const revision = {
    ok: true,
    appId: APP_ID,
    revision: 3,
    source: {
      files: { 'package.json': '{"name":"notes"}', 'server.js': 'export const routes = [];' },
    },
  };

  test('prints a revision with its source', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => Response.json(revision));

    await expect(runHistory('get', [APP_ID, '3'], await context(fetchImpl))).resolves.toEqual(
      revision,
    );
    expect(requestsOf(fetchImpl)[0]?.url).toBe(`${ORIGIN}/api/v1/apps/${APP_ID}/revisions/3`);
  });

  test('writes the revision source into a directory with --out', async () => {
    const out = await mkdtemp(join(tmpdir(), 'charming-history-out-'));
    const fetchImpl = vi.fn<typeof fetch>(async () => Response.json(revision));

    await expect(
      runHistory('get', [APP_ID, '3'], await context(fetchImpl, { out })),
    ).resolves.toEqual({ appId: APP_ID, revision: 3, outputDirectory: out });
    expect((await readdir(out)).sort()).toEqual(['package.json', 'server.js']);
    expect(await readFile(join(out, 'server.js'), 'utf8')).toBe('export const routes = [];');
  });

  test('writes a module-contract revision as module.js, ui.js, and styles.css', async () => {
    const out = await mkdtemp(join(tmpdir(), 'charming-history-module-'));
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      Response.json({ ...revision, source: { module: 'm', ui: 'u', styles: null } }),
    );

    await runHistory('get', [APP_ID, '3'], await context(fetchImpl, { out }));

    expect((await readdir(out)).sort()).toEqual(['module.js', 'ui.js']);
  });

  test.each([
    ['../escape.js', 'Refusing to write ../escape.js outside'],
    ['.hidden/x.js', 'Refusing to write .hidden/x.js'],
  ])('refuses the server-supplied path %s with --out', async (key, message) => {
    const parent = await mkdtemp(join(tmpdir(), 'charming-history-hostile-'));
    const out = join(parent, 'inner');
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      Response.json({
        ...revision,
        source: { files: { 'package.json': '{}', 'server.js': 'ok', [key]: 'nope' } },
      }),
    );

    await expect(
      runHistory('get', [APP_ID, '3'], await context(fetchImpl, { out })),
    ).rejects.toThrow(message);
    await expect(readdir(out)).rejects.toThrow();
    await expect(readFile(join(parent, 'escape.js'), 'utf8')).rejects.toThrow();
  });

  test.each(['0', '-1', '2.5', 'latest'])(
    'refuses %s as a revision before any request',
    async (value) => {
      const fetchImpl = vi.fn<typeof fetch>();

      await expect(runHistory('get', [APP_ID, value], await context(fetchImpl))).rejects.toThrow(
        'revision must be a whole number from 1',
      );
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );
});

describe('apps history restore', () => {
  const key = /^charming-cli-/;

  function server(restore: Response) {
    return vi.fn<typeof fetch>(async (input) =>
      urlOf(input).endsWith('/restore')
        ? restore.clone()
        : Response.json({ ok: true, currentRevision: 6, items: [] }),
    );
  }

  test('restores against the current revision with an idempotency key', async () => {
    const restored = { ok: true, appId: APP_ID, sourceRevision: 3, revision: 7 };
    const fetchImpl = server(Response.json(restored));

    await expect(
      runHistory('restore', [APP_ID, '3'], await context(fetchImpl, { yes: true })),
    ).resolves.toEqual(restored);

    const [list, restore] = requestsOf(fetchImpl);
    expect(list?.url).toBe(`${ORIGIN}/api/v1/apps/${APP_ID}/revisions?limit=1`);
    expect(restore?.method).toBe('POST');
    expect(restore?.url).toBe(`${ORIGIN}/api/v1/apps/${APP_ID}/revisions/3/restore`);
    expect(restore?.headers.get('If-Match')).toBe('"6"');
    expect(restore?.headers.get('Idempotency-Key')).toMatch(key);
  });

  test('returns the 202 build for a package revision', async () => {
    const accepted = { ok: true, buildId: 'build_4', state: 'queued', sourceRevision: 3 };
    const fetchImpl = server(Response.json(accepted, { status: 202 }));

    await expect(
      runHistory('restore', [APP_ID, '3'], await context(fetchImpl, { yes: true })),
    ).resolves.toEqual(accepted);
  });

  test('--wait returns a module revision as restored, without polling any build', async () => {
    const restored = { ok: true, appId: APP_ID, sourceRevision: 2, revision: 7 };
    const fetchImpl = server(Response.json(restored));

    await expect(
      runHistory('restore', [APP_ID, '2'], await context(fetchImpl, { yes: true, wait: true })),
    ).resolves.toEqual(restored);
    expect(requestsOf(fetchImpl).map((request) => request.url)).not.toContainEqual(
      expect.stringContaining('app-builds'),
    );
  });

  test('stops before the restore when the History list has no current revision', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => Response.json({ ok: true, items: [] }));

    await expect(
      runHistory('restore', [APP_ID, '3'], await context(fetchImpl, { yes: true })),
    ).rejects.toThrow('invalid History list');
    expect(requestsOf(fetchImpl).map((request) => request.method)).toEqual(['GET']);
  });

  test('changes nothing without --yes or --dry-run', async () => {
    const fetchImpl = server(Response.json({}));

    await expect(runHistory('restore', [APP_ID, '3'], await context(fetchImpl))).rejects.toThrow(
      'requires --yes',
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('previews the request and its headers without sending anything', async () => {
    const fetchImpl = server(Response.json({}));

    await expect(
      runHistory('restore', [APP_ID, '3'], await context(fetchImpl, { 'dry-run': true })),
    ).resolves.toEqual({
      dryRun: true,
      method: 'POST',
      path: `/api/v1/apps/${APP_ID}/revisions/3/restore`,
      headers: {
        'If-Match': '<"N" for the current revision from the History list>',
        'Idempotency-Key': 'charming-cli-<uuid>',
      },
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('surfaces a revision that changed since the list was read', async () => {
    const fetchImpl = server(
      Response.json(
        { error: { kind: 'revision_mismatch', message: 'The App changed.' } },
        { status: 412 },
      ),
    );

    const error = await runHistory(
      'restore',
      [APP_ID, '3'],
      await context(fetchImpl, { yes: true }),
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: 'revision_mismatch', status: 412 });
  });
});

describe('apps history', () => {
  test('names its subcommands when given an unknown one', async () => {
    await expect(
      runHistory('wipe', [APP_ID], await context(vi.fn<typeof fetch>())),
    ).rejects.toThrow('Usage: charming apps history list|get|restore');
  });
});
