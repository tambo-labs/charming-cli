import { Flags } from '@oclif/core';

import { CharmingCommand } from '../../base-command.js';
import { runApps } from '../../commands.js';

export default class AppsList extends CharmingCommand {
  static override description = 'List apps visible to the active user.';

  static override flags = {
    cursor: Flags.string({ description: 'Pagination cursor.' }),
    limit: Flags.string({ description: 'Maximum number of apps.' }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(AppsList);
    this.output(await runApps('list', [], this.context(flags)));
  }
}
