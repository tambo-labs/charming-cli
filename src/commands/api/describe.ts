import { Args } from '@oclif/core';

import { CharmingCommand } from '../../base-command.js';
import { runApiEffect } from '../../commands.js';

export default class ApiDescribe extends CharmingCommand {
  static override args = { operationId: Args.string({ required: true }) };

  static override description = 'Describe a generated OpenAPI operation.';

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ApiDescribe);
    this.output(
      await this.withContext(
        flags,
        (context) => runApiEffect('describe', [args.operationId], context),
        'inspect',
      ),
    );
  }
}
