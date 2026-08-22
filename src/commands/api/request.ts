import { Args, Flags } from '@oclif/core';

import { CharmingCommand } from '../../base-command.js';
import { runApi } from '../../commands.js';

export default class ApiRequest extends CharmingCommand {
  static override args = { operationId: Args.string({ required: true }) };

  static override description = 'Call a generated OpenAPI operation.';

  static override flags = {
    body: Flags.string({ description: 'JSON body or @file.' }),
    'dry-run': Flags.boolean({ description: 'Print the request without sending it.' }),
    file: Flags.string({ description: 'File for multipart requests.' }),
    header: Flags.string({ description: 'Header as NAME=VALUE.', multiple: true }),
    param: Flags.string({ description: 'Parameter as NAME=VALUE.', multiple: true }),
    yes: Flags.boolean({ description: 'Confirm a destructive request.' }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ApiRequest);
    this.output(await runApi('request', [args.operationId], this.context(flags)));
  }
}
