import { Flags } from '@oclif/core';

import { CharmingCommand } from '../../base-command.js';
import { runAuthEffect } from '../../commands.js';

export default class AuthStatus extends CharmingCommand {
  static override description = 'Check whether the selected origin accepts the active credential.';

  static override flags = {
    json: Flags.boolean({ description: 'Accepted for scripts; the output is always JSON.' }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(AuthStatus);
    this.output(await this.withContext(flags, (context) => runAuthEffect('status', context)));
  }
}
