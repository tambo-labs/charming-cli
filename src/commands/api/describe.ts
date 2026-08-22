import { Args } from '@oclif/core';

import { CharmingCommand } from '../../base-command.js';
import { runApi } from '../../commands.js';

export default class ApiDescribe extends CharmingCommand {
  static override args = { operationId: Args.string({ required: true }) };

  static override description = 'Describe a generated OpenAPI operation.';

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ApiDescribe);
    this.output(await runApi('describe', [args.operationId], this.context(flags)));
  }
}
