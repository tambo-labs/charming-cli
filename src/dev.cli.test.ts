import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { expect, test } from 'vitest';

import { DEV_HOST_API_VERSION } from './dev.js';

const binary = join(import.meta.dirname, '..', 'bin', 'run.js');
const crudTemplate = join(import.meta.dirname, '..', 'skills', 'charming', 'templates', 'crud');
const vendoredDevHost = join(import.meta.dirname, '..', 'vendor', 'dev-host.js');

/**
 * Why the end-to-end tests cannot run, or null when they can. Inside the
 * monorepo the global setup always builds the bundle; a public checkout can
 * hold none, or one from an older server release than this CLI expects.
 */
async function devHostUnavailable(): Promise<string | null> {
  if (!existsSync(vendoredDevHost)) return `${vendoredDevHost} is missing`;
  const bundle = (await import(pathToFileURL(vendoredDevHost).href)) as {
    DEV_HOST_API_VERSION?: unknown;
  };
  return bundle.DEV_HOST_API_VERSION === DEV_HOST_API_VERSION
    ? null
    : `${vendoredDevHost} has dev host API ${String(bundle.DEV_HOST_API_VERSION)}, not ${DEV_HOST_API_VERSION}`;
}

const unavailable = await devHostUnavailable();
if (unavailable) {
  console.warn(`Skipping the charming dev end-to-end tests: ${unavailable}.`);
}
const endToEnd = unavailable ? test.skip : test;

/** GET `path` with raw headers, which `fetch` would not let a test forge. */
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

/** Send `head` verbatim on a raw socket and resolve with the response's status line. */
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

function runDev(args: string[], cwd: string) {
  const child = spawn(process.execPath, [binary, 'dev', ...args], { cwd });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk));
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk));
  const exited = new Promise<number | null>((resolve) => child.on('exit', resolve));
  const started = new Promise<{ url: string; appId: string }>((resolve, reject) => {
    child.stdout.on('data', () => {
      try {
        resolve(JSON.parse(stdout) as { url: string; appId: string });
      } catch {
        return;
      }
    });
    void exited.then((code) => reject(new Error(`charming dev exited with ${code}: ${stderr}`)));
  });
  started.catch(() => undefined);
  return { child, exited, started, output: () => ({ stdout, stderr }) };
}

endToEnd('charming dev serves the app, runs its operations, and saves state on exit', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'charming-dev-cli-'));
  const seeded = [{ id: 'seed-1', text: 'Seeded item', done: false }];
  await writeFile(join(cwd, 'state.json'), JSON.stringify({ items_v1: seeded }));
  await writeFile(join(cwd, 'user.json'), JSON.stringify({ id: 'user-1', handle: 'demo' }));
  const dev = runDev(
    [
      crudTemplate,
      '--port',
      '0',
      '--state',
      'state.json',
      '--save-state',
      'saved.json',
      '--user',
      'user.json',
    ],
    cwd,
  );

  try {
    const { url, appId } = await dev.started;
    const api = `${url}/app/${appId}/api`;

    const page = await fetch(`${url}/`);
    const html = await page.text();
    const added = await fetch(`${api}/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Added over HTTP' }),
    });
    const addedBody = (await added.json()) as { ok: boolean; value: { id: string; text: string } };
    const listed = await fetch(`${api}/list`);
    const port = new URL(url).port;
    const viaLocalhost = await rawGet(url, '/', { host: `localhost:${port}` });
    const rebound = await rawGet(url, '/', { host: `attacker.example:${port}` });
    const crossSite = await rawGet(url, `/app/${appId}/api/list`, {
      origin: 'https://attacker.example',
    });
    const malformed = await rawStatusLine(
      url,
      `GET //[ HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`,
    );
    const afterMalformed = await fetch(`${api}/list`);
    const crossSiteFetch = await rawGet(url, `/app/${appId}/api/list`, {
      'sec-fetch-site': 'cross-site',
    });
    const sameOriginFetch = await rawGet(url, `/app/${appId}/api/list`, {
      'sec-fetch-site': 'same-origin',
    });
    const loopbackOrigin = await rawGet(url, `/app/${appId}/api/list`, {
      host: `127.0.0.1:${port}`,
      origin: `http://127.0.0.1:${port}`,
    });
    const localhostOrigin = await rawGet(url, `/app/${appId}/api/list`, {
      host: `localhost:${port}`,
      origin: `http://localhost:${port}`,
    });
    const savedWhileRunning = JSON.parse(await readFile(join(cwd, 'saved.json'), 'utf8')) as {
      items_v1: Array<{ text: string }>;
    };

    expect(page.status).toBe(200);
    expect(html).toContain('window.__CHARMING_RUNTIME_CONFIG__');
    expect(html).toContain('"handle":"demo"');
    expect(addedBody).toMatchObject({ ok: true, value: { text: 'Added over HTTP', done: false } });
    expect(await listed.json()).toEqual({ ok: true, value: [...seeded, addedBody.value] });
    expect(viaLocalhost.status).toBe(200);
    expect(viaLocalhost.body).toContain(`"apiBaseUrl":"http://localhost:${port}"`);
    expect(rebound.status).toBe(403);
    expect(JSON.parse(rebound.body).error.kind).toBe('forbidden_host');
    expect(crossSite.status).toBe(403);
    expect(JSON.parse(crossSite.body).error.kind).toBe('forbidden_origin');
    expect(malformed).toBe('HTTP/1.1 400 Bad Request');
    expect(afterMalformed.status).toBe(200);
    expect(crossSiteFetch.status).toBe(403);
    expect(JSON.parse(crossSiteFetch.body).error.kind).toBe('forbidden_origin');
    expect(sameOriginFetch.status).toBe(200);
    expect(loopbackOrigin.status).toBe(200);
    expect(localhostOrigin.status).toBe(200);
    expect(savedWhileRunning.items_v1.map((item) => item.text)).toEqual([
      'Seeded item',
      'Added over HTTP',
    ]);
  } finally {
    dev.child.kill('SIGTERM');
  }

  expect(await dev.exited).toBe(0);
  const saved = JSON.parse(await readFile(join(cwd, 'saved.json'), 'utf8')) as {
    items_v1: Array<{ text: string }>;
  };
  expect(saved.items_v1.map((item) => item.text)).toEqual(['Seeded item', 'Added over HTTP']);
});

endToEnd('charming dev refuses an app without a dated manifest schema', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'charming-dev-cli-'));
  await writeFile(
    join(cwd, 'module.js'),
    "export const manifest = { id: 'legacy-app', version: '1.0.0' };\nexport default { fetch: () => new Response('ok') };\n",
  );
  const dev = runDev([cwd, '--port', '0'], cwd);

  expect(await dev.exited).toBe(2);
  expect(JSON.parse(dev.output().stderr)).toMatchObject({
    ok: false,
    error: { kind: 'unsupported_manifest_version' },
  });
});

endToEnd.each([
  ['--state', '[1, 2]', 'invalid_state'],
  ['--state', '{not json', 'invalid_json'],
  ['--user', '{"handle": "no-id"}', 'invalid_user'],
])('charming dev rejects a bad %s file %s', async (flag, contents, kind) => {
  const cwd = await mkdtemp(join(tmpdir(), 'charming-dev-cli-'));
  await writeFile(join(cwd, 'fixture.json'), contents);
  const dev = runDev([crudTemplate, '--port', '0', flag, 'fixture.json'], cwd);

  expect(await dev.exited).toBe(2);
  expect(JSON.parse(dev.output().stderr)).toMatchObject({ ok: false, error: { kind } });
});

endToEnd('charming dev refuses an unwritable --save-state before serving', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'charming-dev-cli-'));
  const dev = runDev(
    [crudTemplate, '--port', '0', '--save-state', join('missing-directory', 'state.json')],
    cwd,
  );

  expect(await dev.exited).toBe(2);
  expect(dev.output().stdout).toBe('');
  expect(JSON.parse(dev.output().stderr)).toMatchObject({
    ok: false,
    error: { kind: 'save_state_failed' },
  });
});

endToEnd('charming dev keeps answering operations when a --save-state write fails', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'charming-dev-cli-'));
  await mkdir(join(cwd, 'state'));
  const dev = runDev([crudTemplate, '--port', '0', '--save-state', 'state/saved.json'], cwd);
  const add = (url: string, appId: string, text: string) =>
    fetch(`${url}/app/${appId}/api/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

  try {
    const { url, appId } = await dev.started;
    await rm(join(cwd, 'state'), { recursive: true });

    const unsaved = await add(url, appId, 'While the directory is gone');
    await mkdir(join(cwd, 'state'));
    const saved = await add(url, appId, 'After it is back');
    const file = JSON.parse(await readFile(join(cwd, 'state', 'saved.json'), 'utf8')) as {
      items_v1: Array<{ text: string }>;
    };

    expect(unsaved.status).toBe(200);
    expect(await unsaved.json()).toMatchObject({
      ok: true,
      value: { text: 'While the directory is gone' },
    });
    expect(saved.status).toBe(200);
    expect(file.items_v1.map((item) => item.text)).toEqual([
      'While the directory is gone',
      'After it is back',
    ]);
    expect(dev.output().stderr).toContain('Could not write --save-state');

    await rm(join(cwd, 'state'), { recursive: true });
    const lastWrite = await add(url, appId, 'Saved only on exit');
    await mkdir(join(cwd, 'state'));
    expect(lastWrite.status).toBe(200);
    expect(existsSync(join(cwd, 'state', 'saved.json'))).toBe(false);
  } finally {
    dev.child.kill('SIGTERM');
  }

  expect(await dev.exited).toBe(0);
  const onExit = JSON.parse(await readFile(join(cwd, 'state', 'saved.json'), 'utf8')) as {
    items_v1: Array<{ text: string }>;
  };
  expect(onExit.items_v1.map((item) => item.text)).toEqual([
    'While the directory is gone',
    'After it is back',
    'Saved only on exit',
  ]);
});

endToEnd(
  'charming dev bound to every interface admits IP-literal hosts and refuses names',
  async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'charming-dev-cli-'));
    const dev = runDev([crudTemplate, '--port', '0', '--host', '0.0.0.0'], cwd);

    try {
      const { url } = await dev.started;
      const port = new URL(url).port;
      const local = `http://127.0.0.1:${port}`;

      const viaAddress = await rawGet(local, '/', { host: `192.168.1.10:${port}` });
      const viaName = await rawGet(local, '/', { host: `attacker.example:${port}` });

      expect(viaAddress.status).toBe(200);
      expect(viaName.status).toBe(403);
      expect(JSON.parse(viaName.body).error.kind).toBe('forbidden_host');
      expect(dev.output().stderr).toContain('Warning: listening on 0.0.0.0');
    } finally {
      dev.child.kill('SIGTERM');
      await dev.exited;
    }
  },
);

/** A copy of the built CLI whose `vendor/` holds `bundle`, or nothing when it is undefined. */
async function cliCopy(bundle: string | undefined): Promise<string> {
  const packageRoot = join(import.meta.dirname, '..');
  const copy = await mkdtemp(join(tmpdir(), 'charming-cli-copy-'));
  for (const entry of ['bin', 'dist', 'package.json']) {
    await cp(join(packageRoot, entry), join(copy, entry), { recursive: true });
  }
  await symlink(join(packageRoot, 'node_modules'), join(copy, 'node_modules'));
  if (bundle !== undefined) {
    await mkdir(join(copy, 'vendor'));
    await writeFile(join(copy, 'vendor', 'dev-host.js'), bundle);
  }
  return copy;
}

test.each([
  ['without a vendored dev host', undefined, 'dev_host_missing'],
  [
    'with a dev host from another release',
    "export const DEV_HOST_API_VERSION = 0; export const DEV_APP_ID = 'x'; export function createDevHost() {}",
    'dev_host_mismatch',
  ],
])('charming dev explains a CLI %s', async (_label, bundle, kind) => {
  const copy = await cliCopy(bundle);
  const child = spawn(process.execPath, [
    join(copy, 'bin', 'run.js'),
    'dev',
    crudTemplate,
    '--port',
    '0',
  ]);
  let stderr = '';
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk));
  const exitCode = await new Promise<number | null>((resolve) => child.on('exit', resolve));

  expect(exitCode).toBe(2);
  expect(JSON.parse(stderr)).toMatchObject({ ok: false, error: { kind } });
  expect(JSON.parse(stderr).error.message).toContain('upgrade the CLI');
});
