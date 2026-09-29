import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test, vi } from 'vitest';

import { fetchThatWaitsForAbort } from '../test-helpers.js';
import {
  agentContext,
  redactSecrets,
  runApi,
  runApps,
  runAuth,
  runDoctor,
  type CommandContext,
} from './commands.js';
import { PRODUCTION_BASE_URL } from './config.js';

const APP_ID = '00000000-0000-4000-8000-000000000001';

async function runCommand(context: CommandContext & { command: string[] }): Promise<unknown> {
  const [topic, action, ...positionals] = context.command;
  const result =
    topic === 'auth'
      ? await runAuth(action, context)
      : topic === 'apps'
        ? await runApps(action, positionals, context)
        : topic === 'api'
          ? await runApi(action, positionals, context)
          : topic === 'doctor'
            ? await runDoctor(context)
            : topic === 'agent-context'
              ? agentContext(context.baseUrl)
              : (() => {
                  throw new Error(`Unknown command: ${context.command.join(' ') || '(none)'}`);
                })();
  return redactSecrets(result);
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('redactSecrets', () => {
  const envelope =
    'chrm_render_v2.eyJhcHAiOiI5MWQ1MjU3ZS05YWM2LTQ1MmMtYTY4Mi0zNzM4ZTJjYjMzMmYiLCJxYyI6ImFub24iLCJleHAiOjE3OTAwMDAwMDAsImtpZCI6IjEiLCJuIjoiWVdGaFlXRmhZV0ZoWVdGaFlXRmhZV0ZoWVdGaFlXRmhZV0ZoWVdFIn0.P-bjKFLC3c7ZqkNY7U1y7XAUVTy78m_ynqj1k3QC638';

  test('leaves no payload or signature bytes of a dotted render envelope', () => {
    const scrubbed = redactSecrets(`token=${envelope} done`) as string;

    expect(scrubbed).toBe('token=[redacted] done');
    expect(scrubbed).not.toContain(envelope.split('.')[1]);
    expect(scrubbed).not.toContain(envelope.split('.')[2]);
  });

  test('still redacts the opaque token shapes whole', () => {
    expect(redactSecrets(`bearer chrm_render_${'a'.repeat(43)}`)).toBe('bearer [redacted]');
    expect(redactSecrets(`bearer chrm_user_${'a'.repeat(43)}`)).toBe('bearer [redacted]');
  });

  test('reaches a token nested in an object or an array', () => {
    expect(redactSecrets({ note: [`see ${envelope}`] })).toEqual({ note: ['see [redacted]'] });
  });
});

const SESSION_COOKIE = 'better-auth.session_token=fixture-session';
const SESSION_COOKIE_REQUIRED =
  'Operation update-team-member needs a signed-in Charming session cookie. Personal access tokens, including the one from `charming auth login`, are not accepted. Do this in the Charming web app, or pass your session cookie with --header Cookie=NAME=VALUE.';

async function withSavedToken<T>(
  baseUrl: string,
  token: string,
  use: () => Promise<T>,
): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), 'charming-session-'));
  await mkdir(join(directory, 'charming'));
  await writeFile(
    join(directory, 'charming', 'config.json'),
    `${JSON.stringify({ tokens: { [baseUrl]: token } })}\n`,
  );
  vi.stubEnv('XDG_CONFIG_HOME', directory);
  try {
    return await use();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

describe('runCommand', () => {
  test.each([
    {
      operation: 'transfer-app',
      param: ['appId=app-1'],
      path: '/api/v1/apps/app-1/transfer',
      method: 'POST',
      body: '{"teamId":"team-1","keepExistingAppMembers":false}',
    },
    {
      operation: 'decline-team-invitation',
      param: ['invitationId=invite-1'],
      path: '/api/v1/team-invitations/invite-1/decline',
      method: 'POST',
      header: [`Cookie=${SESSION_COOKIE}`],
    },
    {
      operation: 'add-team-member',
      param: ['teamId=team-1'],
      path: '/api/v1/teams/team-1/members',
      method: 'POST',
      body: '{"grantee":"friend@charming.test","role":"owner"}',
    },
    {
      operation: 'update-team-app-defaults',
      param: ['teamId=team-1'],
      path: '/api/v1/teams/team-1/app-defaults',
      method: 'PATCH',
      body: '{"generalAccessTier":"public-view"}',
    },
  ])(
    'requires consent before $operation sends a request',
    async ({ operation, param, path, method, body, header }) => {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockImplementation(async () => Response.json({ ok: true }));
      const context: CommandContext = {
        baseUrl: 'https://charming.test',
        fetchImpl,
        options: { param, ...(body ? { body } : {}), ...(header ? { header } : {}) },
        ...(header ? {} : { token: 'chrm_user_fixture' }),
      };
      await expect(runApi('request', [operation], context)).rejects.toThrow(
        new Error('This action requires --yes. Use --dry-run to preview it.'),
      );
      expect(fetchImpl).not.toHaveBeenCalled();
      await expect(
        runApi('request', [operation], {
          ...context,
          options: { ...context.options, 'dry-run': true },
        }),
      ).resolves.toMatchObject({ dryRun: true, method, path });
      expect(fetchImpl).not.toHaveBeenCalled();
      await expect(
        runApi('request', [operation], { ...context, options: { ...context.options, yes: true } }),
      ).resolves.toEqual({ ok: true });
      expect(fetchImpl).toHaveBeenCalledOnce();
      expect(fetchImpl.mock.calls[0]?.[0]).toBe(`https://charming.test${path}`);
      expect(fetchImpl.mock.calls[0]?.[1]?.method).toBe(method);
    },
  );

  describe('session-cookie-only operations', () => {
    const baseUrl = 'https://charming.test';
    const updateMember = {
      param: ['teamId=team-1', 'memberId=member-1'],
      body: '{"role":"admin"}',
    };

    test('send the Cookie header and no bearer even with a saved token', async () => {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockImplementation(async () => Response.json({ ok: true }));

      const result = await withSavedToken(baseUrl, 'chrm_user_expired', () =>
        runApi('request', ['update-team-member'], {
          baseUrl,
          fetchImpl,
          options: { ...updateMember, header: [`cookie=${SESSION_COOKIE}`] },
        }),
      );

      expect(result).toEqual({ ok: true });
      expect(fetchImpl).toHaveBeenCalledOnce();
      expect(fetchImpl.mock.calls[0]?.[0]).toBe(`${baseUrl}/api/v1/teams/team-1/members/member-1`);
      const headers = new Headers(fetchImpl.mock.calls[0]?.[1]?.headers);
      expect(headers.get('cookie')).toBe(SESSION_COOKIE);
      expect(headers.has('authorization')).toBe(false);
    });

    test('fail before any request when no Cookie header is supplied', async () => {
      const fetchImpl = vi.fn<typeof fetch>();

      await expect(
        withSavedToken(baseUrl, 'chrm_user_saved', () =>
          runApi('request', ['update-team-member'], {
            baseUrl,
            fetchImpl,
            options: updateMember,
          }),
        ),
      ).rejects.toThrow(new Error(SESSION_COOKIE_REQUIRED));
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    test('refuse an explicit --token instead of dropping it', async () => {
      const fetchImpl = vi.fn<typeof fetch>();

      await expect(
        runApi('request', ['update-team-member'], {
          baseUrl,
          fetchImpl,
          options: { ...updateMember, header: [`Cookie=${SESSION_COOKIE}`] },
          token: 'chrm_user_fixture',
        }),
      ).rejects.toThrow('Operation update-team-member does not accept --token.');
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    test('preview with --dry-run without a cookie', async () => {
      const fetchImpl = vi.fn<typeof fetch>();

      await expect(
        runApi('request', ['update-team-member'], {
          baseUrl,
          fetchImpl,
          options: { ...updateMember, 'dry-run': true },
        }),
      ).resolves.toEqual({
        dryRun: true,
        method: 'PATCH',
        path: '/api/v1/teams/team-1/members/member-1',
        body: { role: 'admin' },
      });
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    test('leave bearer auth on operations that accept a personal token', async () => {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockImplementation(async () => Response.json({ apps: [] }));

      await withSavedToken(baseUrl, 'chrm_user_saved', () =>
        runApi('request', ['list-team-apps'], {
          baseUrl,
          fetchImpl,
          options: { param: ['teamId=team-1'] },
        }),
      );

      const headers = new Headers(fetchImpl.mock.calls[0]?.[1]?.headers);
      expect(headers.get('authorization')).toBe('Bearer chrm_user_saved');
    });
  });

  test('updates from a project directory with optimistic concurrency', async () => {
    const directory = await appDirectory();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json(
          { source: { module: 'old', ui: 'old ui', styles: 'old css' } },
          { headers: { ETag: '"3"' } },
        ),
      )
      .mockResolvedValueOnce(Response.json({ id: APP_ID, revision: 4 }));

    const result = await runCommand({
      baseUrl: 'https://charming.test',
      command: ['apps', 'update', APP_ID, directory],
      fetchImpl,
      options: {},
      token: 'bld_user_test',
    });

    expect(result).toEqual({ id: APP_ID, revision: 4 });
    expect(fetchImpl).toHaveBeenLastCalledWith(
      `https://charming.test/app/${APP_ID}`,
      expect.objectContaining({
        headers: expect.objectContaining({ 'If-Match': '"3"' }),
        method: 'PUT',
      }),
    );
  });

  test('refuses to update when the source response has no ETag', async () => {
    const directory = await appDirectory();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ source: { module: 'old', ui: 'old ui', styles: 'old css' } }),
      )
      .mockResolvedValueOnce(Response.json({ id: APP_ID, revision: 4 }));

    await expect(
      runCommand({
        baseUrl: 'https://charming.test',
        command: ['apps', 'update', APP_ID, directory],
        fetchImpl,
        options: {},
        token: 'bld_user_test',
      }),
    ).rejects.toThrow(
      'Charming did not return an ETag for this app source; refusing to update without optimistic concurrency. Retry. If it still fails, run `charming doctor` and check that `--base-url` points to Charming.',
    );
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledWith(
      `https://charming.test/app/${APP_ID}/source`,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  test('dry-runs a generated mutation without making a request', async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    const result = await runCommand({
      baseUrl: 'https://charming.test',
      command: ['api', 'request', 'set-app-public'],
      fetchImpl,
      options: {
        body: '{"public":true}',
        'dry-run': true,
        param: ['id=app-1'],
      },
      token: 'bld_user_test',
    });

    expect(result).toEqual({
      body: { public: true },
      dryRun: true,
      method: 'PUT',
      path: '/app/app-1/public',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test.each([
    {
      id: 'revoke-app-share',
      path: '/api/v1/apps/app-1/shares/revoke',
      param: ['appId=app-1'],
      body: '{"grantee":"friend@example.com"}',
    },
    {
      id: 'revoke-app-share-by-id',
      path: '/api/v1/apps/app-1/shares/share-1/revoke',
      param: ['appId=app-1', 'shareId=share-1'],
    },
    { id: 'decline-app-share', path: '/api/v1/apps/app-1/shares/decline', param: ['appId=app-1'] },
  ])('requires confirmation for share deletion through $id', async ({ id, path, param, body }) => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => Response.json({ ok: true, removed: true }));
    const context = {
      baseUrl: 'https://charming.test',
      command: ['api', 'request', id],
      fetchImpl,
      token: 'chrm_user_fixture',
      options: { param, ...(body ? { body } : {}) },
    };
    await expect(runCommand(context)).rejects.toThrow(
      new Error('This action requires --yes. Use --dry-run to preview it.'),
    );
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(
      await runCommand({ ...context, options: { ...context.options, 'dry-run': true } }),
    ).toMatchObject({ dryRun: true, method: 'POST', path });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await runCommand({ ...context, options: { ...context.options, yes: true } })).toEqual({
      ok: true,
      removed: true,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledWith(
      `https://charming.test${path}`,
      expect.objectContaining({ method: 'POST' }),
    );
  });

  test('rejects a missing required body in a generated request', async () => {
    await expect(
      runCommand({
        baseUrl: 'https://charming.test',
        command: ['api', 'request', 'set-app-public'],
        options: {
          'dry-run': true,
          param: ['id=app-1'],
        },
      }),
    ).rejects.toThrow('Operation set-app-public requires --body JSON|@FILE');
  });

  test('rejects unknown generated request parameters', async () => {
    await expect(
      runCommand({
        baseUrl: 'https://charming.test',
        command: ['api', 'request', 'set-app-public'],
        options: {
          body: '{"public":true}',
          'dry-run': true,
          param: ['id=app-1', 'typo=x'],
        },
      }),
    ).rejects.toThrow('Unknown --param typo');
  });

  test('redacts secret values from generated dry runs', async () => {
    await expect(
      runCommand({
        baseUrl: 'https://charming.test',
        command: ['api', 'request', 'create-app-secret'],
        options: {
          body: '{"name":"API_KEY","value":"super-sensitive-value"}',
          'dry-run': true,
          param: ['id=app-1'],
        },
      }),
    ).resolves.toEqual({
      body: { name: 'API_KEY', value: '[redacted]' },
      dryRun: true,
      method: 'POST',
      path: '/app/app-1/secrets',
    });
  });

  test('emits machine-readable agent context', async () => {
    const packageVersion = JSON.parse(
      await readFile(join(import.meta.dirname, '..', 'package.json'), 'utf8'),
    ).version;
    const result = await runCommand({
      baseUrl: 'https://charming.test',
      command: ['agent-context'],
      options: {},
    });

    expect(result).toEqual(
      expect.objectContaining({
        auth: expect.objectContaining({ tokenKinds: ['chrm_user_*', 'chrm_app_*'] }),
        cliVersion: packageVersion,
        schemaVersion: 1,
        safety: expect.objectContaining({ sourceUpdatesUseEtag: true }),
      }),
    );
  });

  test('requires consent before an authenticated create can overwrite an app', async () => {
    const directory = await appDirectory();
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(
      runCommand({
        baseUrl: 'https://charming.test',
        command: ['apps', 'create', directory],
        fetchImpl,
        options: {},
        token: 'chrm_user_test',
      }),
    ).rejects.toThrow('Authenticated create may overwrite an app with the same manifest id');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('allows an authenticated create with explicit consent', async () => {
    const directory = await appDirectory();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ id: 'app-1' }));

    await expect(
      runCommand({
        baseUrl: 'https://charming.test',
        command: ['apps', 'create', directory],
        fetchImpl,
        options: { yes: true },
        token: 'chrm_user_test',
      }),
    ).resolves.toEqual({ id: 'app-1' });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  test('includes an app description on create when --description is set', async () => {
    const directory = await appDirectory();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ id: 'app-1' }));

    await runCommand({
      baseUrl: 'https://charming.test',
      command: ['apps', 'create', directory],
      fetchImpl,
      options: { yes: true, description: 'A place to jot things down.' },
      token: 'chrm_user_test',
    });

    const init = fetchImpl.mock.calls[0]?.[1];
    const body = JSON.parse(init?.body as string);
    expect(body.description).toBe('A place to jot things down.');
  });

  test('omits description from the create body when --description is not set', async () => {
    const directory = await appDirectory();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ id: 'app-1' }));

    await runCommand({
      baseUrl: 'https://charming.test',
      command: ['apps', 'create', directory],
      fetchImpl,
      options: { yes: true },
      token: 'chrm_user_test',
    });

    const init = fetchImpl.mock.calls[0]?.[1];
    const body = JSON.parse(init?.body as string);
    expect(body).not.toHaveProperty('description');
  });

  test('renames an app', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ ok: true, appName: 'new-name', previousAppName: 'old-name' }),
      );

    const result = await runCommand({
      baseUrl: 'https://charming.test',
      command: ['apps', 'rename', APP_ID, 'new-name'],
      fetchImpl,
      options: {},
      token: 'chrm_user_test',
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      `https://charming.test/account/apps/${APP_ID}/name`,
      expect.objectContaining({ method: 'POST' }),
    );
    const init = fetchImpl.mock.calls[0]?.[1];
    expect(JSON.parse(init?.body as string)).toEqual({ app_name: 'new-name' });
    expect(result).toEqual({ ok: true, appName: 'new-name', previousAppName: 'old-name' });
  });

  test('dry-runs a rename without making a request', async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    const result = await runCommand({
      baseUrl: 'https://charming.test',
      command: ['apps', 'rename', APP_ID, 'new-name'],
      fetchImpl,
      options: { 'dry-run': true },
      token: 'chrm_user_test',
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result).toEqual({
      dryRun: true,
      method: 'POST',
      path: `/account/apps/${APP_ID}/name`,
      body: { app_name: 'new-name' },
    });
  });

  test('surfaces the flat { reason, message } envelope a rename failure returns', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        { ok: false, reason: 'reserved_name', message: 'That name is reserved.' },
        {
          status: 400,
        },
      ),
    );

    await expect(
      runCommand({
        baseUrl: 'https://charming.test',
        command: ['apps', 'rename', APP_ID, 'admin'],
        fetchImpl,
        options: {},
        token: 'chrm_user_test',
      }),
    ).rejects.toMatchObject({ kind: 'reserved_name', message: 'That name is reserved.' });
  });

  test('gives the source route more headroom than the default read timeout', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(fetchThatWaitsForAbort);
    vi.useFakeTimers();

    const pending = runCommand({
      baseUrl: 'https://charming.test',
      command: ['apps', 'source', APP_ID],
      fetchImpl,
      options: {},
      token: 'chrm_app_test',
    });
    const assertion = expect(pending).rejects.toMatchObject({ kind: 'timeout', timeoutMs: 10_000 });
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
  });

  test('--timeout overrides the default for a request', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(fetchThatWaitsForAbort);
    vi.useFakeTimers();

    const pending = runCommand({
      baseUrl: 'https://charming.test',
      command: ['apps', 'list'],
      fetchImpl,
      options: {},
      timeoutMs: 500,
      token: 'chrm_user_test',
    });
    const assertion = expect(pending).rejects.toMatchObject({ kind: 'timeout', timeoutMs: 500 });
    await vi.advanceTimersByTimeAsync(500);
    await assertion;
  });

  test('describes an app before calling one of its operations', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        operations: [{ name: 'hello', input: { type: 'object' } }],
      }),
    );

    const result = await runCommand({
      baseUrl: 'https://charming.test',
      command: ['apps', 'describe', APP_ID],
      fetchImpl,
      options: {},
      token: 'bld_user_test',
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      `https://charming.test/app/${APP_ID}/agent.json`,
      expect.objectContaining({ method: 'GET' }),
    );
    expect(result).toEqual({
      operations: [{ name: 'hello', input: { type: 'object' } }],
    });
  });

  test('requires explicit confirmation for generated deletes', async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(
      runCommand({
        baseUrl: 'https://charming.test',
        command: ['api', 'request', 'delete-app'],
        fetchImpl,
        options: { param: ['id=app-1'] },
        token: 'bld_user_test',
      }),
    ).rejects.toThrow(new Error('This action requires --yes. Use --dry-run to preview it.'));
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('requires explicit confirmation for a generated create that may overwrite an app', async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(
      runCommand({
        baseUrl: 'https://charming.test',
        command: ['api', 'request', 'create-app'],
        fetchImpl,
        options: { body: '{"module":"export const manifest = {}"}' },
        token: 'bld_user_test',
      }),
    ).rejects.toThrow('may overwrite an existing app with the same manifest id');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('allows a generated create dry run without confirmation', async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(
      runCommand({
        baseUrl: 'https://charming.test',
        command: ['api', 'request', 'create-app'],
        fetchImpl,
        options: { body: '{"module":"export const manifest = {}"}', 'dry-run': true },
        token: 'bld_user_test',
      }),
    ).resolves.toEqual(expect.objectContaining({ dryRun: true, method: 'POST', path: '/app' }));
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test.each([
    {
      name: 'an anonymous request',
      options: { body: '{"module":"export const manifest = {}"}', yes: true },
      token: undefined,
    },
    {
      name: 'a pairing request',
      options: {
        body: '{"module":"export const manifest = {}","pair":true}',
        yes: true,
      },
      token: 'chrm_user_test',
    },
  ])(
    'refuses raw create-app for $name before it can mint a credential',
    async ({ options, token }) => {
      const directory = await mkdtemp(join(tmpdir(), 'charming-auth-'));
      vi.stubEnv('XDG_CONFIG_HOME', directory);
      vi.stubEnv('CHARMING_TOKEN', '');
      vi.stubEnv('BUILDY_USER_TOKEN', '');
      const fetchImpl = vi.fn<typeof fetch>();

      await expect(
        runCommand({
          baseUrl: 'https://preview.example',
          command: ['api', 'request', 'create-app'],
          fetchImpl,
          options,
          token,
        }),
      ).rejects.toThrow('Run `charming apps create`');
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );

  test('allows authenticated raw create-app without pairing', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ id: 'app-1' }));

    await expect(
      runCommand({
        baseUrl: 'https://charming.test',
        command: ['api', 'request', 'create-app'],
        fetchImpl,
        options: { body: '{"module":"export const manifest = {}"}', yes: true },
        token: 'chrm_user_test',
      }),
    ).resolves.toEqual({ id: 'app-1' });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  test('allows a delete dry run without confirmation', async () => {
    await expect(
      runCommand({
        baseUrl: 'https://charming.test',
        command: ['apps', 'delete', APP_ID],
        options: { 'dry-run': true },
      }),
    ).resolves.toEqual({
      dryRun: true,
      method: 'DELETE',
      path: `/app/${APP_ID}`,
    });
  });

  test('describes generated request and response schemas', async () => {
    const result = (await runCommand({
      baseUrl: 'https://charming.test',
      command: ['api', 'describe', 'set-app-public'],
      options: {},
    })) as {
      requestBody: { example: unknown; schema: unknown };
      response: { schema: unknown };
      usage: string;
    };

    expect(result.requestBody.example).toEqual({ public: false });
    expect(result.requestBody.schema).toEqual(
      expect.objectContaining({ required: ['public'], type: 'object' }),
    );
    expect(result.response.schema).toEqual(expect.objectContaining({ type: 'object' }));
    expect(result.usage).toContain('--param id=VALUE --body @body.json');
  });

  test('maps OpenAPI header parameters from --param', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ok: true }));

    await runCommand({
      baseUrl: 'https://charming.test',
      command: ['api', 'request', 'patch-app-source'],
      fetchImpl,
      options: {
        body: '{"edits":[]}',
        param: ['id=app-1', 'If-Match="1"'],
      },
      token: 'bld_user_test',
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://charming.test/app/app-1/source',
      expect.objectContaining({
        headers: expect.objectContaining({ 'If-Match': '"1"' }),
      }),
    );
  });

  test.each(['create-token', 'poll-pairing', 'start-pairing'])(
    'refuses raw %s requests before they can mint a hidden credential',
    async (operationId) => {
      const fetchImpl = vi.fn<typeof fetch>();

      await expect(
        runCommand({
          baseUrl: 'https://charming.test',
          command: ['api', 'request', operationId],
          fetchImpl,
          options: {},
          token: 'bld_user_caller',
        }),
      ).rejects.toThrow('Run `charming auth login`');
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );

  test.each([
    ['create-token', undefined],
    ['poll-pairing', '{"device_code":"chrm_pair_private"}'],
    ['start-pairing', undefined],
  ])('allows a raw %s dry run without making a request', async (operationId, body) => {
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(
      runCommand({
        baseUrl: 'https://charming.test',
        command: ['api', 'request', operationId],
        fetchImpl,
        options: { ...(body === undefined ? {} : { body }), 'dry-run': true },
      }),
    ).resolves.toEqual(expect.objectContaining({ dryRun: true, method: 'POST' }));
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('saves a device-login token for the production origin after a pending poll is approved', async () => {
    vi.useFakeTimers();
    const directory = await mkdtemp(join(tmpdir(), 'charming-auth-'));
    vi.stubEnv('XDG_CONFIG_HOME', directory);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(pairingStartResponse(PRODUCTION_BASE_URL))
      .mockResolvedValueOnce(Response.json({ status: 'pending' }))
      .mockResolvedValueOnce(Response.json({ status: 'approved', token: 'chrm_user_saved-token' }));

    const login = runCommand({
      baseUrl: PRODUCTION_BASE_URL,
      command: ['auth', 'login'],
      fetchImpl,
      options: { 'no-open': true },
    });
    await vi.advanceTimersByTimeAsync(2_000);

    await expect(login).resolves.toEqual({ authenticated: true });
    expect(JSON.parse(await readFile(join(directory, 'charming', 'config.json'), 'utf8'))).toEqual({
      token: 'chrm_user_saved-token',
    });
  });

  test('stores a device-login token under its non-production origin', async () => {
    vi.useFakeTimers();
    const directory = await mkdtemp(join(tmpdir(), 'charming-auth-'));
    vi.stubEnv('XDG_CONFIG_HOME', directory);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(pairingStartResponse('https://preview.example'))
      .mockResolvedValueOnce(
        Response.json({ status: 'approved', token: 'chrm_user_preview-token' }),
      );

    const login = runCommand({
      baseUrl: 'https://preview.example',
      command: ['auth', 'login'],
      fetchImpl,
      options: { 'no-open': true },
    });
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(login).resolves.toEqual({ authenticated: true });
    expect(JSON.parse(await readFile(join(directory, 'charming', 'config.json'), 'utf8'))).toEqual({
      tokens: { 'https://preview.example': 'chrm_user_preview-token' },
    });
  });

  test.each([
    [{ status: 'expired' }, 'Pairing code expired'],
    [
      { status: 'approved', already_delivered: true },
      'Pairing token was already delivered and cannot be shown again',
    ],
    [{ status: 'unexpected' }, 'Charming returned an invalid pairing response'],
    [{ status: 'approved' }, 'Charming returned an invalid pairing response'],
  ])('rejects a terminal device-login response %#', async (pollResponse, message) => {
    vi.useFakeTimers();
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(pairingStartResponse())
      .mockResolvedValueOnce(Response.json(pollResponse));

    const login = runCommand({
      baseUrl: 'https://charming.test',
      command: ['auth', 'login'],
      fetchImpl,
      options: { 'no-open': true },
    });
    const rejection = expect(login).rejects.toThrow(message);
    await vi.advanceTimersByTimeAsync(1_000);

    await rejection;
  });

  test('rejects an invalid device-login start response without polling', async () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
      Response.json({
        expires_in: 600,
        user_code: 'CHRM-ABC234',
        verification_url: 'https://charming.test/pair',
      }),
    );

    await expect(
      runCommand({
        baseUrl: 'https://charming.test',
        command: ['auth', 'login'],
        fetchImpl,
        options: { 'no-open': true },
      }),
    ).rejects.toThrow('Charming returned an invalid pairing response');
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  test.each([
    ['user_code', ''],
    ['verification_url', ''],
    ['expires_in', 0],
    ['expires_in', '600'],
    ['polling_interval', 0],
    ['polling_interval', -1],
    ['verification_url_complete', ''],
    ['verification_url_complete', 42],
  ])('rejects an invalid pairing-start %s without polling', async (field, value) => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        pairingStartResponse('https://charming.test', 600, 1, { [field]: value }),
      );

    await expect(
      runCommand({
        baseUrl: 'https://charming.test',
        command: ['auth', 'login'],
        fetchImpl,
        options: { 'no-open': true },
      }),
    ).rejects.toThrow('Charming returned an invalid pairing response');
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  test('uses a valid complete verification URL', async () => {
    vi.useFakeTimers();
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        pairingStartResponse('https://charming.test', 600, 1, {
          verification_url_complete: 'https://charming.test/pair?code=CHRM-ABC234',
        }),
      )
      .mockResolvedValueOnce(Response.json({ status: 'expired' }));

    const login = runCommand({
      baseUrl: 'https://charming.test',
      command: ['auth', 'login'],
      fetchImpl,
      options: { 'no-open': true },
    });
    const rejection = expect(login).rejects.toThrow('Pairing code expired');
    await vi.advanceTimersByTimeAsync(1_000);

    await rejection;
    expect(stderr).toHaveBeenCalledWith(
      expect.stringContaining('https://charming.test/pair?code=CHRM-ABC234'),
    );
  });

  test('stops device login at its deadline without a late poll', async () => {
    vi.useFakeTimers();
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(pairingStartResponse('https://charming.test', 1, 5));

    const login = runCommand({
      baseUrl: 'https://charming.test',
      command: ['auth', 'login'],
      fetchImpl,
      options: { 'no-open': true },
    });
    const rejection = expect(login).rejects.toThrow('Pairing code expired');
    await vi.advanceTimersByTimeAsync(1_000);

    await rejection;
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  test('caps device login at ten minutes without a late poll', async () => {
    vi.useFakeTimers();
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(pairingStartResponse('https://charming.test', 3_600, 3_600));

    const login = runCommand({
      baseUrl: 'https://charming.test',
      command: ['auth', 'login'],
      fetchImpl,
      options: { 'no-open': true },
    });
    const rejection = expect(login).rejects.toThrow('Pairing code expired');
    await vi.advanceTimersByTimeAsync(600_000);

    await rejection;
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  test('uploads a generated multipart operation without setting a JSON content type', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'charming-asset-'));
    const file = join(directory, 'icon.txt');
    await writeFile(file, 'asset contents');
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ ok: true }, { status: 201 }));

    await runCommand({
      baseUrl: 'https://charming.test',
      command: ['api', 'request', 'upload-app-asset'],
      fetchImpl,
      options: {
        body: '{"key":"icon.txt"}',
        file,
        param: ['id=app-1'],
      },
      token: 'bld_user_test',
    });

    const request = fetchImpl.mock.calls[0]?.[1];
    if (!request) throw new Error('Expected an upload request');
    const requestBody = request.body as FormData;
    expect(requestBody).toBeInstanceOf(FormData);
    expect(requestBody.get('key')).toBe('icon.txt');
    expect(requestBody.get('file')).toBeInstanceOf(File);
    expect(request.headers).not.toEqual(
      expect.objectContaining({ 'Content-Type': 'application/json' }),
    );
  });

  test('does not delete a saved token when an environment token blocks logout', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'charming-auth-'));
    const configDirectory = join(directory, 'charming');
    const configPath = join(configDirectory, 'config.json');
    await mkdir(configDirectory);
    await writeFile(configPath, '{"token":"saved"}\n');
    vi.stubEnv('XDG_CONFIG_HOME', directory);
    vi.stubEnv('CHARMING_TOKEN', 'from-env');

    try {
      await expect(
        runCommand({
          baseUrl: PRODUCTION_BASE_URL,
          command: ['auth', 'logout'],
          options: {},
        }),
      ).rejects.toThrow('Cannot log out while CHARMING_TOKEN is set');
      expect(await readFile(configPath, 'utf8')).toContain('saved');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  test('logout removes all credentials for the selected origin only', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'charming-auth-'));
    const configDirectory = join(directory, 'charming');
    const configPath = join(configDirectory, 'config.json');
    await mkdir(configDirectory);
    await writeFile(
      configPath,
      JSON.stringify({
        appTokens: {
          'https://preview.example|preview-app': 'preview-app-token',
          'https://other.example|other-app': 'other-app-token',
          [`${PRODUCTION_BASE_URL}|production-app`]: 'production-app-token',
        },
        token: 'production-user-token',
        tokens: {
          'https://other.example': 'other-user-token',
          'https://preview.example': 'preview-user-token',
        },
      }),
    );
    vi.stubEnv('XDG_CONFIG_HOME', directory);

    await expect(
      runCommand({
        baseUrl: 'https://preview.example',
        command: ['auth', 'logout'],
        options: {},
      }),
    ).resolves.toEqual({ appTokensRemoved: 1, authenticated: false });
    expect(JSON.parse(await readFile(configPath, 'utf8'))).toEqual({
      appTokens: {
        'https://other.example|other-app': 'other-app-token',
        [`${PRODUCTION_BASE_URL}|production-app`]: 'production-app-token',
      },
      token: 'production-user-token',
      tokens: { 'https://other.example': 'other-user-token' },
    });
  });

  test('logout removes app credentials when no user credential is saved', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'charming-auth-'));
    const configDirectory = join(directory, 'charming');
    const configPath = join(configDirectory, 'config.json');
    await mkdir(configDirectory);
    await writeFile(
      configPath,
      JSON.stringify({
        appTokens: {
          'https://preview.example|preview-app': 'preview-app-token',
          'https://other.example|other-app': 'other-app-token',
        },
      }),
    );
    vi.stubEnv('XDG_CONFIG_HOME', directory);

    await expect(
      runCommand({
        baseUrl: 'https://preview.example',
        command: ['auth', 'logout'],
        options: {},
      }),
    ).resolves.toEqual({ appTokensRemoved: 1, authenticated: false });
    expect(JSON.parse(await readFile(configPath, 'utf8'))).toEqual({
      appTokens: { 'https://other.example|other-app': 'other-app-token' },
    });
  });

  test('does not report a server failure as an invalid credential', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ openapi: '3.1.0', paths: {} }))
      .mockResolvedValueOnce(Response.json({ error: { kind: 'service_error' } }, { status: 503 }));

    await expect(
      runCommand({
        baseUrl: 'https://charming.test',
        command: ['doctor'],
        fetchImpl,
        options: {},
        token: 'bld_user_test',
      }),
    ).rejects.toEqual(expect.objectContaining({ status: 503 }));
  });

  test('reports the checked origin when doctor cannot connect', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('fetch failed'));

    await expect(
      runCommand({
        baseUrl: 'https://offline.example',
        command: ['doctor'],
        fetchImpl,
        options: {},
      }),
    ).rejects.toThrow(
      'Could not reach https://offline.example: fetch failed. Check --base-url and your network connection.',
    );
  });

  test('never prints a pairing device code from anonymous create', async () => {
    const directory = await appDirectory();
    vi.stubEnv('XDG_CONFIG_HOME', join(directory, 'config'));
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        id: 'app-1',
        token: 'bld_app_secret',
        pairing: {
          device_code: 'bld_pair_secret',
          user_code: 'CHRM-ABC234',
          verification_url: 'https://charming.test/pair',
        },
      }),
    );

    try {
      const result = await runCommand({
        baseUrl: 'https://charming.test',
        command: ['apps', 'create', directory],
        fetchImpl,
        options: {},
        token: '',
      });

      expect(JSON.stringify(result)).not.toContain('bld_pair_secret');
      expect(JSON.stringify(result)).not.toContain('bld_app_secret');
      expect(result).toEqual(
        expect.objectContaining({
          pairing: {
            user_code: 'CHRM-ABC234',
            verification_url: 'https://charming.test/pair',
          },
          tokenSaved: true,
        }),
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe('apps call', () => {
  function descriptor(): Response {
    return Response.json({
      operations: [
        routeOperation('list', 'GET', '/api/list'),
        routeOperation('add', 'POST', '/api/add'),
        routeOperation('rename', 'PUT', '/api/items/rename'),
        routeOperation('remove', 'DELETE', '/api/remove'),
      ],
    });
  }

  async function call(operation: string, input: string) {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(descriptor())
      .mockResolvedValueOnce(Response.json({ ok: true }));
    const result = await runCommand({
      baseUrl: 'https://charming.test',
      command: ['apps', 'call', APP_ID, operation],
      fetchImpl,
      options: { input, yes: true },
      token: 'chrm_user_test',
    });
    return { fetchImpl, result };
  }

  test('reads the app descriptor before calling the operation', async () => {
    const { fetchImpl } = await call('add', '{}');

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      `https://charming.test/app/${APP_ID}/agent.json`,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  test('sends a GET operation its input as query parameters', async () => {
    const { fetchImpl, result } = await call(
      'list',
      '{"status":"open","limit":5,"done":false,"tag":["a","b"]}',
    );

    expect(result).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const request = sentRequest(fetchImpl, 1);
    expect(request).toEqual(expect.objectContaining({ method: 'GET', body: undefined }));
    const sent = new URL(request.url);
    expect(sent.pathname).toBe(`/app/${APP_ID}/api/list`);
    expect(sent.searchParams.get('status')).toBe('open');
    expect(sent.searchParams.get('limit')).toBe('5');
    expect(sent.searchParams.get('done')).toBe('false');
    expect(sent.searchParams.getAll('tag')).toEqual(['a', 'b']);
  });

  test('sends a GET operation with empty input without a query string', async () => {
    const { fetchImpl } = await call('list', '{}');

    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      `https://charming.test/app/${APP_ID}/api/list`,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  test('refuses a GET input that cannot be a query parameter without calling the operation', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(descriptor());

    await expect(
      runCommand({
        baseUrl: 'https://charming.test',
        command: ['apps', 'call', APP_ID, 'list'],
        fetchImpl,
        options: { input: '{"filter":{"status":"open"}}' },
        token: 'chrm_user_test',
      }),
    ).rejects.toThrow('--input.filter');
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  test('sends a POST operation its input as a JSON body', async () => {
    const { fetchImpl } = await call('add', '{"title":"Milk","tags":["x"]}');

    expect(sentRequest(fetchImpl, 1)).toEqual({
      url: `https://charming.test/app/${APP_ID}/api/add`,
      method: 'POST',
      body: { title: 'Milk', tags: ['x'] },
    });
  });

  test.each([
    ['rename', 'PUT', '/api/items/rename'],
    ['remove', 'DELETE', '/api/remove'],
  ])('sends %s with its declared %s method and path', async (operation, method, path) => {
    const { fetchImpl } = await call(operation, '{"id":"item-1"}');

    expect(sentRequest(fetchImpl, 1)).toEqual({
      url: `https://charming.test/app/${APP_ID}${path}`,
      method: method,
      body: { id: 'item-1' },
    });
  });

  test('fails on an unknown operation without calling it and names the known ones', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(descriptor());

    await expect(
      runCommand({
        baseUrl: 'https://charming.test',
        command: ['apps', 'call', APP_ID, 'lsit'],
        fetchImpl,
        options: {},
        token: 'chrm_user_test',
      }),
    ).rejects.toThrow('Known operations: list, add, rename, remove.');
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  test('refuses a declared path outside the app API without calling it', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
      Response.json({
        operations: [routeOperation('wipe', 'DELETE', '/api/../../other-app')],
      }),
    );

    await expect(
      runCommand({
        baseUrl: 'https://charming.test',
        command: ['apps', 'call', APP_ID, 'wipe'],
        fetchImpl,
        options: {},
        token: 'chrm_user_test',
      }),
    ).rejects.toThrow('not under the app');
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  test('POSTs to an app without routes so its fetch handler receives the call', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ operations: [] }))
      .mockResolvedValueOnce(Response.json({ ok: true }));

    await runCommand({
      baseUrl: 'https://charming.test',
      command: ['apps', 'call', APP_ID, 'anything'],
      fetchImpl,
      options: { input: '{"a":1}' },
      token: 'chrm_user_test',
    });

    expect(sentRequest(fetchImpl, 1)).toEqual({
      url: `https://charming.test/app/${APP_ID}/api/anything`,
      method: 'POST',
      body: { a: 1 },
    });
  });

  test('POSTs an undeclared operation to a legacy app whose operations come from its manifest', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          operations: [
            {
              op: 'hello',
              method: 'POST',
              path: '/api/hello',
              discoveredFrom: ['manifest_export'],
            },
          ],
        }),
      )
      .mockResolvedValueOnce(Response.json({ ok: true }));

    await runCommand({
      baseUrl: 'https://charming.test',
      command: ['apps', 'call', APP_ID, 'bogus'],
      fetchImpl,
      options: {},
      token: 'chrm_user_test',
    });

    expect(sentRequest(fetchImpl, 1)).toEqual({
      url: `https://charming.test/app/${APP_ID}/api/bogus`,
      method: 'POST',
      body: {},
    });
  });

  test('dry-run reports the declared GET method and query string without calling the operation', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(descriptor());

    const result = await runCommand({
      baseUrl: 'https://charming.test',
      command: ['apps', 'call', APP_ID, 'list'],
      fetchImpl,
      options: { 'dry-run': true, input: '{"status":"open"}' },
      token: 'chrm_user_test',
    });

    expect(result).toEqual({
      dryRun: true,
      method: 'GET',
      path: `/app/${APP_ID}/api/list?status=open`,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});

function sentRequest(fetchImpl: ReturnType<typeof vi.fn<typeof fetch>>, index: number) {
  const call = fetchImpl.mock.calls[index];
  if (!call) throw new Error(`fetch was not called ${index + 1} times`);
  const [input, init] = call;
  const body = init?.body;
  return {
    url: input instanceof Request ? input.url : input.toString(),
    method: init?.method,
    body: typeof body === 'string' ? (JSON.parse(body) as unknown) : body,
  };
}

function routeOperation(op: string, method: string, path: string) {
  return { op, method, path, discoveredFrom: ['routes_export'] };
}

async function appDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'charming-app-'));
  await writeFile(join(directory, 'module.js'), 'new module');
  await writeFile(join(directory, 'ui.js'), 'new ui');
  await writeFile(join(directory, 'styles.css'), 'new css');
  return directory;
}

function pairingStartResponse(
  origin = 'https://charming.test',
  expiresIn = 600,
  pollingInterval = 1,
  overrides: Record<string, unknown> = {},
): Response {
  return Response.json({
    device_code: 'chrm_pair_device-code',
    expires_in: expiresIn,
    polling_interval: pollingInterval,
    user_code: 'CHRM-ABC234',
    verification_url: `${origin}/pair`,
    ...overrides,
  });
}
