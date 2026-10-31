import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { type AddressInfo, connect, createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, describe, expect, test } from 'vitest';

import Dev from './commands/dev.js';
import { checkApp, recordProcessFailures } from './dev-check.js';
import { startDevServer, type DevServer, parseSecrets, watchSources } from './dev.js';

// The dev host replaces the global fetch for App code, so the tests reach the
// server through the fetch they started with.
const httpFetch = globalThis.fetch;
const vendoredDevHost = join(import.meta.dirname, '..', 'vendor', 'dev-host.js');

const MODULE = `export const manifest = {
  $schema: 'https://charm.ing/schema/app-manifest/2026-10-16.json',
  id: 'in-process-dev',
  meta: { name: 'In-process dev' },
  capabilities: { imports: ['charming:storage/kv@1.0'] },
};
export const routes = [
  {
    op: 'hang',
    method: 'POST',
    handler: () => new Promise(() => {}),
  },
  {
    op: 'writeThenHang',
    method: 'POST',
    handler: async (_input, { env }) => {
      await env.storage.put('visits', 100);
      return new Promise(() => {});
    },
  },
  {
    op: 'hangThenWrite',
    method: 'POST',
    handler: async (_input, { env }) => {
      await new Promise((resolve) => setTimeout(resolve, 80));
      await env.storage.put('visits', 7);
      return new Promise(() => {});
    },
  },
  {
    op: 'visit',
    method: 'GET',
    handler: async (_input, { env }) => {
      const visits = ((await env.storage.get('visits')) ?? 0) + 1;
      await env.storage.put('visits', visits);
      return { visits, label: 'LABEL' };
    },
  },
];
`;

const servers: DevServer[] = [];
const lines: string[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) await server.close();
  lines.length = 0;
});

async function appDirectory(label = 'first'): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'charming-dev-in-process-'));
  await writeFile(join(directory, 'module.js'), MODULE.replace('LABEL', label));
  await writeFile(join(directory, 'ui.js'), "document.querySelector('#app').textContent = 'ui';");
  await writeFile(join(directory, 'styles.css'), 'body { color: teal; }');
  return directory;
}

async function start(
  directory: string,
  extra: {
    saveState?: string;
    state?: string;
    shutdownGraceMs?: number;
    operationTimeoutMs?: number;
    runOp?: string[];
  } = {},
) {
  const server = await startDevServer({
    directory,
    host: '127.0.0.1',
    port: 0,
    log: (line) => lines.push(line),
    ...extra,
  });
  servers.push(server);
  return server;
}

function rawGet(url: string, path: string, headers: Record<string, string>) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const request = httpRequest(new URL(path, url), { headers }, (response) => {
      let body = '';
      response.setEncoding('utf8').on('data', (chunk: string) => (body += chunk));
      response.on('end', () => resolve({ status: response.statusCode ?? 0, body }));
    });
    request.on('error', reject).end();
  });
}

function rawStatusLine(url: string, head: string) {
  const { hostname, port } = new URL(url);
  return new Promise<string>((resolve, reject) => {
    const socket = connect(Number(port), hostname, () => socket.write(head));
    let received = '';
    socket.setEncoding('utf8').on('data', (chunk: string) => {
      received += chunk;
      if (received.includes('\r\n')) {
        resolve(received.slice(0, received.indexOf('\r\n')));
        socket.destroy();
      }
    });
    socket.on('error', reject);
  });
}

/** A port nothing listens on: one the system handed out and then released. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on('error', reject).listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

describe.skipIf(!existsSync(vendoredDevHost))('startDevServer', () => {
  test('serves the page and runs operations over HTTP', async () => {
    const server = await start(await appDirectory());
    const page = await httpFetch(`${server.url}/`);
    const head = await httpFetch(`${server.url}/`, { method: 'HEAD' });
    const visit = await httpFetch(`${server.url}/app/${server.appId}/api/visit`);

    expect(page.status).toBe(200);
    expect(await page.text()).toContain('body { color: teal; }');
    expect(head.status).toBe(200);
    expect(await visit.json()).toEqual({ ok: true, value: { visits: 1, label: 'first' } });
    expect(lines.join('\n')).toContain('GET visit → 200');
  });

  test('refuses requests for other hosts, origins, or sites and malformed targets', async () => {
    const server = await start(await appDirectory());
    const port = new URL(server.url).port;
    const api = `/app/${server.appId}/api/visit`;

    const rebound = await rawGet(server.url, '/', { host: `attacker.example:${port}` });
    const crossOrigin = await rawGet(server.url, api, { origin: 'https://attacker.example' });
    const crossSite = await rawGet(server.url, api, { 'sec-fetch-site': 'cross-site' });
    const sameOrigin = await rawGet(server.url, api, {
      host: `localhost:${port}`,
      origin: `http://localhost:${port}`,
      'sec-fetch-site': 'same-origin',
    });
    const malformed = await rawStatusLine(
      server.url,
      `GET //[ HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`,
    );

    expect([rebound.status, JSON.parse(rebound.body).error.kind]).toEqual([403, 'forbidden_host']);
    expect([crossOrigin.status, JSON.parse(crossOrigin.body).error.kind]).toEqual([
      403,
      'forbidden_origin',
    ]);
    expect([crossSite.status, JSON.parse(crossSite.body).error.kind]).toEqual([
      403,
      'forbidden_origin',
    ]);
    expect(sameOrigin.status).toBe(200);
    expect(malformed).toBe('HTTP/1.1 400 Bad Request');
  });

  test('picks up source edits on the next request', async () => {
    const directory = await appDirectory();
    const server = await start(directory);
    const before = await httpFetch(`${server.url}/app/${server.appId}/api/visit`);
    await writeFile(join(directory, 'module.js'), MODULE.replace('LABEL', 'edited'));
    const after = await httpFetch(`${server.url}/app/${server.appId}/api/visit`);
    await writeFile(join(directory, 'module.js'), 'export const manifest = {};');
    const broken = await httpFetch(`${server.url}/`);

    expect((await before.json()).value.label).toBe('first');
    expect((await after.json()).value.label).toBe('edited');
    expect(broken.status).toBe(422);
    expect(lines.join('\n')).toContain('unsupported_manifest_version');
  });

  test('seeds, saves, and resumes --save-state', async () => {
    const directory = await appDirectory();
    const saved = join(directory, 'saved.json');
    await writeFile(join(directory, 'seed.json'), JSON.stringify({ visits: 4 }));

    const first = await start(directory, { state: join(directory, 'seed.json'), saveState: saved });
    const visit = await httpFetch(`${first.url}/app/${first.appId}/api/visit`);
    const written = JSON.parse(await readFile(saved, 'utf8'));
    await servers.splice(0)[0]?.close();
    const second = await start(directory, { saveState: saved });
    const resumed = await httpFetch(`${second.url}/app/${second.appId}/api/visit`);

    expect((await visit.json()).value.visits).toBe(5);
    expect(written).toEqual({ visits: 5 });
    expect((await resumed.json()).value.visits).toBe(6);
  });

  test('stops within the grace period while an operation never finishes, still saving', async () => {
    const directory = await appDirectory();
    const saved = join(directory, 'saved.json');
    const server = await start(directory, { saveState: saved, shutdownGraceMs: 100 });
    await httpFetch(`${server.url}/app/${server.appId}/api/visit`);
    const hanging = httpFetch(`${server.url}/app/${server.appId}/api/hang`, {
      method: 'POST',
      body: '{}',
    }).catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const started = Date.now();
    await servers.splice(0)[0]?.close();
    await hanging;

    expect(Date.now() - started).toBeLessThan(3_000);
    expect(JSON.parse(await readFile(saved, 'utf8'))).toEqual({ visits: 1 });
  });

  test('logs a failing --save-state write once until it recovers', async () => {
    const directory = await appDirectory();
    await mkdir(join(directory, 'state'));
    const server = await start(directory, { saveState: join(directory, 'state', 'saved.json') });
    await rm(join(directory, 'state'), { recursive: true });

    for (let visit = 0; visit < 3; visit++) {
      await httpFetch(`${server.url}/app/${server.appId}/api/visit`);
    }

    await mkdir(join(directory, 'state'));
    await httpFetch(`${server.url}/app/${server.appId}/api/visit`);

    expect(lines.filter((line) => line.startsWith('Could not write --save-state'))).toHaveLength(1);
    expect(JSON.parse(await readFile(join(directory, 'state', 'saved.json'), 'utf8'))).toEqual({
      visits: 4,
    });
  });

  test('refuses a --save-state target that is not a state file, even with --state', async () => {
    const directory = await appDirectory();
    await writeFile(join(directory, 'seed.json'), JSON.stringify({ visits: 1 }));

    const failure = await start(directory, {
      state: join(directory, 'seed.json'),
      saveState: join(directory, 'module.js'),
    }).catch((error: unknown) => error);

    expect(failure).toMatchObject({ kind: 'invalid_json' });
    expect(await readFile(join(directory, 'module.js'), 'utf8')).toContain('export const manifest');
  });

  test('leaves an existing --save-state file alone when nothing changed', async () => {
    const directory = await appDirectory();
    const saved = join(directory, 'saved.json');
    await writeFile(join(directory, 'seed.json'), JSON.stringify({ visits: 1 }));
    await writeFile(saved, '{ "visits": 99 }\n');

    await start(directory, { state: join(directory, 'seed.json'), saveState: saved });
    await servers.splice(0)[0]?.close();

    expect(await readFile(saved, 'utf8')).toBe('{ "visits": 99 }\n');
  });

  test('saves a write from an operation that timed out', async () => {
    const directory = await appDirectory();
    const saved = join(directory, 'saved.json');
    const server = await start(directory, {
      saveState: saved,
      operationTimeoutMs: 50,
      shutdownGraceMs: 50,
    });

    const answer = await httpFetch(`${server.url}/app/${server.appId}/api/writeThenHang`, {
      method: 'POST',
      body: '{}',
    });

    expect((await answer.json()).error.kind).toBe('timeout');
    expect(JSON.parse(await readFile(saved, 'utf8'))).toEqual({ visits: 100 });
  });

  test('warns that --state will replace an existing --save-state file', async () => {
    const directory = await appDirectory();
    const saved = join(directory, 'saved.json');
    await writeFile(join(directory, 'seed.json'), JSON.stringify({ visits: 1 }));
    await writeFile(saved, JSON.stringify({ visits: 50 }));

    await start(directory, { state: join(directory, 'seed.json'), saveState: saved });

    expect(lines).toContain(
      `--state seeds storage, so the first write replaces ${saved}. To resume from that file instead, drop --state.`,
    );
  });

  test('saves a write that lands after its operation was answered, without another request', async () => {
    const directory = await appDirectory();
    const saved = join(directory, 'saved.json');
    const server = await start(directory, {
      saveState: saved,
      operationTimeoutMs: 30,
      shutdownGraceMs: 50,
    });

    const answer = await httpFetch(`${server.url}/app/${server.appId}/api/hangThenWrite`, {
      method: 'POST',
      body: '{}',
    });
    expect((await answer.json()).error.kind).toBe('timeout');
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(JSON.parse(await readFile(saved, 'utf8'))).toEqual({ visits: 7 });
  });
});

describe.skipIf(!existsSync(vendoredDevHost))('a package directory', () => {
  test('reads the directory as a package tree and reports its refusals', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'charming-dev-package-'));
    await writeFile(join(directory, 'package.json'), '{"name": 1}');
    await writeFile(join(directory, 'server.js'), 'export const routes = [];');

    const error = await startDevServer({
      directory,
      host: '127.0.0.1',
      port: 0,
      log: (line) => lines.push(line),
    }).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ kind: 'invalid_manifest_schema' });
    await rm(directory, { recursive: true, force: true });
  });

  test('serves the sources --module names even beside a package.json', async () => {
    const directory = await appDirectory();
    await writeFile(join(directory, 'package.json'), '{"name": 1}');

    const named = await startDevServer({
      directory,
      module: join(directory, 'module.js'),
      host: '127.0.0.1',
      port: 0,
      log: (line) => lines.push(line),
    }).catch((caught: unknown) => caught);

    expect(named).toMatchObject({ url: expect.stringContaining('http://127.0.0.1:') });
    await (named as DevServer).close();
  });
});

describe.skipIf(!existsSync(vendoredDevHost))('./assets', () => {
  test('serves each file in assets/ under its name', async () => {
    const directory = await appDirectory();
    await mkdir(join(directory, 'assets'));
    await writeFile(
      join(directory, 'assets', 'logo.png'),
      new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    );

    const server = await start(directory);
    const response = await httpFetch(`${server.url}/app/${server.appId}/assets/logo.png`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    );
  });

  test('skips hidden files, follows a symlink, and sends an unknown extension as octet-stream', async () => {
    const directory = await appDirectory();
    await mkdir(join(directory, 'assets'));
    await writeFile(join(directory, 'assets', '.DS_Store'), 'hidden');
    await writeFile(join(directory, 'assets', 'data.bin'), 'raw');
    await writeFile(join(directory, 'logo-source.png'), new Uint8Array([0x89, 0x50]));
    await symlink(join(directory, 'logo-source.png'), join(directory, 'assets', 'logo.png'));

    const server = await start(directory);
    const base = `${server.url}/app/${server.appId}/assets`;

    expect((await httpFetch(`${base}/.DS_Store`)).status).toBe(404);
    expect((await httpFetch(`${base}/data.bin`)).headers.get('content-type')).toBe(
      'application/octet-stream',
    );
    expect((await httpFetch(`${base}/logo.png`)).status).toBe(200);
  });

  test('refuses an SVG in assets/ at startup, as the server refuses it', async () => {
    const directory = await appDirectory();
    await mkdir(join(directory, 'assets'));
    await writeFile(join(directory, 'assets', 'icon.svg'), '<svg/>');

    const error = await start(directory).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ kind: 'invalid_asset' });
    expect((error as Error).message).toContain('assets/icon.svg');
  });

  test('reads assets/ beside the file --module names, not the working directory', async () => {
    const directory = await appDirectory();
    await mkdir(join(directory, 'assets'));
    await writeFile(join(directory, 'assets', 'logo.png'), new Uint8Array([0x89, 0x50]));

    const server = await startDevServer({
      module: join(directory, 'module.js'),
      host: '127.0.0.1',
      port: 0,
      log: (line) => lines.push(line),
    });
    servers.push(server);

    expect((await httpFetch(`${server.url}/app/${server.appId}/assets/logo.png`)).status).toBe(200);
  });

  test('refuses a nested directory, since asset keys have no slash', async () => {
    const directory = await appDirectory();
    await mkdir(join(directory, 'assets', 'icons'), { recursive: true });

    const error = await start(directory).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ kind: 'invalid_asset' });
  });
});

describe.skipIf(!existsSync(vendoredDevHost))('--as', () => {
  test('offers exactly the roles the dev host maps', async () => {
    const devHost = (await import(pathToFileURL(vendoredDevHost).href)) as {
      DEV_ROLES: Record<string, string>;
    };

    expect(Dev.flags.as.options).toEqual(Object.keys(devHost.DEV_ROLES));
  });

  test.each([
    ['owner', 200],
    ['builder', 200],
    ['editor', 200],
    ['viewer', 401],
  ] as const)('--as %s gets %i from a write', async (role, status) => {
    const directory = await appDirectory();
    const server = await startDevServer({
      directory,
      host: '127.0.0.1',
      port: 0,
      role,
      log: (line) => lines.push(line),
    });
    servers.push(server);

    const response = await httpFetch(`${server.url}/app/${server.appId}/api/visit`);

    expect(response.status).toBe(status);
  });

  test('a signed-out viewer is asked to sign in for a write, as on Charming', async () => {
    const directory = await appDirectory();
    const server = await startDevServer({
      directory,
      host: '127.0.0.1',
      port: 0,
      role: 'viewer',
      log: (line) => lines.push(line),
    });
    servers.push(server);

    const response = await httpFetch(`${server.url}/app/${server.appId}/api/writeThenHang`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });

    expect(response.status).toBe(401);
    expect((await response.json()).error.kind).toBe('sign_in_required');
  });
});

/** Replace a `fetchFile` test value with a written `--fetch` file. */
async function withFetchFile(
  directory: string,
  extra: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { fetchFile, ...rest } = extra;
  if (typeof fetchFile !== 'string') return rest;
  const path = join(directory, 'fetch.json');
  await writeFile(path, fetchFile);
  return { ...rest, fetch: path };
}

describe('parseSecrets', () => {
  test('reads a bare NAME from the environment and NAME=value as given', () => {
    process.env.CHARMING_DEV_TEST_SET_SECRET = 'from-the-environment';
    try {
      expect(parseSecrets(['CHARMING_DEV_TEST_SET_SECRET', 'OTHER=a=b'])).toEqual({
        CHARMING_DEV_TEST_SET_SECRET: 'from-the-environment',
        OTHER: 'a=b',
      });
    } finally {
      delete process.env.CHARMING_DEV_TEST_SET_SECRET;
    }
  });

  test.each([
    ['sk-live-abc', 'sk-live-abc'],
    ['c2stbGl2ZQ==', 'c2stbGl2ZQ'],
    ['dGVzdC1rZXk=', 'dGVzdC1rZXk'],
    ['QUJD=', 'QUJD'],
  ])('refuses %s without echoing it', (argument, secretText) => {
    const error = (() => {
      try {
        return parseSecrets([argument]);
      } catch (caught) {
        return caught;
      }
    })();

    expect(error).toMatchObject({ kind: 'invalid_secret' });
    expect((error as Error).message).not.toContain(secretText);
  });
});

describe.skipIf(!existsSync(vendoredDevHost))('--fetch, --fetch-allow, and --secret', () => {
  test('answers a declared request from the --fetch file', async () => {
    const directory = await appDirectory();
    await writeFile(
      join(directory, 'module.js'),
      `export const manifest = {
        $schema: 'https://charm.ing/schema/app-manifest/2026-10-16.json',
        id: 'fetching', meta: { name: 'Fetching' },
        capabilities: { imports: ['charming:network/fetch@1.0'] },
        permissions: { server: { fetch: ['https://api.allowed.test'] } },
      };
      export const routes = [{ op: 'load', method: 'GET', handler: async () => (await fetch('https://api.allowed.test/items')).json() }];`,
    );
    const fixtures = join(directory, 'fetch.json');
    await writeFile(
      fixtures,
      JSON.stringify({ 'get https://API.allowed.test:443/items?page=2': { json: ['a'] } }),
    );

    const server = await startDevServer({
      directory,
      host: '127.0.0.1',
      port: 0,
      fetch: fixtures,
      log: (line) => lines.push(line),
    });
    servers.push(server);
    const response = await httpFetch(`${server.url}/app/${server.appId}/api/load`);

    expect(await response.json()).toEqual({ ok: true, value: ['a'] });
  });

  test('gives a sealed fetch the --secret values', async () => {
    const directory = await appDirectory();
    await writeFile(
      join(directory, 'module.js'),
      `export const manifest = {
        $schema: 'https://charm.ing/schema/app-manifest/2026-10-16.json',
        id: 'sealed', meta: { name: 'Sealed' },
        capabilities: { imports: ['charming:secrets/fetch@1.0'] },
        permissions: { server: { fetch: ['https://api.allowed.test'] } },
      };
      export const routes = [{ op: 'load', method: 'GET', handler: async (_input, { env }) => {
        try {
          const response = await env.fetch('https://api.allowed.test/items', {
            headers: { authorization: 'Bearer {{secret:API_KEY}}' },
          });
          return { status: response.status, body: await response.text() };
        } catch (error) {
          return { error: error.message };
        }
      } }];`,
    );
    const fixtures = join(directory, 'fetch.json');
    await writeFile(fixtures, JSON.stringify({ 'https://api.allowed.test/items': { body: 'ok' } }));

    const server = await startDevServer({
      directory,
      host: '127.0.0.1',
      port: 0,
      fetch: fixtures,
      secret: ['API_KEY=key'],
      log: (line) => lines.push(line),
    });
    servers.push(server);
    const response = await httpFetch(`${server.url}/app/${server.appId}/api/load`);

    expect(await response.json()).toEqual({ ok: true, value: { status: 200, body: 'ok' } });
  });

  test('warns at startup that Charming refuses each --fetch-allow origin', async () => {
    const server = await startDevServer({
      directory: await appDirectory(),
      host: '127.0.0.1',
      port: 0,
      fetchAllow: ['https://API.test:443/'],
      log: (line) => lines.push(line),
    });
    servers.push(server);

    expect(
      lines.find((line) => line.includes('https://api.test') && line.includes('Charming refuses')),
    ).toBeDefined();
  });

  test.each([
    [{ fetchAllow: ['https://api.test/path'] }, 'invalid_fetch_allow'],
    [{ fetchAllow: ['https://api.test?x=1'] }, 'invalid_fetch_allow'],
    [{ fetchAllow: ['https://user@api.test'] }, 'invalid_fetch_allow'],
    [{ fetchAllow: ['http://api.test'] }, 'invalid_fetch_allow'],
    [{ secret: ['lower=1'] }, 'invalid_secret'],
    [{ secret: ['CHARMING_DEV_TEST_UNSET_SECRET'] }, 'invalid_secret'],
    [{ fetchFile: '[]' }, 'invalid_fetch_fixtures'],
    [{ fetchFile: '{"not a url": {}}' }, 'invalid_fetch_fixtures'],
    [{ fetchFile: '{"https://api.test/x": {"status": "ok"}}' }, 'invalid_fetch_fixtures'],
    [{ fetchFile: '{"https://api.test/x": {"body": 1}}' }, 'invalid_fetch_fixtures'],
    [
      { fetchFile: '{"https://api.test/x": {"status": 204, "body": "x"}}' },
      'invalid_fetch_fixtures',
    ],
  ])('refuses %o with %s', async (extra, kind) => {
    const directory = await appDirectory();

    const error = await startDevServer({
      directory,
      host: '127.0.0.1',
      port: 0,
      log: (line) => lines.push(line),
      ...(await withFetchFile(directory, extra)),
    }).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ kind });
  });
});

describe.skipIf(!existsSync(vendoredDevHost))('--run-op and the dev panel', () => {
  test('stops with the declared operations when --run-op names one the app lacks', async () => {
    const directory = await appDirectory();

    const error = await startDevServer({
      directory,
      host: '127.0.0.1',
      port: 0,
      runOp: ['visitt'],
      log: (line) => lines.push(line),
    }).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ kind: 'operation_not_found' });
    expect((error as Error).message).toContain('visit');
  });

  test('releases the port when --run-op stops startup', async () => {
    const directory = await appDirectory();
    const port = await freePort();

    await startDevServer({
      directory,
      host: '127.0.0.1',
      port,
      runOp: ['visitt'],
      log: (line) => lines.push(line),
    }).catch(() => undefined);

    const refused = await new Promise<boolean>((resolve) => {
      const socket = connect(port, '127.0.0.1', () => {
        socket.destroy();
        resolve(false);
      });
      socket.on('error', () => resolve(true));
    });
    expect(refused).toBe(true);
  });

  test.each(['record_not_found', 'operation_not_found'])(
    "keeps serving when a --run-op operation's own handler answers 404 %s",
    async (kind) => {
      const directory = await mkdtemp(join(tmpdir(), 'charming-dev-in-process-'));
      await writeFile(
        join(directory, 'module.js'),
        MODULE.replace(
          'export const routes = [',
          `export const routes = [
  {
    op: 'lookup',
    method: 'POST',
    handler: () => {
      throw new CharmingHandlerError({ kind: '${kind}', status: 404, message: 'Nothing stored yet' });
    },
  },`,
        ),
      );
      const server = await startDevServer({
        directory,
        host: '127.0.0.1',
        port: 0,
        runOp: ['lookup'],
        log: (line) => lines.push(line),
      });
      servers.push(server);

      expect(
        lines.some(
          (line) => line.startsWith(`POST lookup {} → 404 ${kind} `) && line.endsWith('(run)'),
        ),
      ).toBe(true);
      expect((await httpFetch(`${server.url}/app/${server.appId}/api/visit`)).status).toBe(200);
    },
  );

  test('warns that panel runs carry owner authority when bound beyond loopback', async () => {
    const directory = await appDirectory();
    const server = await startDevServer({
      directory,
      host: '0.0.0.0',
      port: 0,
      log: (line) => lines.push(line),
    });
    servers.push(server);

    expect(lines.some((line) => line.includes('0.0.0.0') && line.includes('owner authority'))).toBe(
      true,
    );
  });

  test('closes promptly while the panel log stream is open', async () => {
    const directory = await appDirectory();
    const server = await startDevServer({
      directory,
      host: '127.0.0.1',
      port: 0,
      shutdownGraceMs: 5_000,
      log: (line) => lines.push(line),
    });
    const controller = new AbortController();
    const stream = await httpFetch(`${server.panelUrl}/log`, { signal: controller.signal });
    expect(stream.status).toBe(200);

    const started = performance.now();
    await server.close();
    controller.abort();

    expect(performance.now() - started).toBeLessThan(2_000);
  });

  test('refuses a panel run from another origin or for another host, and runs nothing', async () => {
    const directory = await appDirectory();
    const server = await start(directory);
    const port = new URL(server.url).port;
    const run = (headers: Record<string, string>) =>
      new Promise<number>((resolve, reject) => {
        const request = httpRequest(
          new URL('/__dev/run', server.url),
          { method: 'POST', headers: { 'content-type': 'application/json', ...headers } },
          (response) => {
            response.resume();
            resolve(response.statusCode ?? 0);
          },
        );
        request.on('error', reject).end(JSON.stringify({ op: 'visit' }));
      });

    expect(await run({ origin: 'https://evil.test' })).toBe(403);
    expect(await run({ host: `evil.test:${port}` })).toBe(403);
    expect(await run({ 'sec-fetch-site': 'cross-site' })).toBe(403);
    expect(await run({ 'content-type': 'text/plain' })).toBe(415);
    const visit = await httpFetch(`${server.url}/app/${server.appId}/api/visit`);
    expect((await visit.json()).value.visits).toBe(1);
  });

  test('runs a panel request a browser sends from the panel page', async () => {
    const directory = await appDirectory();
    const server = await start(directory);
    const run = (headers: Record<string, string>) =>
      new Promise<number>((resolve, reject) => {
        const request = httpRequest(
          new URL('/__dev/run', server.url),
          { method: 'POST', headers: { 'content-type': 'application/json', ...headers } },
          (response) => {
            response.resume();
            resolve(response.statusCode ?? 0);
          },
        );
        request.on('error', reject).end(JSON.stringify({ op: 'visit' }));
      });

    expect(await run({ origin: new URL(server.url).origin, 'sec-fetch-site': 'same-origin' })).toBe(
      200,
    );
    expect(await run({ 'sec-fetch-site': 'none' })).toBe(200);
    const visit = await httpFetch(`${server.url}/app/${server.appId}/api/visit`);
    expect((await visit.json()).value.visits).toBe(3);
  });

  test('runs each --run-op operation once at startup and serves the panel', async () => {
    const directory = await appDirectory();
    const server = await startDevServer({
      directory,
      host: '127.0.0.1',
      port: 0,
      runOp: ['visit'],
      log: (line) => lines.push(line),
    });
    servers.push(server);

    expect(lines.some((line) => /^GET visit → 200 \d+ms \(run\)$/.test(line))).toBe(true);
    const visit = await httpFetch(`${server.url}/app/${server.appId}/api/visit`);
    expect((await visit.json()).value.visits).toBe(2);
    const panel = await httpFetch(server.panelUrl);
    expect(await panel.text()).toContain('data-op="visit"');
  });
});

describe.skipIf(!existsSync(vendoredDevHost))('reload on save', () => {
  /** The reload messages on an open reload stream, collected as they arrive. */
  async function reloadStream(server: DevServer) {
    const controller = new AbortController();
    const stream = await httpFetch(`${server.url}/__dev/reload`, { signal: controller.signal });
    const reader = stream.body!.getReader();
    const received: string[] = [];
    void (async () => {
      for (;;) {
        const { value, done } = await reader.read().catch(() => ({ value: undefined, done: true }));
        if (done) return;
        for (const line of new TextDecoder().decode(value).split('\n')) {
          if (line.startsWith('data:')) received.push(line);
        }
      }
    })();
    return { received, stop: () => controller.abort() };
  }

  const settle = () => new Promise((resolve) => setTimeout(resolve, 400));

  /** Let a just-started watcher arm before the test writes, then wait for a reload, up to 5 s. */
  const armed = () => new Promise((resolve) => setTimeout(resolve, 200));
  async function firstReload(page: { received: string[] }) {
    for (let waited = 0; waited < 5_000 && page.received.length === 0; waited += 50) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    await settle();
  }

  test('reloads once for a burst of saves', async () => {
    const directory = await appDirectory('first');
    const server = await start(directory);
    const page = await reloadStream(server);
    await armed();

    for (const label of ['second', 'third', 'fourth']) {
      await writeFile(join(directory, 'module.js'), MODULE.replace('LABEL', label));
    }
    await firstReload(page);
    page.stop();

    expect(page.received).toEqual(['data: reload']);
  });

  test('reloads for a file that only shares the state file name as a prefix', async () => {
    const directory = await appDirectory('first');
    const saveState = join(directory, 'module');
    const server = await start(directory, { saveState });
    const page = await reloadStream(server);
    await armed();

    await writeFile(join(directory, 'module.js'), MODULE.replace('LABEL', 'second'));
    await firstReload(page);
    page.stop();

    expect(page.received).toEqual(['data: reload']);
  });

  test('watches the directory of every file --module, --ui, and --styles name', async () => {
    const moduleDirectory = await appDirectory('first');
    const uiDirectory = await mkdtemp(join(tmpdir(), 'charming-dev-ui-'));
    await writeFile(
      join(uiDirectory, 'ui.js'),
      "document.querySelector('#app').innerHTML = '<p>a</p>';",
    );
    const server = await startDevServer({
      module: join(moduleDirectory, 'module.js'),
      ui: join(uiDirectory, 'ui.js'),
      host: '127.0.0.1',
      port: 0,
      log: (line) => lines.push(line),
    });
    servers.push(server);
    const page = await reloadStream(server);
    await armed();

    await writeFile(
      join(uiDirectory, 'ui.js'),
      "document.querySelector('#app').innerHTML = '<p>b</p>';",
    );
    await firstReload(page);
    page.stop();

    expect(page.received).toEqual(['data: reload']);
  });

  test('watches the directory ui.js and styles.css are read from when only --module is named', async () => {
    const directory = await appDirectory('first');
    await mkdir(join(directory, 'src'));
    await writeFile(join(directory, 'src', 'module.js'), MODULE.replace('LABEL', 'first'));
    const cwd = process.cwd();
    process.chdir(directory);
    try {
      const server = await startDevServer({
        module: join('src', 'module.js'),
        host: '127.0.0.1',
        port: 0,
        log: (line) => lines.push(line),
      });
      servers.push(server);
      const page = await reloadStream(server);
      await armed();

      await writeFile(
        join(directory, 'ui.js'),
        "document.querySelector('#app').textContent = 'b';",
      );
      await firstReload(page);
      page.stop();

      expect(page.received).toEqual(['data: reload']);
    } finally {
      process.chdir(cwd);
    }
  });

  test('closes promptly with the reload stream open', async () => {
    const directory = await appDirectory('first');
    const server = await startDevServer({
      directory,
      host: '127.0.0.1',
      port: 0,
      shutdownGraceMs: 5_000,
      log: (line) => lines.push(line),
    });
    const page = await reloadStream(server);

    const started = performance.now();
    await server.close();
    page.stop();

    expect(performance.now() - started).toBeLessThan(2_000);
  });

  test('ignores state files, their temp files, hidden files, and node_modules anywhere in a package App, and still sees a source edit', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'charming-dev-package-'));
    await writeFile(join(directory, 'package.json'), '{"name": "watched"}');
    await mkdir(join(directory, 'src', '.cache'), { recursive: true });
    await mkdir(join(directory, 'node_modules', 'dep'), { recursive: true });
    await mkdir(join(directory, 'src', 'node_modules'), { recursive: true });
    await mkdir(join(directory, 'data'));
    const state = join(directory, 'data', 'seed.json');
    const saveState = join(directory, 'data', 'saved.json');
    await writeFile(state, '{}');
    let changes = 0;
    let onChange: () => void = () => undefined;
    const watcher = watchSources(
      { directory, state, saveState, log: (line) => lines.push(line) },
      () => {
        changes += 1;
        onChange();
      },
    );
    await armed();
    await settle();
    const before = changes;

    await writeFile(state, '{"visits": 1}');
    await writeFile(`${state}.${process.pid}.tmp`, '{}');
    await writeFile(saveState, '{"visits": 2}');
    await writeFile(`${saveState}.${process.pid}.tmp`, '{}');
    await writeFile(join(directory, '.notes'), 'x');
    await writeFile(join(directory, 'src', '.cache', 'x.js'), 'x');
    await writeFile(join(directory, 'node_modules', 'dep', 'x.js'), 'x');
    await writeFile(join(directory, 'src', 'node_modules', 'x.js'), 'x');
    await settle();
    const afterIgnored = changes;
    const seen = new Promise<void>((resolve) => (onChange = resolve));
    await writeFile(join(directory, 'data', 'other.json'), '{}');
    await seen;
    watcher.close();

    expect(afterIgnored).toBe(before);
    expect(changes).toBe(afterIgnored + 1);
  });

  test('watches only the top level of a directory an App saved before packages reads', async () => {
    const legacy = await appDirectory('first');
    const packaged = await mkdtemp(join(tmpdir(), 'charming-dev-package-'));
    await writeFile(join(packaged, 'package.json'), '{"name": "watched"}');
    for (const directory of [legacy, packaged]) {
      await mkdir(join(directory, 'nested'));
      await writeFile(join(directory, 'nested', 'notes.js'), 'first');
    }
    let legacyChanges = 0;
    let onPackageChange: () => void = () => undefined;
    const legacyWatcher = watchSources(
      { directory: legacy, log: (line) => lines.push(line) },
      () => {
        legacyChanges += 1;
      },
    );
    const packageWatcher = watchSources(
      { directory: packaged, log: (line) => lines.push(line) },
      () => onPackageChange(),
    );
    await armed();
    await settle();
    const baseline = legacyChanges;

    const packageSeen = new Promise<void>((resolve) => (onPackageChange = resolve));
    await writeFile(join(legacy, 'nested', 'notes.js'), 'second');
    await writeFile(join(packaged, 'nested', 'notes.js'), 'second');
    await packageSeen;
    await settle();
    const afterNested = legacyChanges;
    await writeFile(join(legacy, 'module.js'), MODULE.replace('LABEL', 'second'));
    await settle();
    legacyWatcher.close();
    packageWatcher.close();

    expect(afterNested - baseline).toBe(0);
    expect(legacyChanges - baseline).toBe(1);
  });

  test('a closed watcher sees no edit that an open one on the same directory does', async () => {
    const directory = await appDirectory('first');
    let closedChanges = 0;
    let onOpenChange: () => void = () => undefined;
    const closed = watchSources({ directory, log: (line) => lines.push(line) }, () => {
      closedChanges += 1;
    });
    const open = watchSources({ directory, log: (line) => lines.push(line) }, () => onOpenChange());
    await armed();

    closed.close();
    const closedBefore = closedChanges;
    const seen = new Promise<void>((resolve) => (onOpenChange = resolve));
    await writeFile(join(directory, 'module.js'), MODULE.replace('LABEL', 'after'));
    await seen;
    await settle();
    open.close();

    expect(closedChanges).toBe(closedBefore);
    expect(lines).toEqual([]);
  });

  test('says when it cannot watch a directory, and the App still serves', async () => {
    const directory = await appDirectory('first');
    const missing = join(directory, 'missing');
    const server = await startDevServer({
      module: join(directory, 'module.js'),
      ui: join(directory, 'ui.js'),
      styles: join(missing, 'styles.css'),
      host: '127.0.0.1',
      port: 0,
      log: (line) => lines.push(line),
    });
    servers.push(server);

    expect(lines).toEqual([
      expect.stringMatching(
        new RegExp(
          `^Could not watch ${missing.replaceAll('.', '\\.')} for changes \\(.+\\); reload the page to pick up edits\\.$`,
        ),
      ),
    ]);
    expect((await httpFetch(`${server.url}/`)).status).toBe(200);
  });

  test('a saved edit reloads the App and signals open pages with no request in between', async () => {
    const directory = await appDirectory('first');
    const server = await start(directory);
    const controller = new AbortController();
    const stream = await httpFetch(`${server.url}/__dev/reload`, { signal: controller.signal });
    const reader = stream.body!.getReader();
    await reader.read();
    await armed();

    await writeFile(join(directory, 'module.js'), MODULE.replace('LABEL', 'second'));
    const { value } = await reader.read();
    controller.abort();

    expect(new TextDecoder().decode(value)).toContain('data: reload');
  });
});

describe.skipIf(!existsSync(vendoredDevHost))('--check', () => {
  async function check(ui: string, clicks: string[] = [], runOp: string[] = []) {
    const directory = await appDirectory();
    await writeFile(
      join(directory, 'module.js'),
      MODULE.replace(
        'export const routes = [',
        `export const routes = [
  {
    op: 'boom',
    method: 'POST',
    handler: () => {
      throw new Error('server exploded');
    },
  },
  {
    op: 'later',
    method: 'POST',
    handler: () => {
      setTimeout(() => {
        throw new Error('host exploded');
      }, 0);
      return { ok: true };
    },
  },
  {
    op: 'laterReject',
    method: 'POST',
    handler: () => {
      setTimeout(() => {
        void Promise.reject(new Error('host rejected'));
      }, 0);
      return { ok: true };
    },
  },
  {
    op: 'slow',
    method: 'POST',
    handler: async () => {
      await new Promise((resolve) => setTimeout(resolve, 6_000));
      return { ok: true };
    },
  },
  {
    op: 'poll',
    method: 'POST',
    handler: async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
      return { ok: true };
    },
  },
  {
    op: 'wrongShape',
    method: 'POST',
    outputSchema: { type: 'object', properties: { count: { type: 'number' } }, required: ['count'] },
    handler: () => ({ count: 'many' }),
  },`,
      ),
    );
    await writeFile(join(directory, 'ui.js'), ui);
    const failures = recordProcessFailures();
    try {
      const server = await start(directory, { runOp });
      return await checkApp(server, { clicks, logLines: lines, failures });
    } finally {
      failures.stop();
    }
  }

  test.each(['boom', 'wrongShape'])(
    'counts a --run-op %s that fails at startup, as an operation error',
    async (op) => {
      const report = await check(
        "document.querySelector('#app').innerHTML = '<p>x</p>';",
        [],
        [op],
      );

      expect(report.ok).toBe(false);
      expect(report.errors).toContainEqual({
        source: 'operation',
        message: expect.stringMatching(/^(?:operation_failed|invalid_output) for /),
      });
    },
  );

  test('reports an operation the ui calls that throws, as an operation error', async () => {
    const report = await check(
      "document.querySelector('#app').innerHTML = '<p>x</p>'; window.charming.api('in-process-dev').boom().catch(() => {});",
    );

    expect(report.ok).toBe(false);
    expect(report.errors).toContainEqual({
      source: 'operation',
      message: expect.stringMatching(/^operation_failed for /),
    });
  });

  test('reports the runtime report of a ui that throws, as a runtime error', async () => {
    const report = await check(
      "document.querySelector('#app').innerHTML = '<p>x</p>'; throw new Error('ui exploded');",
    );

    expect(report.errors).toContainEqual({
      source: 'runtime',
      message: expect.stringMatching(/^browser diag\/report: .*ui exploded/),
    });
  });

  test('reports an operation whose output breaks its schema, as an operation error', async () => {
    const report = await check(
      "document.querySelector('#app').innerHTML = '<p>x</p>'; window.charming.api('in-process-dev').wrongShape().catch(() => {});",
    );

    expect(report.ok).toBe(false);
    expect(report.errors).toContainEqual({
      source: 'operation',
      message: expect.stringMatching(/^invalid_output for op wrongShape: /),
    });
  });

  test('reports a page error event that carries only a message', async () => {
    const report = await check(
      "document.querySelector('#app').innerHTML = '<p>x</p>'; window.dispatchEvent(new ErrorEvent('error', { message: 'script error in ui.js' }));",
    );

    expect(report.ok).toBe(false);
    expect(report.errors).toContainEqual({ source: 'page', message: 'script error in ui.js' });
    expect(report.errors.map((error) => error.message)).not.toContain('undefined');
  });

  test('reports what the page logs with console.error, as a page error', async () => {
    const report = await check(
      "document.querySelector('#app').innerHTML = '<p>x</p>'; console.error('logged failure');",
    );

    expect(report.ok).toBe(false);
    expect(report.errors).toContainEqual({ source: 'page', message: 'logged failure' });
  });

  test('reports an exception the server code throws outside a request, as a host error', async () => {
    // The throw reaches this process, so let only the check's own handler see it.
    const listeners = process.listeners('uncaughtException');
    process.removeAllListeners('uncaughtException');
    try {
      const report = await check(
        "document.querySelector('#app').innerHTML = '<p>x</p>'; window.charming.api('in-process-dev').later();",
      );

      expect(report.ok).toBe(false);
      expect(report.errors).toContainEqual({ source: 'host', message: 'host exploded' });
    } finally {
      for (const listener of listeners) process.on('uncaughtException', listener);
    }
  });

  test('reports a rejection the server code leaves unhandled, as a host error', async () => {
    const listeners = process.listeners('unhandledRejection');
    process.removeAllListeners('unhandledRejection');
    try {
      const report = await check(
        "document.querySelector('#app').innerHTML = '<p>x</p>'; window.charming.api('in-process-dev').laterReject();",
      );

      expect(report.ok).toBe(false);
      expect(report.errors).toContainEqual({ source: 'host', message: 'host rejected' });
    } finally {
      for (const listener of listeners) process.on('unhandledRejection', listener);
    }
  });

  test('reports a click handler that rejects, as a page error', async () => {
    const report = await check(
      "document.querySelector('#app').innerHTML = '<button id=\"go\">Go</button>'; document.querySelector('#go').onclick = async () => { await null; throw new Error('click rejected'); };",
      ['#go'],
    );

    expect(report.ok).toBe(false);
    expect(report.errors).toContainEqual({ source: 'page', message: 'click rejected' });
  });

  test("reports an error happy-dom throws for the page's own call, as a page error", async () => {
    const report = await check(
      `document.querySelector('#app').innerHTML = '<button id="query">Query</button><button id="abort">Abort</button>';
document.querySelector('#query').onclick = async () => {
  await null;
  document.querySelector('[');
};
document.querySelector('#abort').onclick = async () => {
  const controller = new AbortController();
  const answer = fetch(location.origin + '/app/in-process-dev/api/visit', { signal: controller.signal });
  controller.abort();
  await answer;
};`,
      ['#query', '#abort'],
    );

    expect(report.errors).toEqual([
      { source: 'page', message: expect.stringContaining('is not a valid selector') },
      { source: 'page', message: expect.stringContaining('aborted') },
    ]);
  });

  test('fails a check that ends with an operation still running', async () => {
    const report = await check(
      "document.querySelector('#app').innerHTML = '<p>x</p>'; window.charming.api('in-process-dev').slow().catch(() => {});",
    );

    expect(report.ok).toBe(false);
    expect(report.errors).toContainEqual({
      source: 'operation',
      message: expect.stringMatching(/\/api\/slow was still running when the check ended/),
    });
  }, 20_000);

  test('fails a malformed --click selector and keeps the rest of the report', async () => {
    const report = await check(
      "document.querySelector('#app').innerHTML = '<button id=\"go\">Go</button>';",
      ['button[', '#go'],
    );

    expect(report.render.empty).toBe(false);
    expect(report.clicks).toEqual([
      { selector: 'button[', ok: false, message: expect.stringMatching(/^Invalid selector: /) },
      { selector: '#go', ok: true },
    ]);
    expect(report.ok).toBe(false);
  });

  test('waits for an async click handler before the next click, and for a late operation failure', async () => {
    const report = await check(
      `document.querySelector('#app').innerHTML = '<button id="go">Go</button>';
document.querySelector('#go').onclick = async () => {
  await new Promise((resolve) => setTimeout(resolve, 600));
  const { visits } = await window.charming.api('in-process-dev').visit();
  document.querySelector('#app').innerHTML = '<button id="next">' + visits + '</button>';
  document.querySelector('#next').onclick = () => {
    setTimeout(() => window.charming.api('in-process-dev').boom().catch(() => {}), 600);
  };
};`,
      ['#go', '#next'],
    );

    expect(report.clicks).toEqual([
      { selector: '#go', ok: true },
      { selector: '#next', ok: true },
    ]);
    expect(report.errors.some((error) => error.source === 'operation')).toBe(true);
  });

  test('waits for an operation the page calls after it renders, with no clicks', async () => {
    const report = await check(
      "document.querySelector('#app').innerHTML = '<p>x</p>'; setTimeout(() => window.charming.api('in-process-dev').boom().catch(() => {}), 300);",
    );

    expect(report.ok).toBe(false);
    expect(report.errors.some((error) => error.source === 'operation')).toBe(true);
  });

  test('answers an image, frame, fetch, XHR, sync XHR, or beacon to another origin without reaching it', async () => {
    // Counts only the page's paths: a local tool may probe any new port at `/`.
    const pagePaths = ['/img.png', '/frame', '/fetch', '/xhr', '/sync', '/beacon'];
    // In its own process, so a synchronous XHR that blocks this one can still reach it.
    const sentinel = spawn(process.execPath, [
      '-e',
      `const paths = new Set(${JSON.stringify(pagePaths)});
require('node:http').createServer((request, response) => {
  if (paths.has(request.url)) process.stdout.write('reached ' + request.url + '\\n');
  response.end('ok');
}).listen(0, '127.0.0.1', function () { process.stdout.write('port ' + this.address().port + '\\n'); });`,
    ]);
    let output = '';
    sentinel.stdout.setEncoding('utf8').on('data', (chunk: string) => (output += chunk));
    try {
      const port = await new Promise<string>((resolve, reject) => {
        sentinel.stdout.on('data', () => {
          const match = /port (\d+)\n/.exec(output);
          if (match) resolve(match[1]);
        });
        sentinel.on('exit', (code) => reject(new Error(`The sentinel exited with ${code}`)));
      });
      const elsewhere = `http://127.0.0.1:${port}`;
      const report = await check(
        `document.querySelector('#app').innerHTML = '<p>x</p><img src="${elsewhere}/img.png"><iframe src="${elsewhere}/frame"></iframe>';
fetch('${elsewhere}/fetch').catch(() => {});
const xhr = new XMLHttpRequest(); xhr.open('GET', '${elsewhere}/xhr'); xhr.send();
const sync = new XMLHttpRequest(); sync.open('GET', '${elsewhere}/sync', false); sync.send();
if (navigator.sendBeacon) navigator.sendBeacon('${elsewhere}/beacon', 'x');`,
      );

      expect(report.render.empty).toBe(false);
      expect(report.errors.filter((error) => error.message.includes('/sync'))).toEqual([]);
      expect(output).not.toContain('reached');
    } finally {
      sentinel.kill();
    }
  });

  test('settles promptly after a request to the dev server that the page aborts', async () => {
    const started = performance.now();
    const report = await check(
      `document.querySelector('#app').innerHTML = '<button id="go">Go</button>';
setTimeout(() => {}, 10_000);
const controller = new AbortController();
fetch(location.origin + '/app/in-process-dev/api/visit', { signal: controller.signal }).catch(() => {});
controller.abort();`,
    );

    expect(report.ok).toBe(true);
    // The pending timer holds the wait for page tasks to its 2 s cap, so only
    // the abort listener empties the in-flight set; a leaked request would
    // hold the quiet wait to its 3 s cap too.
    expect(performance.now() - started).toBeLessThan(4_500);
  });

  test('passes an App that renders and runs its operations', async () => {
    const report = await check(
      "window.charming.api('in-process-dev').visit().then((r) => { document.querySelector('#app').innerHTML = `<p id=\"n\">${r.visits}</p>`; });",
    );

    expect(report).toMatchObject({ ok: true, render: { empty: false }, errors: [], findings: [] });
  });

  test('passes an App that polls an operation on an interval', async () => {
    // Each poll outlasts the interval, so one is always in flight when the check ends.
    const report = await check(
      `const api = window.charming.api('in-process-dev');
let polls = 0;
document.querySelector('#app').innerHTML = '<p id="n">0</p>';
setInterval(() => api.poll().then(() => { document.querySelector('#n').textContent = String(++polls); }), 300);`,
    );

    expect(report).toMatchObject({ ok: true, render: { empty: false }, errors: [], findings: [] });
  }, 20_000);

  test('fails an App that renders nothing', async () => {
    const report = await check('void 0;');

    expect(report.ok).toBe(false);
    expect(report.render.empty).toBe(true);
  });

  test('fails an App whose ui throws', async () => {
    const report = await check(
      "document.querySelector('#app').innerHTML = '<p>x</p>'; throw new Error('ui exploded');",
    );

    expect(report.ok).toBe(false);
    expect(report.errors.some((error) => error.message.includes('ui exploded'))).toBe(true);
  });

  test('clicks in order and fails a selector that matches nothing', async () => {
    const report = await check(
      "document.querySelector('#app').innerHTML = '<button id=\"go\">Go</button>'; document.querySelector('#go').onclick = () => { document.querySelector('#go').textContent = 'Gone'; };",
      ['#go', '#missing'],
    );

    expect(report.clicks).toEqual([
      { selector: '#go', ok: true },
      { selector: '#missing', ok: false, message: 'No element matches the selector.' },
    ]);
    expect(report.ok).toBe(false);
  });

  test('reports embed-breakers without failing the check', async () => {
    const report = await check(
      "document.querySelector('#app').innerHTML = '<a href=\"https://x.test\" target=\"_blank\">x</a>'; if (false) confirm('?');",
    );

    expect(report.ok).toBe(true);
    expect(report.findings.map((finding) => finding.rule).sort()).toEqual([
      'blocking-dialog',
      'new-tab-link',
      'new-tab-link',
    ]);
  });
});
