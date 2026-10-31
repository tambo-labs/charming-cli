import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer, request as httpRequest } from 'node:http';
import { type AddressInfo, connect } from 'node:net';
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

endToEnd('charming dev --as viewer is asked to sign in for a members-only write', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'charming-dev-cli-'));
  const dev = runDev([crudTemplate, '--port', '0', '--as', 'viewer'], cwd);

  try {
    const { url, appId } = await dev.started;
    const added = await fetch(`${url}/app/${appId}/api/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Refused' }),
    });

    expect(added.status).toBe(401);
    expect(await added.json()).toMatchObject({ error: { kind: 'sign_in_required' } });
  } finally {
    dev.child.kill('SIGTERM');
  }
  expect(await dev.exited).toBe(0);
});

endToEnd(
  'charming dev --check prints one JSON report and exits 9 for a broken page, on a free port',
  async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'charming-dev-cli-'));
    await cp(crudTemplate, join(cwd, 'app'), { recursive: true });
    await writeFile(join(cwd, 'app', 'ui.js'), "throw new Error('ui exploded');\n");
    const dev = runDev(['app', '--check', '--port', '1', '--host', '0.0.0.0'], cwd);

    expect(await dev.exited).toBe(9);
    const report = JSON.parse(dev.output().stdout) as {
      ok: boolean;
      errors: Array<{ message: string }>;
    };
    expect(report.ok).toBe(false);
    expect(report.errors.some((error) => error.message.includes('ui exploded'))).toBe(true);
    expect(dev.output().stderr).not.toContain('Warning: listening on');
  },
);

endToEnd('charming dev --check exits 9 when only a --click fails', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'charming-dev-cli-'));
  await cp(crudTemplate, join(cwd, 'app'), { recursive: true });
  const dev = runDev(['app', '--check', '--click', '#nope'], cwd);

  expect(await dev.exited).toBe(9);
  expect(JSON.parse(dev.output().stdout)).toMatchObject({
    ok: false,
    render: { empty: false },
    errors: [],
    clicks: [{ selector: '#nope', ok: false, message: 'No element matches the selector.' }],
  });
});

endToEnd(
  'charming dev --check exits 0 with one passing report while the server code holds a timer',
  async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'charming-dev-cli-'));
    await cp(crudTemplate, join(cwd, 'app'), { recursive: true });
    const module = join(cwd, 'app', 'module.js');
    await writeFile(module, `${await readFile(module, 'utf8')}\nsetInterval(() => {}, 1000);\n`);
    const dev = runDev(['app', '--check'], cwd);
    try {
      const exited = await Promise.race([
        dev.exited,
        new Promise<'still running'>((resolve) =>
          setTimeout(() => resolve('still running'), 15_000),
        ),
      ]);

      expect(exited).toBe(0);
      expect(JSON.parse(dev.output().stdout)).toMatchObject({
        ok: true,
        render: { empty: false },
        errors: [],
      });
    } finally {
      dev.child.kill('SIGKILL');
    }
  },
);

endToEnd(
  'charming dev --check exits 2 when startup fails after the server code started a timer',
  async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'charming-dev-cli-'));
    await cp(crudTemplate, join(cwd, 'app'), { recursive: true });
    const module = join(cwd, 'app', 'module.js');
    await writeFile(module, `${await readFile(module, 'utf8')}\nsetInterval(() => {}, 1000);\n`);
    const dev = runDev(['app', '--check', '--run-op', 'typo'], cwd);
    try {
      const exited = await Promise.race([
        dev.exited,
        new Promise<'still running'>((resolve) =>
          setTimeout(() => resolve('still running'), 15_000),
        ),
      ]);

      expect(exited).toBe(2);
      expect(dev.output().stderr).toMatch(/"kind": "operation_not_found"/);
      expect(dev.output().stdout).toBe('');
    } finally {
      dev.child.kill('SIGKILL');
    }
  },
  30_000,
);

endToEnd(
  'charming dev --check keeps its exit code and one report when the server code throws after the report',
  async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'charming-dev-cli-'));
    await cp(crudTemplate, join(cwd, 'app'), { recursive: true });
    const module = join(cwd, 'app', 'module.js');
    await writeFile(
      module,
      `${await readFile(module, 'utf8')}
routes.push({
  op: 'late',
  method: 'POST',
  handler: async () => {
    await new Promise((resolve) => setTimeout(resolve, 6_000));
    queueMicrotask(() => {
      throw new Error('thrown after the report');
    });
    return { ok: true };
  },
});
`,
    );
    const ui = join(cwd, 'app', 'ui.js');
    await writeFile(ui, `${await readFile(ui, 'utf8')}\napi.late().catch(() => {});\n`);
    const dev = runDev(['app', '--check'], cwd);

    expect(await dev.exited).toBe(9);
    const report = JSON.parse(dev.output().stdout) as {
      errors: Array<{ source: string; message: string }>;
    };
    expect(report.errors).toEqual([
      { source: 'operation', message: expect.stringContaining('/api/late was still running') },
    ]);
    expect(dev.output().stderr).not.toContain('after the report');
  },
  30_000,
);

endToEnd(
  'charming dev --check reports a rejection the server code leaves unhandled at startup, as a host error',
  async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'charming-dev-cli-'));
    await cp(crudTemplate, join(cwd, 'app'), { recursive: true });
    const module = join(cwd, 'app', 'module.js');
    await writeFile(
      module,
      `${await readFile(module, 'utf8')}\nPromise.reject(new Error('rejected at startup'));\n`,
    );
    // The --save-state probe write is the first wait on I/O after the module loads.
    const dev = runDev(['app', '--check', '--save-state', 'saved.json'], cwd);

    expect(await dev.exited).toBe(9);
    const report = JSON.parse(dev.output().stdout) as {
      errors: Array<{ source: string; message: string }>;
    };
    expect(report.errors).toContainEqual({ source: 'host', message: 'rejected at startup' });
  },
);

endToEnd(
  'charming dev --check prints its report and exits 2 when the --save-state write on close fails',
  async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'charming-dev-cli-'));
    await cp(crudTemplate, join(cwd, 'app'), { recursive: true });
    const module = join(cwd, 'app', 'module.js');
    await writeFile(module, `${await readFile(module, 'utf8')}\nsetInterval(() => {}, 1000);\n`);
    const ui = join(cwd, 'app', 'ui.js');
    await writeFile(
      ui,
      `${await readFile(ui, 'utf8')}\napi.add({ text: 'saved' });\nsetInterval(() => api.add({ text: 'unsaved' }).catch(() => {}), 200);\n`,
    );
    await mkdir(join(cwd, 'state'));
    const dev = runDev(['app', '--check', '--save-state', join('state', 'saved.json')], cwd);
    try {
      for (let waited = 0; !existsSync(join(cwd, 'state', 'saved.json')); waited += 10) {
        if (waited > 10_000) throw new Error(`No first save: ${dev.output().stderr}`);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      await rm(join(cwd, 'state'), { recursive: true });
      const exited = await Promise.race([
        dev.exited,
        new Promise<'still running'>((resolve) =>
          setTimeout(() => resolve('still running'), 15_000),
        ),
      ]);

      expect(exited).toBe(2);
      expect(JSON.parse(dev.output().stdout)).toMatchObject({ render: { empty: false } });
      expect(dev.output().stderr).toContain('Could not write --save-state');
      expect(dev.output().stderr).toMatch(/"ok": false/);
    } finally {
      dev.child.kill('SIGKILL');
    }
  },
  30_000,
);

endToEnd('charming dev refuses --click without --check', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'charming-dev-cli-'));
  const dev = runDev([crudTemplate, '--port', '0', '--click', '#add'], cwd);

  expect(await dev.exited).toBe(2);
  expect(dev.output().stdout).toBe('');
  expect(dev.output().stderr).toContain('--check');
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
  [
    'with a dev host from the release before reload on save',
    "export const DEV_HOST_API_VERSION = 2; export const DEV_APP_ID = 'x'; export const DEV_PANEL_PATH = '/__dev'; export function createDevHost() {}",
    'dev_host_mismatch',
  ],
  [
    'with a dev host that lists no stream paths',
    `export const DEV_HOST_API_VERSION = ${DEV_HOST_API_VERSION}; export const DEV_APP_ID = 'x'; export const DEV_PANEL_PATH = '/__dev'; export function createDevHost() {}`,
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

test('charming dev refuses --pull-data on a non-loopback --host before reaching Charming', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'charming-dev-cli-'));
  const dev = runDev(
    ['00000000-0000-4000-8000-000000000001', '--pull-data', 'exportData', '--host', '0.0.0.0'],
    cwd,
  );

  expect(await dev.exited).toBe(2);
  expect(JSON.parse(dev.output().stderr)).toMatchObject({
    ok: false,
    error: { kind: 'invalid_arguments' },
  });
});

const LIVE_APP_ID = '00000000-0000-4000-8000-000000000001';

/** A fake Charming serving the crud template as a live App whose read-only `list` returns `items`. */
async function liveCharming(items: unknown[], use: (baseUrl: string) => Promise<void>) {
  const source = {
    module: await readFile(join(crudTemplate, 'module.js'), 'utf8'),
    ui: await readFile(join(crudTemplate, 'ui.js'), 'utf8'),
    styles: await readFile(join(crudTemplate, 'styles.css'), 'utf8'),
  };
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://charming.test').pathname;
    const body =
      path === `/app/${LIVE_APP_ID}/source`
        ? { ok: true, source }
        : path === `/app/${LIVE_APP_ID}/agent.json`
          ? {
              operations: [
                {
                  op: 'list',
                  method: 'GET',
                  path: '/api/list',
                  readOnly: true,
                  discoveredFrom: ['routes_export'],
                },
              ],
            }
          : path === `/app/${LIVE_APP_ID}/api/list`
            ? { ok: true, value: { items_v1: items } }
            : null;
    response.writeHead(body ? 200 : 404, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(body ?? { ok: false, error: { kind: 'not_found' } }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await use(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

endToEnd('charming dev <app-id> --pull-data serves the storage the live App returned', async () => {
  const items = [{ id: 'live-1', text: 'Live item', done: false }];
  await liveCharming(items, async (baseUrl) => {
    const cwd = await mkdtemp(join(tmpdir(), 'charming-dev-cli-'));
    const dev = runDev(
      [
        LIVE_APP_ID,
        '--base-url',
        baseUrl,
        '--token',
        'chrm_user_fixture',
        '--pull-data',
        'list',
        '--port',
        '0',
      ],
      cwd,
    );
    try {
      const { url, appId } = await dev.started;
      const listed = await fetch(`${url}/app/${appId}/api/list`);

      expect(await listed.json()).toEqual({ ok: true, value: items });
      expect(existsSync(join(cwd, LIVE_APP_ID, 'module.js'))).toBe(true);
    } finally {
      dev.child.kill('SIGTERM');
    }
    expect(await dev.exited).toBe(0);
  });
});

endToEnd(
  'charming dev <app-id> without --pull-data never reads the data an earlier pull left',
  async () => {
    const items = [{ id: 'live-1', text: 'Live item', done: false }];
    const seeded = [{ id: 'seed-1', text: 'Seeded item', done: false }];
    await liveCharming(items, async (baseUrl) => {
      const cwd = await mkdtemp(join(tmpdir(), 'charming-dev-cli-'));
      const auth = ['--base-url', baseUrl, '--token', 'chrm_user_fixture', '--port', '0'];
      const listAfter = async (args: string[]) => {
        const dev = runDev([LIVE_APP_ID, ...auth, ...args], cwd);
        try {
          const { url, appId } = await dev.started;
          return await (await fetch(`${url}/app/${appId}/api/list`)).json();
        } finally {
          dev.child.kill('SIGTERM');
          await dev.exited;
        }
      };
      await writeFile(join(cwd, 'seed.json'), JSON.stringify({ items_v1: seeded }));

      expect(await listAfter(['--pull-data', 'list'])).toEqual({ ok: true, value: items });
      expect(existsSync(join(cwd, LIVE_APP_ID, '.charming-dev', 'state.json'))).toBe(true);
      expect(await listAfter([])).toEqual({ ok: true, value: [] });
      expect(await listAfter(['--out', LIVE_APP_ID])).toEqual({ ok: true, value: [] });
      expect(await listAfter(['--state', 'seed.json'])).toEqual({ ok: true, value: seeded });
    });
  },
);

test('charming dev <app-id> --pull-data exits 2 with invalid_state for a symlinked .charming-dev', async () => {
  await liveCharming([], async (baseUrl) => {
    const cwd = await mkdtemp(join(tmpdir(), 'charming-dev-cli-'));
    await mkdir(join(cwd, 'app'));
    await symlink(
      await mkdtemp(join(tmpdir(), 'charming-dev-cli-elsewhere-')),
      join(cwd, 'app', '.charming-dev'),
    );
    const dev = runDev(
      [
        LIVE_APP_ID,
        '--base-url',
        baseUrl,
        '--token',
        'chrm_user_fixture',
        '--out',
        'app',
        '--pull-data',
        'list',
      ],
      cwd,
    );

    expect(await dev.exited).toBe(2);
    expect(JSON.parse(dev.output().stderr)).toMatchObject({
      ok: false,
      error: { kind: 'invalid_state' },
    });
    expect(existsSync(join(cwd, 'app', 'module.js'))).toBe(false);
  });
});
