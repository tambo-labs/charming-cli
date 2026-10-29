import { Args } from '@oclif/core';

import { CharmingCommand } from '../../base-command.js';
import { waitForBuild } from '../../builds.js';

export default class BuildsWait extends CharmingCommand {
  static override args = { buildId: Args.string({ required: true }) };

  static override description =
    'Wait for a package build to finish. Prints the build when it publishes; any other final state is an error with exit code 6.';

  async run(): Promise<void> {
    const { args, flags } = await this.parse(BuildsWait);
    this.output(await waitForBuild(await this.context(flags), args.buildId));
  }
}
