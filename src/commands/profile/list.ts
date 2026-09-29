import { CharmingCommand } from '../../base-command.js';
import { listProfiles } from '../../config.js';

export default class ProfileList extends CharmingCommand {
  static override description =
    'List saved profiles with their origins and show which one is selected and why.';

  async run(): Promise<void> {
    const { flags } = await this.parse(ProfileList);
    this.output(await listProfiles(this.sessionRequest(flags).request));
  }
}
