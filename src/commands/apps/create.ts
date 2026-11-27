import { Args, Flags } from '@oclif/core';
import * as Effect from 'effect/Effect';

import { CharmingCommand } from '../../base-command.js';
import { followSavedBuildEffect, requireFilesForWait, waitFlag } from '../../builds.js';
import { runAppsEffect } from '../../commands.js';

export default class AppsCreate extends CharmingCommand {
  static override args = { directory: Args.string({ required: false }) };

  static override description = 'Create an app from local source files.';

  static override flags = {
    description: Flags.string({ description: 'App description.' }),
    'dry-run': Flags.boolean({ description: 'Print the request without sending it.' }),
    files: Flags.string({
      description:
        'Directory holding the App as a package: package.json, server.js, and the files they import. Sends the whole tree and accepts a background build.',
    }),
    module: Flags.string({ description: 'Module source file.' }),
    styles: Flags.string({ description: 'Stylesheet file.' }),
    ui: Flags.string({ description: 'UI source file.' }),
    wait: waitFlag,
    yes: Flags.boolean({ description: 'Confirm an authenticated create.' }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(AppsCreate);
    requireFilesForWait(flags);
    this.output(
      await this.withContext(flags, (context) =>
        Effect.gen(function* () {
          const saved = yield* runAppsEffect(
            'create',
            args.directory ? [args.directory] : [],
            context,
          );
          return flags.wait ? yield* followSavedBuildEffect(context, saved) : saved;
        }),
      ),
    );
  }
}
