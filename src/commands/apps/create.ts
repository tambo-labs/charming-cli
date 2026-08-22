import { Args, Flags } from '@oclif/core';

import { CharmingCommand } from '../../base-command.js';
import { runApps } from '../../commands.js';

export default class AppsCreate extends CharmingCommand {
  static override args = { directory: Args.string({ required: false }) };

  static override description = 'Create an app from local source files.';

  static override flags = {
    description: Flags.string({ description: 'App description.' }),
    'dry-run': Flags.boolean({ description: 'Print the request without sending it.' }),
    module: Flags.string({ description: 'Module source file.' }),
    styles: Flags.string({ description: 'Stylesheet file.' }),
    ui: Flags.string({ description: 'UI source file.' }),
    yes: Flags.boolean({ description: 'Confirm an authenticated create.' }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(AppsCreate);
    this.output(
      await runApps('create', args.directory ? [args.directory] : [], this.context(flags)),
    );
  }
}
