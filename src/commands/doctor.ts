import { CharmingCommand } from '../base-command.js';
import { runDoctorEffect } from '../commands.js';

export default class Doctor extends CharmingCommand {
  static override description = 'Check API reachability and authentication.';

  async run(): Promise<void> {
    const { flags } = await this.parse(Doctor);
    this.output(await this.withContext(flags, runDoctorEffect));
  }
}
