import { Args, Flags } from '@oclif/core';
import * as Effect from 'effect/Effect';

import { CharmingCommand } from '../../base-command.js';
import { selectedProfile, useProfileEffect } from '../../config.js';

export default class ProfileUse extends CharmingCommand {
  static override args = { name: Args.string({ required: true }) };

  static override description =
    'Select a saved profile in your user config, or in the project config with --project.';

  static override flags = {
    project: Flags.boolean({
      description: 'Write the selection to .config/charming.json in the nearest project.',
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ProfileUse);
    const { request } = this.sessionRequest(flags);
    this.output(
      await Effect.runPromise(
        Effect.gen(function* () {
          const selected = yield* useProfileEffect(args.name, {
            cwd: request.cwd,
            project: flags.project,
          });
          return { ...selected, current: yield* selectedProfile(request) };
        }),
      ),
    );
  }
}
