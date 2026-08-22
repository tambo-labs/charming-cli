import { Args, Flags } from '@oclif/core';

import { CharmingCommand } from '../../base-command.js';
import { runApps } from '../../commands.js';

export default class AppsSource extends CharmingCommand {
  static override args = { appId: Args.string({ required: true }) };

  static override description = 'Read app source or write it to a directory.';

  static override flags = { out: Flags.string({ description: 'Directory for exported source.' }) };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(AppsSource);
    this.output(await runApps('source', [args.appId], this.context(flags)));
  }
}
