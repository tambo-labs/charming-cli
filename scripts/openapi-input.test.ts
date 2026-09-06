import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { syncOpenApiInput } from './openapi-input.js';

describe('syncOpenApiInput', () => {
  it('writes and checks the standalone CLI snapshot from the monorepo contract', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'charming-cli-openapi-'));
    const inputPath = join(directory, 'input.json');
    const snapshotPath = join(directory, 'openapi.json');
    const upstreamPath = join(directory, 'UPSTREAM.json');
    const contract = '{"openapi":"3.1.0","paths":{}}\n';
    await writeFile(inputPath, contract);
    await writeFile(snapshotPath, '{}\n');
    await writeFile(upstreamPath, '{}\n');

    try {
      await expect(
        syncOpenApiInput({ inputPath, snapshotPath, upstreamPath, check: true }),
      ).rejects.toThrow('CLI OpenAPI snapshot is stale');

      await syncOpenApiInput({ inputPath, snapshotPath, upstreamPath, check: false });

      expect(await readFile(snapshotPath, 'utf8')).toBe(contract);
      expect(JSON.parse(await readFile(upstreamPath, 'utf8'))).toEqual({
        source: 'https://github.com/tambo-ai/charming/blob/main/apps/docs/openapi.fallback.json',
        sha256: 'c8940625eaf4c8c78ca8dc9b10bd3037f641b734010026be2e1fa6bcaee1b2af',
      });
      await expect(
        syncOpenApiInput({ inputPath, snapshotPath, upstreamPath, check: true }),
      ).resolves.toBeUndefined();
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
