import { CharmingCommand } from '../base-command.js';
import { agentContext } from '../commands.js';

export default class AgentContext extends CharmingCommand {
  static override description = 'Describe the CLI contract for coding agents.';

  async run(): Promise<void> {
    const { flags } = await this.parse(AgentContext);
    this.output(agentContext((await this.context(flags, 'inspect')).session));
  }
}
