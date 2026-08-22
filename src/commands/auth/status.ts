import { CharmingCommand } from '../../base-command.js';
import { runAuth } from '../../commands.js';

export default class AuthStatus extends CharmingCommand {
  static override description = 'Check whether the selected origin accepts the active credential.';

  async run(): Promise<void> {
    const { flags } = await this.parse(AuthStatus);
    this.output(await runAuth('status', this.context(flags)));
  }
}
