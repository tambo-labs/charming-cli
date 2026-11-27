import { CharmingCommand } from '../../base-command.js';
import { runAuthEffect } from '../../commands.js';

export default class AuthLogout extends CharmingCommand {
  static override description = 'Remove credentials for the selected profile.';

  async run(): Promise<void> {
    const { flags } = await this.parse(AuthLogout);
    this.output(await this.withContext(flags, (context) => runAuthEffect('logout', context)));
  }
}
