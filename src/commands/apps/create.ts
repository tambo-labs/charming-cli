import { Args, Flags } from '@oclif/core';

import { CharmingCommand } from '../../base-command.js';
import { followSavedBuild, requireFilesForWait, waitFlag } from '../../builds.js';
import { runApps } from '../../commands.js';

export default class AppsCreate extends CharmingCommand {
  static override args = { directory: Args.string({ required: false }) };

  static override description = 'Create an app from local source files.';

  static override flags = {
    description: Flags.string({ description: 'App description.' }),
    'dry-run': Flags.boolean({ description: 'Print the request without sending it.' }),
    files: Flags.string({
      description:
        'Directory holding the App as a package: package.json, server.js, and the files they import. Sends the whole tree and accepts a background build.',
    }),
    module: Flags.string({ description: 'Module source file.' }),
    styles: Flags.string({ description: 'Stylesheet file.' }),
    ui: Flags.string({ description: 'UI source file.' }),
    wait: waitFlag,
    yes: Flags.boolean({ description: 'Confirm an authenticated create.' }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(AppsCreate);
    requireFilesForWait(flags);
    const context = await this.context(flags);
    const saved = await runApps('create', args.directory ? [args.directory] : [], context);
    this.output(flags.wait ? await followSavedBuild(context, saved) : saved);
  }
}
