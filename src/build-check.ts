import { existsSync, readdirSync, statSync, type Dirent } from 'node:fs';
import { join } from 'node:path';

/**
 * `oclif.commands` in `package.json` points at `./dist/commands`, so the
 * compiled output must exist and be current before `Config.load` can find
 * any command — including when the CLI is invoked straight from
 * `src/cli.ts` (the root `charming` script, and every local `bun run
 * charming -- <cmd>` invocation). This module decides whether that build is
 * missing or stale and runs it, so running from source never requires a
 * manual `bun run build` first.
 */

export type BuildRunner = () => void | Promise<void>;

/** True only for the TypeScript entry point (`src/cli.ts`) run directly by bun; the packaged `dist/cli.js` entry always ships an already-built `dist/commands`. */
export function isSourceEntry(moduleUrl: string): boolean {
  return moduleUrl.endsWith('.ts');
}

/** `dist/commands` is stale when it is missing, empty, or older than the newest file under `src`. */
export function commandsNeedBuild(root: string): boolean {
  const commandsDir = join(root, 'dist', 'commands');
  if (!existsSync(commandsDir)) return true;
  const newestCommand = newestMtimeMs(commandsDir);
  if (newestCommand === undefined) return true;
  const newestSource = newestMtimeMs(join(root, 'src'));
  return newestSource !== undefined && newestSource > newestCommand;
}

export async function ensureCommandsBuilt(options: {
  build: BuildRunner;
  moduleUrl: string;
  root: string;
}): Promise<void> {
  if (!isSourceEntry(options.moduleUrl)) return;
  if (!commandsNeedBuild(options.root)) return;
  try {
    await options.build();
  } catch (error) {
    throw new Error(
      'Charming CLI commands are missing or stale and the automatic build failed. Run `bun run --cwd packages/cli build` and try again.',
      { cause: error },
    );
  }
  if (commandsNeedBuild(options.root)) {
    throw new Error(
      'Charming CLI commands are still missing after building. Run `bun run --cwd packages/cli build` and try again.',
    );
  }
}

function newestMtimeMs(directory: string): number | undefined {
  let newest: number | undefined;
  const stack = [directory];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) break;
    let entries: Dirent[];
    try {
      entries = readdirSync(current, { withFileTypes: true, encoding: 'utf8' });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const entryPath = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
        continue;
      }
      if (!entry.isFile()) continue;
      const mtime = statSync(entryPath).mtimeMs;
      if (newest === undefined || mtime > newest) newest = mtime;
    }
  }
  return newest;
}
