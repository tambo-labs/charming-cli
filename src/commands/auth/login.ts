import { Flags } from '@oclif/core';

import { CharmingCommand } from '../../base-command.js';
import { runAuth } from '../../commands.js';

export default class AuthLogin extends CharmingCommand {
  static override description = 'Sign in with a device-pairing flow.';

  static override flags = {
    'no-open': Flags.boolean({ description: 'Do not open the verification URL.' }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(AuthLogin);
    this.output(await runAuth('login', this.context(flags)));
  }
}
