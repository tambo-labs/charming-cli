import { spawnSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { Config, Help } from '@oclif/core';

import { canonicalizeGlobalFlags } from './argv.js';
import { ensureCommandsBuilt } from './build-check.js';
import { redactSecrets } from './commands.js';
import { currentDependencies, currentExitCode, withRuntime } from './runtime.js';

export async function main(
  argv = process.argv.slice(2),
  dependencies: { buildImpl?: () => void | Promise<void>; fetchImpl?: typeof fetch } = {},
): Promise<number> {
  return withRuntime(dependencies, async () => {
    const root = packageRoot();
    await ensureCommandsBuilt({
      build: currentDependencies().buildImpl ?? (() => runBuild(root)),
      moduleUrl: import.meta.url,
      root,
    });
    const config = await Config.load(root);
    const canonical = canonicalizeGlobalFlags(argv);
    if (canonical.includes('--version')) {
      process.stdout.write(`${config.pjson.version}\n`);
      return 0;
    }
    if (canonical.length === 0 || canonical.includes('--help')) {
      await new Help(config).showHelp(canonical.filter((value) => value !== '--help'));
      return 0;
    }

    const resolved = resolveCommand(config, canonical);
    if (!resolved) {
      errorOutput(`Unknown command: ${canonical.join(' ') || '(none)'}`);
      return 2;
    }

    try {
      await config.runCommand(resolved.id, resolved.argv, resolved.command);
      return currentExitCode() ?? 0;
    } catch (error) {
      errorOutput(error instanceof Error ? error.message : String(error));
      return 2;
    }
  });
}

function packageRoot(): string {
  return dirname(dirname(fileURLToPath(import.meta.url)));
}

function runBuild(root: string): void {
  const result = spawnSync('bun', ['run', 'build'], {
    cwd: root,
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  if (result.status !== 0) {
    throw new Error(`\`bun run build\` exited with status ${result.status ?? 'unknown'}.`);
  }
}

function resolveCommand(config: Config, argv: string[]) {
  const firstFlag = argv.findIndex((value) => value.startsWith('--'));
  const maxWords = firstFlag === -1 ? argv.length : firstFlag;
  for (let words = maxWords; words > 0; words -= 1) {
    const id = argv.slice(0, words).join(':');
    const command = config.findCommand(id);
    if (command) return { argv: argv.slice(words), command, id };
  }
  return undefined;
}

function errorOutput(message: string): void {
  process.stderr.write(
    `${JSON.stringify(redactSecrets({ ok: false, error: { kind: 'cli_error', message } }), null, 2)}\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
