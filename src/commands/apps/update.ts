import { Args, Flags } from '@oclif/core';

import { CharmingCommand } from '../../base-command.js';
import { runApps } from '../../commands.js';

export default class AppsUpdate extends CharmingCommand {
  static override args = {
    appId: Args.string({ required: true }),
    directory: Args.string({ required: false }),
  };

  static override description = 'Update an app with optimistic concurrency.';

  static override flags = {
    description: Flags.string({ description: 'App description.' }),
    'dry-run': Flags.boolean({ description: 'Print the request without sending it.' }),
    files: Flags.string({
      description:
        'Directory holding the App as a package: package.json, server.js, and the files they import. Sends the whole tree and accepts a background build.',
    }),
    'migrate-contract': Flags.boolean({
      description:
        'Confirm the contract migration Charming asks for. With --files, move the App onto the package contract; the App and its data stay available while the migration builds, and History can restore a retained validated revision. With a module, move an App on an older manifest onto the current one.',
    }),
    module: Flags.string({ description: 'Module source file.' }),
    styles: Flags.string({ description: 'Stylesheet file.' }),
    ui: Flags.string({ description: 'UI source file.' }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(AppsUpdate);
    this.output(
      await runApps(
        'update',
        [args.appId, ...(args.directory ? [args.directory] : [])],
        await this.context(flags),
      ),
    );
  }
}
