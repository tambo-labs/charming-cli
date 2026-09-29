import { CharmingCommand } from '../../base-command.js';
import { currentProfile } from '../../config.js';

export default class ProfileCurrent extends CharmingCommand {
  static override description =
    'Show the profile this directory resolves to and where it came from.';

  async run(): Promise<void> {
    const { flags } = await this.parse(ProfileCurrent);
    this.output(await currentProfile(this.sessionRequest(flags).request));
  }
}
