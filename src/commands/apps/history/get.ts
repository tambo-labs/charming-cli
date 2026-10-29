import { Args, Flags } from '@oclif/core';

import { CharmingCommand } from '../../../base-command.js';
import { runHistory } from '../../../history.js';

export default class AppsHistoryGet extends CharmingCommand {
  static override args = {
    appId: Args.string({ required: true }),
    revision: Args.string({ required: true }),
  };

  static override description =
    'Read one revision with its source, or write the source to a directory.';

  static override flags = {
    out: Flags.string({ description: 'Directory for the revision source.' }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(AppsHistoryGet);
    this.output(await runHistory('get', [args.appId, args.revision], await this.context(flags)));
  }
}
