import { describe, expect, test, vi } from 'vitest';

const workflows = vi.hoisted(() => ({
  agentContext: vi.fn(),
  runApi: vi.fn(),
  runApps: vi.fn(),
  runAuth: vi.fn(),
  runDoctor: vi.fn(),
}));

vi.mock('./commands.js', () => ({
  ...workflows,
  redactSecrets: (value: unknown) => value,
}));

import AgentContext from './commands/agent-context.js';
import ApiDescribe from './commands/api/describe.js';
import ApiList from './commands/api/list.js';
import ApiRequest from './commands/api/request.js';
import AppsCall from './commands/apps/call.js';
import AppsCreate from './commands/apps/create.js';
import AppsDelete from './commands/apps/delete.js';
import AppsDescribe from './commands/apps/describe.js';
import AppsList from './commands/apps/list.js';
import AppsSource from './commands/apps/source.js';
import AppsUpdate from './commands/apps/update.js';
import AuthLogin from './commands/auth/login.js';
import AuthLogout from './commands/auth/logout.js';
import AuthStatus from './commands/auth/status.js';
import Doctor from './commands/doctor.js';

const context = {
  baseUrl: 'https://charm.ing',
  options: {},
};

type CommandClass = { prototype: { run(): Promise<void> } };

async function invoke(
  command: CommandClass,
  parsed: { args: Record<string, string | undefined>; flags: Record<string, unknown> },
) {
  const output = vi.fn();
  const commandContext = vi.fn().mockReturnValue(context);
  await Reflect.apply(
    Reflect.get(command.prototype, 'run'),
    {
      context: commandContext,
      output,
      parse: vi.fn().mockResolvedValue(parsed),
    },
    [],
  );
  return { commandContext, output };
}

describe('oclif command classes', () => {
  test('map parsed arguments and flags onto their shared workflows', async () => {
    workflows.agentContext.mockReturnValue({ agent: true });
    workflows.runApi.mockResolvedValue({ api: true });
    workflows.runApps.mockResolvedValue({ app: true });
    workflows.runAuth.mockResolvedValue({ auth: true });
    workflows.runDoctor.mockResolvedValue({ doctor: true });

    const invocations = [
      await invoke(AgentContext, { args: {}, flags: { 'base-url': 'https://preview.example' } }),
      await invoke(ApiList, { args: {}, flags: {} }),
      await invoke(ApiDescribe, { args: { operationId: 'list-apps' }, flags: {} }),
      await invoke(ApiRequest, {
        args: { operationId: 'set-app-public' },
        flags: { 'dry-run': true },
      }),
      await invoke(AppsCall, {
        args: { appId: 'app-1', operation: 'echo' },
        flags: { input: '{}' },
      }),
      await invoke(AppsCreate, { args: { directory: 'app' }, flags: { yes: true } }),
      await invoke(AppsDelete, { args: { appId: 'app-1' }, flags: { yes: true } }),
      await invoke(AppsDescribe, { args: { appId: 'app-1' }, flags: {} }),
      await invoke(AppsList, { args: {}, flags: { limit: '10' } }),
      await invoke(AppsSource, { args: { appId: 'app-1' }, flags: { out: 'app' } }),
      await invoke(AppsUpdate, {
        args: { appId: 'app-1', directory: 'app' },
        flags: { 'dry-run': true },
      }),
      await invoke(AuthLogin, { args: {}, flags: { 'no-open': true } }),
      await invoke(AuthLogout, { args: {}, flags: {} }),
      await invoke(AuthStatus, { args: {}, flags: {} }),
      await invoke(Doctor, { args: {}, flags: {} }),
    ];

    expect(workflows.agentContext).toHaveBeenCalledWith(context.baseUrl);
    expect(workflows.runApi).toHaveBeenNthCalledWith(1, 'list', [], context);
    expect(workflows.runApi).toHaveBeenNthCalledWith(2, 'describe', ['list-apps'], context);
    expect(workflows.runApi).toHaveBeenNthCalledWith(3, 'request', ['set-app-public'], context);
    expect(workflows.runApps).toHaveBeenNthCalledWith(1, 'call', ['app-1', 'echo'], context);
    expect(workflows.runApps).toHaveBeenNthCalledWith(2, 'create', ['app'], context);
    expect(workflows.runApps).toHaveBeenNthCalledWith(3, 'delete', ['app-1'], context);
    expect(workflows.runApps).toHaveBeenNthCalledWith(4, 'describe', ['app-1'], context);
    expect(workflows.runApps).toHaveBeenNthCalledWith(5, 'list', [], context);
    expect(workflows.runApps).toHaveBeenNthCalledWith(6, 'source', ['app-1'], context);
    expect(workflows.runApps).toHaveBeenNthCalledWith(7, 'update', ['app-1', 'app'], context);
    expect(workflows.runAuth).toHaveBeenNthCalledWith(1, 'login', context);
    expect(workflows.runAuth).toHaveBeenNthCalledWith(2, 'logout', context);
    expect(workflows.runAuth).toHaveBeenNthCalledWith(3, 'status', context);
    expect(workflows.runDoctor).toHaveBeenCalledWith(context);
    expect(invocations.every(({ output }) => output.mock.calls.length === 1)).toBe(true);
  });
});
