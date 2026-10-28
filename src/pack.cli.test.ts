import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'vitest';

const packageRoot = join(import.meta.dirname, '..');
const insideMonorepo = existsSync(join(packageRoot, '..', 'repo__cli-dev-host', 'package.json'));

const APP = `
export const manifest = {
  $schema: 'https://charm.ing/schema/app-manifest/2026-10-16.json',
  id: 'packed-smoke',
  meta: { name: 'Packed smoke' },
  capabilities: { imports: ['charming:storage/kv@1.0'] },
};
export const routes = [
  {
    op: 'count',
    method: 'POST',
    handler: async (_input, { env }) => {
      const count = ((await env.storage.get('count')) ?? 0) + 1;
      await env.storage.put('count', count);
      return { count };
    },
  },
];
`;

const PROBE = `
const { createDevHost, DEV_APP_ID } = await import('./vendor/dev-host.js');
const host = await createDevHost({ source: { module: process.env.APP_SOURCE } });
const page = await host.handle(new Request('http://127.0.0.1:4390/'));
const op = await host.handle(
  new Request('http://127.0.0.1:4390/app/' + DEV_APP_ID + '/api/count', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  }),
);
console.log(JSON.stringify({ page: page.status, op: await op.json() }));
host.close();
`;

// Runs only in the monorepo, where the global setup has just built the bundle
// this tarball must carry. Installing the tarball would need the npm registry,
// so the probe loads the packed files directly with no node_modules around.
// Packing and probing take about 6.5s on CI and 22s when the server suite
// shares the runner, so this test gets 60s instead of the package's 20s.
test.skipIf(!insideMonorepo)(
  'the packed CLI carries a dev host that runs with no monorepo packages around it',
  { timeout: 60_000 },
  () => {
    const destination = mkdtempSync(join(tmpdir(), 'charming-cli-pack-'));
    const [packed] = JSON.parse(
      execFileSync(
        'npm',
        ['pack', '--ignore-scripts', '--json', '--pack-destination', destination],
        {
          cwd: packageRoot,
          encoding: 'utf8',
        },
      ),
    ) as Array<{ filename: string; files: Array<{ path: string }> }>;
    const files = packed.files.map((file) => file.path);
    execFileSync('tar', ['-xzf', join(destination, packed.filename), '-C', destination]);
    const unpacked = join(destination, 'package');
    writeFileSync(join(unpacked, 'probe.mjs'), PROBE);

    const output = execFileSync(process.execPath, ['probe.mjs'], {
      cwd: unpacked,
      encoding: 'utf8',
      env: { PATH: process.env.PATH ?? '', APP_SOURCE: APP },
    });

    expect(files).toEqual(
      expect.arrayContaining(['vendor/dev-host.js', 'dist/cli.js', 'bin/run.js']),
    );
    expect(existsSync(join(unpacked, 'node_modules'))).toBe(false);
    expect(JSON.parse(output)).toEqual({ page: 200, op: { ok: true, value: { count: 1 } } });
  },
);
