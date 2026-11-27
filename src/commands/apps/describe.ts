import { Args } from '@oclif/core';

import { CharmingCommand } from '../../base-command.js';
import { runAppsEffect } from '../../commands.js';

export default class AppsDescribe extends CharmingCommand {
  static override args = { appId: Args.string({ required: true }) };

  static override description = 'Describe an app and its operations.';

  async run(): Promise<void> {
    const { args, flags } = await this.parse(AppsDescribe);
    this.output(
      await this.withContext(flags, (context) => runAppsEffect('describe', [args.appId], context)),
    );
  }
}
