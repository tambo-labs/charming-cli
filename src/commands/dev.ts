import { Args, Flags } from '@oclif/core';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';

import { CharmingCommand, writeErrorOutput } from '../base-command.js';
import { makeTypesRefresher } from '../connector-types.js';
import { checkAppEffect, recordProcessFailures } from '../dev-check.js';
import { devTarget, pullLiveAppEffect } from '../dev-pull.js';
import { DEV_ROLES, isPackageSource, startDevServerEffect } from '../dev.js';
import { ApiError, TimeoutError } from '../http.js';
import { fromPromise } from '../io.js';
import { currentExitCode, setExitCode } from '../runtime.js';

export default class Dev extends CharmingCommand {
  static override args = {
    directory: Args.string({
      description:
        'App directory: a package with package.json and server.js, or module.js, ui.js, and styles.css. Or the ID of a live app, whose source is written to --out and run from there.',
      required: false,
    }),
  };

  static override description =
    'Serve an app locally: a package app is built with npm and esbuild as a save builds it, its server code runs against in-memory storage, and its ui renders in the production app shell. The server code runs in this process, not a sandbox; only preview code you trust.';

  static override flags = {
    check: Flags.boolean({
      description:
        'Render the app once without a browser, run each --click, print a JSON report of thrown errors, an empty render, and embed-breakers, and exit; 9 when the page threw, rendered nothing, or a click failed. The ui runs unsandboxed in this process, on a free loopback port whatever --host and --port say.',
    }),
    click: Flags.string({
      dependsOn: ['check'],
      description:
        'With --check, a CSS selector to click after the page renders. Repeatable, in order.',
      multiple: true,
    }),
    as: Flags.option({
      default: 'owner',
      description:
        'Your role on the app: owner, builder, editor, or viewer. Operations are gated as on Charming; without --user you are signed out.',
      options: DEV_ROLES,
    })(),
    fetch: Flags.string({
      description:
        'JSON file of canned responses for outbound requests the app may make, keyed by "[METHOD ]<origin><path>".',
    }),
    'fetch-allow': Flags.string({
      description:
        'HTTPS origin the app may fetch beyond those it declares. Repeatable. Charming refuses it until the app declares it.',
      multiple: true,
    }),
    host: Flags.string({ default: '127.0.0.1', description: 'Interface to listen on.' }),
    module: Flags.string({ description: 'Module source file.' }),
    port: Flags.integer({
      default: 4390,
      description: 'Port to listen on; 0 picks a free port.',
      max: 65535,
      min: 0,
    }),
    'save-state': Flags.string({
      description: 'JSON file the app storage is written to after each change and on exit.',
    }),
    state: Flags.string({ description: 'JSON file of storage keys and values to start with.' }),
    out: Flags.string({
      description: 'With an app ID, the directory to write its source to. Defaults to ./<app-id>.',
    }),
    'pull-data': Flags.string({
      description:
        'With an app ID, a read-only operation whose result (an object of storage keys to values) seeds storage. It may hold real user data; it is written under .charming-dev/ in the source directory.',
    }),
    'run-op': Flags.string({
      description:
        'Operation to run once at startup, as a Routine runs it: empty input, owner authority, no signed-in user. Repeatable.',
      multiple: true,
    }),
    secret: Flags.string({
      description:
        'Value for {{secret:NAME}} in a sealed fetch: NAME=value, or NAME to read it from the environment. Repeatable.',
      multiple: true,
    }),
    styles: Flags.string({ description: 'Stylesheet file.' }),
    types: Flags.boolean({
      default: true,
      allowNo: true,
      description:
        'Keep charming-env.d.ts current for a package App with TypeScript or connector imports. Needs a signed-in profile for connector types; --no-types turns it off.',
    }),
    ui: Flags.string({ description: 'UI source file.' }),
    user: Flags.string({
      description:
        'JSON file with the signed-in user: id, and optional handle, name, image, email, emailVerified.',
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Dev);
    const logLines: string[] = [];
    const log = (line: string) => {
      if (flags.check) logLines.push(line);
      process.stderr.write(`${line}\n`);
    };
    // The App's server code runs in this process from startup, so a check
    // records what it throws from before the dev server starts.
    const failures = flags.check ? recordProcessFailures() : undefined;
    // The dev host applies the App's outbound policy to the global fetch, so
    // the CLI's own calls to Charming keep the fetch from before it starts.
    const charmingFetch = globalThis.fetch.bind(globalThis);
    const start = Effect.gen({ self: this }, function* () {
      const target = devTarget(args.directory, {
        out: flags.out,
        pullData: flags['pull-data'],
        state: flags.state,
        saveState: flags['save-state'],
        host: flags.host,
        check: flags.check,
      });
      let state = flags.state;
      if (target.kind === 'live') {
        const context = yield* this.contextEffect(flags);
        const pulled = yield* pullLiveAppEffect(context, target, {
          dataOperation: flags['pull-data'],
          log,
        });
        state ??= pulled.statePath;
      }
      const refreshTypes =
        flags.types &&
        !flags.check &&
        isPackageSource({
          directory: target.directory,
          module: flags.module,
          ui: flags.ui,
          styles: flags.styles,
        })
          ? makeTypesRefresher(
              this.contextEffect(flags).pipe(
                Effect.map((context) => ({
                  ...context,
                  fetchImpl: context.fetchImpl ?? charmingFetch,
                })),
              ),
              target.directory ?? '.',
              log,
            )
          : undefined;
      return yield* startDevServerEffect({
        refreshTypes,
        directory: target.directory,
        host: flags.check ? '127.0.0.1' : flags.host,
        log,
        module: flags.module,
        port: flags.check ? 0 : flags.port,
        fetch: flags.fetch,
        fetchAllow: flags['fetch-allow'],
        secret: flags.secret,
        runOp: flags['run-op'],
        role: flags.as,
        saveState: flags['save-state'],
        state,
        styles: flags.styles,
        ui: flags.ui,
        user: flags.user,
      });
    });
    await Effect.runPromise(
      Effect.gen({ self: this }, function* () {
        const opened = yield* Effect.exit(start);
        if (Exit.isFailure(opened)) {
          failures?.stop();
          const error = Cause.squash(opened.cause);
          if (error instanceof ApiError || error instanceof TimeoutError)
            return yield* Effect.fail(error);
          fail(error);
          if (flags.check) ignoreLateFailures();
          return;
        }

        const server = opened.value;
        const serve = Effect.gen({ self: this }, function* () {
          if (failures) {
            const outcome = yield* Effect.exit(
              checkAppEffect(server, { clicks: flags.click ?? [], logLines, failures }),
            );
            ignoreLateFailures();
            failures.stop();
            if (Exit.isFailure(outcome)) {
              fail(Cause.squash(outcome.cause));
            } else {
              this.log(JSON.stringify(outcome.value, null, 2));
              if (!outcome.value.ok) setExitCode(CHECK_FAILED_EXIT_CODE);
            }
            return;
          }
          this.log(
            JSON.stringify(
              { ok: true, url: server.url, appId: server.appId, panelUrl: server.panelUrl },
              null,
              2,
            ),
          );
          process.stderr.write(
            `Serving the app at ${server.url}, with its operations and call log at ${server.panelUrl}. Press Ctrl+C to stop.\n`,
          );
          yield* waitForStop;
        });
        yield* serve.pipe(
          Effect.ensuring(
            fromPromise(() => server.close()).pipe(
              Effect.catch((error) => Effect.sync(() => fail(error))),
            ),
          ),
        );
      }),
    );
    if (flags.check) await exitCheck();
  }
}

const waitForStop = Effect.callback<void>((resume) => {
  const remove = () => {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
  };
  const stop = () => {
    remove();
    resume(Effect.void);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  return Effect.sync(remove);
});

/** Once the report is decided, a late throw from the App's server code must not change the exit code. */
function ignoreLateFailures(): void {
  process.on('uncaughtException', () => undefined);
  process.on('unhandledRejection', () => undefined);
}

/**
 * End a `--check` once its output is written. The App's server code runs in
 * this process, so a timer it left running would keep the CLI alive.
 */
async function exitCheck(): Promise<never> {
  await Promise.all(
    [process.stdout, process.stderr].map(
      (stream) => new Promise<void>((resolve) => stream.write('', () => resolve())),
    ),
  );
  process.exit(currentExitCode() ?? 0);
}

/** The exit code of a `--check` that found the page threw, rendered nothing, or a click failed. */
const CHECK_FAILED_EXIT_CODE = 9;

function fail(error: unknown): void {
  const kind =
    error instanceof Error && 'kind' in error && typeof error.kind === 'string'
      ? error.kind
      : 'cli_error';
  const message = error instanceof Error ? error.message : String(error);
  writeErrorOutput({ ok: false, error: { kind, message } });
  setExitCode(2);
}
