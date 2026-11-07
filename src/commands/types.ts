import { Args } from '@oclif/core';

import { CharmingCommand } from '../base-command.js';
import { runTypes } from '../connector-types.js';

export default class Types extends CharmingCommand {
  static override args = {
    directory: Args.string({
      default: '.',
      description: 'The App directory, holding package.json.',
    }),
  };

  static override description =
    "Write charming-env.d.ts in an App directory: the Route type, and a typed function for every connector tool the App's code imports, at the version each import names.";

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Types);
    this.output(await runTypes(await this.context(flags), args.directory));
  }
}
