import { Command, Flags, type Interfaces } from '@oclif/core';

import { type CommandContext, redactSecrets } from './commands.js';
import { ApiError, TimeoutError } from './http.js';
import { currentDependencies, setExitCode } from './runtime.js';

// The CLI's JSON-per-line stdout contract stays useful even for pathological
// responses (e.g. a GeoJSON tool result): a single huge line risks overflowing
// callers that capture command output. Past this size the CLI ships a preview
// with a pointer at `apps call --output compact` and a narrower `--input`.
const MAX_OUTPUT_CHARS = 200_000;

export abstract class CharmingCommand extends Command {
  static override baseFlags = {
    'base-url': Flags.string({ description: 'API origin' }),
    timeout: Flags.string({ description: 'Request timeout in milliseconds.' }),
    token: Flags.string({ description: 'Override saved credentials' }),
  };

  protected context(flags: Record<string, unknown>): CommandContext {
    const { 'base-url': baseUrl, timeout, token, ...options } = flags;
    return {
      baseUrl:
        typeof baseUrl === 'string'
          ? baseUrl
          : (process.env.CHARMING_BASE_URL ?? 'https://charm.ing'),
      fetchImpl: currentDependencies().fetchImpl,
      options: options as CommandContext['options'],
      timeoutMs: parseTimeoutFlag(timeout),
      token: typeof token === 'string' ? token : undefined,
    };
  }

  protected output(result: unknown, options: { format?: 'compact' | 'json' } = {}): void {
    const redacted = redactSecrets(result);
    const compact = options.format === 'compact';
    const serialized = compact ? JSON.stringify(redacted) : JSON.stringify(redacted, null, 2);
    this.log(truncateForOutput(serialized, compact));
  }

  protected override async catch(error: Interfaces.CommandError): Promise<void> {
    this.parsed = true;
    if (error instanceof TimeoutError) {
      this.errorOutput({
        ok: false,
        error: { kind: error.kind, message: error.message, timeoutMs: error.timeoutMs },
      });
      setExitCode(8);
      return;
    }
    if (error instanceof ApiError) {
      this.errorOutput({
        ok: false,
        error: {
          kind: error.kind,
          message: error.message,
          recovery: error.recovery,
          status: error.status,
        },
      });
      setExitCode(apiExitCode(error.status));
      return;
    }

    this.errorOutput({
      ok: false,
      error: {
        kind: 'cli_error',
        message: error instanceof Error ? commandErrorMessage(error.message) : String(error),
      },
    });
    setExitCode(2);
  }

  private errorOutput(value: unknown): void {
    process.stderr.write(`${JSON.stringify(redactSecrets(value), null, 2)}\n`);
  }
}

function apiExitCode(status: number): number {
  if (status === 401 || status === 403) return 4;
  if (status === 404) return 3;
  if (status === 429) return 7;
  return 5;
}

function parseTimeoutFlag(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error('--timeout must be used once with a value');
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`--timeout must be a positive number of milliseconds, got ${value}`);
  }
  return parsed;
}

function truncateForOutput(serialized: string, compact: boolean): string {
  if (serialized.length <= MAX_OUTPUT_CHARS) return serialized;
  const wrapper = {
    truncated: true,
    originalLength: serialized.length,
    preview: serialized.slice(0, MAX_OUTPUT_CHARS),
    hint: 'Response exceeded the CLI output cap. Use `apps call --output compact` or a narrower --input to shrink it.',
  };
  return compact ? JSON.stringify(wrapper) : JSON.stringify(wrapper, null, 2);
}

function commandErrorMessage(message: string): string {
  const nonexistentFlag = message.match(/^Nonexistent flag: (--\S+)/);
  return nonexistentFlag ? `Unknown option ${nonexistentFlag[1]}` : message;
}
