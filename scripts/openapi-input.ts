import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const monorepoContractUrl =
  'https://github.com/tambo-ai/charming/blob/main/apps/docs/openapi.fallback.json';

type SyncOpenApiInputOptions = {
  inputPath: string;
  snapshotPath: string;
  upstreamPath: string;
  check: boolean;
};

export async function syncOpenApiInput(options: SyncOpenApiInputOptions): Promise<void> {
  if (resolve(options.inputPath) === resolve(options.snapshotPath)) return;

  const contract = await readFile(options.inputPath, 'utf8');
  JSON.parse(contract);
  const sha256 = createHash('sha256').update(contract).digest('hex');
  const upstream = `${JSON.stringify({ source: monorepoContractUrl, sha256 }, null, 2)}\n`;

  if (options.check) {
    const [snapshot, currentUpstream] = await Promise.all([
      readFile(options.snapshotPath, 'utf8').catch(() => ''),
      readFile(options.upstreamPath, 'utf8').catch(() => ''),
    ]);
    if (snapshot !== contract || currentUpstream !== upstream) {
      throw new Error('CLI OpenAPI snapshot is stale. Run `bun run cli:gen`.');
    }
    return;
  }

  await Promise.all([
    writeFile(options.snapshotPath, contract),
    writeFile(options.upstreamPath, upstream),
  ]);
}
