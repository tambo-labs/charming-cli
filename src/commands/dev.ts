import { Args, Command, Flags } from '@oclif/core';

import { writeErrorOutput } from '../base-command.js';
import { setExitCode } from '../runtime.js';

export default class Dev extends Command {
  static override args = {
    directory: Args.string({
      description: 'App directory with module.js, ui.js, and styles.css.',
      required: false,
    }),
  };

  static override description =
    'Serve an app locally: its module runs against in-memory storage, and its ui renders in the production app shell. The module runs in this process, not a sandbox; only preview code you trust.';

  static override flags = {
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
    styles: Flags.string({ description: 'Stylesheet file.' }),
    ui: Flags.string({ description: 'UI source file.' }),
    user: Flags.string({
      description: 'JSON file with the signed-in user: id, and optional handle, name, image.',
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Dev);
    const { startDevServer } = await import('../dev.js');
    let server;
    try {
      server = await startDevServer({
        directory: args.directory,
        host: flags.host,
        log: (line) => process.stderr.write(`${line}\n`),
        module: flags.module,
        port: flags.port,
        saveState: flags['save-state'],
        state: flags.state,
        styles: flags.styles,
        ui: flags.ui,
        user: flags.user,
      });
    } catch (error) {
      fail(error);
      return;
    }

    this.log(JSON.stringify({ ok: true, url: server.url, appId: server.appId }, null, 2));
    process.stderr.write(`Serving the app at ${server.url}. Press Ctrl+C to stop.\n`);
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

function fail(error: unknown): void {
  const kind =
    error instanceof Error && 'kind' in error && typeof error.kind === 'string'
      ? error.kind
      : 'cli_error';
  const message = error instanceof Error ? error.message : String(error);
  writeErrorOutput({ ok: false, error: { kind, message } });
  setExitCode(2);
}
