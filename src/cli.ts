import { pathToFileURL } from 'node:url';

import { parseArgs, stringOption } from './args.js';
import { CLI_VERSION, redactSecrets, runCommand } from './commands.js';
import { HELP } from './help.js';
import { ApiError } from './http.js';

export async function main(
  argv = process.argv.slice(2),
  dependencies: { fetchImpl?: typeof fetch } = {},
): Promise<number> {
  try {
    const parsed = parseArgs(argv);
    if (parsed.options.version === true) {
      process.stdout.write(`${CLI_VERSION}\n`);
      return 0;
    }
    if (parsed.options.help === true || parsed.command.length === 0) {
      process.stdout.write(HELP);
      return 0;
    }

    const baseUrl =
      stringOption(parsed.options, 'base-url') ??
      process.env.CHARMING_BASE_URL ??
      'https://charm.ing';
    const result = await runCommand({
      baseUrl,
      command: parsed.command,
      fetchImpl: dependencies.fetchImpl,
      options: parsed.options,
      token: stringOption(parsed.options, 'token'),
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  } catch (error) {
    if (error instanceof ApiError) {
      const envelope = redactSecrets({
        ok: false,
        error: {
          kind: error.kind,
          message: error.message,
          recovery: error.recovery,
          status: error.status,
        },
      });
      process.stderr.write(`${JSON.stringify(envelope, null, 2)}\n`);
      if (error.status === 401 || error.status === 403) return 4;
      if (error.status === 404) return 3;
      if (error.status === 429) return 7;
      return 5;
    }
    const envelope = redactSecrets({
      ok: false,
      error: {
        kind: 'cli_error',
        message: error instanceof Error ? error.message : String(error),
      },
    });
    process.stderr.write(`${JSON.stringify(envelope, null, 2)}\n`);
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
