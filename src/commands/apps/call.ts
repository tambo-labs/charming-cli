import { Args, Flags } from '@oclif/core';

import { CharmingCommand } from '../../base-command.js';
import { runApps } from '../../commands.js';

export default class AppsCall extends CharmingCommand {
  static override args = {
    appId: Args.string({ required: true }),
    operation: Args.string({ required: true }),
  };

  static override description = 'Call an app operation.';

  static override flags = {
    'dry-run': Flags.boolean({ description: 'Print the request without sending it.' }),
    input: Flags.string({ description: 'JSON input or @file.' }),
    output: Flags.string({
      description: 'Output format. compact skips pretty-printing for large responses.',
      options: ['json', 'compact'],
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(AppsCall);
    const result = await runApps('call', [args.appId, args.operation], this.context(flags));
    this.output(result, { format: flags.output === 'compact' ? 'compact' : 'json' });
  }
}
