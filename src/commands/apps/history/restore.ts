import { Args, Flags } from '@oclif/core';

import { CharmingCommand } from '../../../base-command.js';
import { runHistory } from '../../../history.js';

export default class AppsHistoryRestore extends CharmingCommand {
  static override args = {
    appId: Args.string({ required: true }),
    revision: Args.string({ required: true }),
  };

  static override description =
    'Save an earlier revision as the newest one. The revision it replaces stays in History.';

  static override flags = {
    'dry-run': Flags.boolean({ description: 'Print the request without sending it.' }),
    wait: Flags.boolean({
      description: 'Wait for the build a package revision starts and print it.',
    }),
    yes: Flags.boolean({ description: 'Confirm the restore.' }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(AppsHistoryRestore);
    this.output(
      await runHistory('restore', [args.appId, args.revision], await this.context(flags)),
    );
  }
}
