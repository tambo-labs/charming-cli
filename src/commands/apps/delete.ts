import { Args, Flags } from '@oclif/core';

import { CharmingCommand } from '../../base-command.js';
import { runAppsEffect } from '../../commands.js';

export default class AppsDelete extends CharmingCommand {
  static override args = { appId: Args.string({ required: true }) };

  static override description = 'Delete an app with explicit consent.';

  static override flags = {
    'dry-run': Flags.boolean({ description: 'Print the request without sending it.' }),
    yes: Flags.boolean({ description: 'Confirm deletion.' }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(AppsDelete);
    this.output(
      await this.withContext(flags, (context) => runAppsEffect('delete', [args.appId], context)),
    );
  }
}
