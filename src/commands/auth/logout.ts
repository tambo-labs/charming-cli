import { CharmingCommand } from '../../base-command.js';
import { runAuth } from '../../commands.js';

export default class AuthLogout extends CharmingCommand {
  static override description = 'Remove saved credentials for the selected origin.';

  async run(): Promise<void> {
    const { flags } = await this.parse(AuthLogout);
    this.output(await runAuth('logout', this.context(flags)));
  }
}
