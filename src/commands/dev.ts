import { Args, Flags } from '@oclif/core';

import { CharmingCommand, writeErrorOutput } from '../base-command.js';
import { checkApp, recordProcessFailures } from '../dev-check.js';
import { devTarget, pullLiveApp } from '../dev-pull.js';
import { DEV_ROLES, startDevServer } from '../dev.js';
import { ApiError, TimeoutError } from '../http.js';
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
    ui: Flags.string({ description: 'UI source file.' }),
    user: Flags.string({
      description: 'JSON file with the signed-in user: id, and optional handle, name, image.',
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
    let server;
    try {
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
        const pulled = await pullLiveApp(await this.context(flags), target, {
          dataOperation: flags['pull-data'],
          log,
        });
        state ??= pulled.statePath;
      }
      server = await startDevServer({
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
    } catch (error) {
      failures?.stop();
      // A failed call to Charming keeps the CLI's usual error output and exit code.
      if (error instanceof ApiError || error instanceof TimeoutError) throw error;
      fail(error);
      if (flags.check) {
        ignoreLateFailures();
        await exitCheck();
      }
      return;
    }

    if (failures) {
      try {
        const report = await checkApp(server, { clicks: flags.click ?? [], logLines, failures });
        ignoreLateFailures();
        this.log(JSON.stringify(report, null, 2));
        if (!report.ok) setExitCode(CHECK_FAILED_EXIT_CODE);
      } catch (error) {
        ignoreLateFailures();
        fail(error);
      }
      failures.stop();
      // A failed --save-state write on close replaces the check's exit code.
      try {
        await server.close();
      } catch (error) {
        fail(error);
      }
      await exitCheck();
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
    await new Promise<void>((resolveStop) => {
      const stop = () => {
        process.off('SIGINT', stop);
        process.off('SIGTERM', stop);
        resolveStop();
      };
      process.on('SIGINT', stop);
      process.on('SIGTERM', stop);
    });
    try {
      await server.close();
    } catch (error) {
      fail(error);
    }
  }
}

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
