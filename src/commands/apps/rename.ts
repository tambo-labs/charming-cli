import { Args, Flags } from '@oclif/core';

import { CharmingCommand } from '../../base-command.js';
import { runApps } from '../../commands.js';

export default class AppsRename extends CharmingCommand {
  static override args = {
    appId: Args.string({ required: true }),
    name: Args.string({ required: true }),
  };

  static override description = "Rename an app's URL slug.";

  static override flags = {
    'dry-run': Flags.boolean({ description: 'Print the request without sending it.' }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(AppsRename);
    this.output(await runApps('rename', [args.appId, args.name], this.context(flags)));
  }
}
