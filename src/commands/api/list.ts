import { CharmingCommand } from '../../base-command.js';
import { runApi } from '../../commands.js';

export default class ApiList extends CharmingCommand {
  static override description = 'List generated OpenAPI operations.';

  async run(): Promise<void> {
    const { flags } = await this.parse(ApiList);
    this.output(await runApi('list', [], this.context(flags)));
  }
}
