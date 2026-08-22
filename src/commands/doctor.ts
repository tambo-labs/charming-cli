import { CharmingCommand } from '../base-command.js';
import { runDoctor } from '../commands.js';

export default class Doctor extends CharmingCommand {
  static override description = 'Check API reachability and authentication.';

  async run(): Promise<void> {
    const { flags } = await this.parse(Doctor);
    this.output(await runDoctor(this.context(flags)));
  }
}
