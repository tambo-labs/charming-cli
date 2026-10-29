import { Args, Flags } from '@oclif/core';

import { CharmingCommand } from '../../../base-command.js';
import { runHistory } from '../../../history.js';

export default class AppsHistoryList extends CharmingCommand {
  static override args = { appId: Args.string({ required: true }) };

  static override description =
    'List the revisions of an App, newest first, with which are live and restorable.';

  static override flags = {
    before: Flags.string({
      description: 'Page back from this revision; use nextBefore from the previous page.',
    }),
    limit: Flags.string({ description: 'Revisions per page.' }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(AppsHistoryList);
    this.output(await runHistory('list', [args.appId], await this.context(flags)));
  }
}
