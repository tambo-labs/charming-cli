import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'vitest';

import { startDevServer, type DevServer } from './dev.js';

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
    expect(lines.join('\n')).toContain('GET /api/visit 200');
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
