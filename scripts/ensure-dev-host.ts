import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const packageRoot = join(import.meta.dirname, '..');
const bundle = join(packageRoot, 'vendor', 'dev-host.js');
const monorepoRoot = join(packageRoot, '..', '..');
const monorepoBuilder = join(monorepoRoot, 'packages', 'repo__cli-dev-host', 'src', 'build.ts');

/**
 * Vitest global setup: `charming dev` tests load `vendor/dev-host.js`. Inside
 * the Charming monorepo the bundle is generated, so rebuild it through Turbo,
 * which replays it from cache when its sources are unchanged. The public
 * repository has no builder: its bundle, if any, comes from the latest server
 * release, and `src/dev.cli.test.ts` skips the end-to-end tests when it is
 * missing or from another dev host API version.
 */
export default function ensureDevHost(): void {
  if (!existsSync(monorepoBuilder)) return;
  const result = spawnSync('bun', ['run', 'cli:dev-host:gen'], {
    cwd: monorepoRoot,
    stdio: 'inherit',
  });
  if (result.status !== 0 || !existsSync(bundle)) {
    throw new Error(
      `Could not generate ${bundle}. Run \`bun run cli:dev-host:gen\` from the monorepo root.`,
    );
  }
}
