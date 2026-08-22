import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  agentContext,
  redactSecrets,
  runApi,
  runApps,
  runAuth,
  runDoctor,
  type CommandContext,
} from './commands.js';

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

describe('runCommand', () => {
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
      .mockResolvedValueOnce(Response.json({ id: 'app-1', revision: 4 }));

    const result = await runCommand({
      baseUrl: 'https://charm.ing',
      command: ['apps', 'update', 'app-1', directory],
      fetchImpl,
      options: {},
      token: 'bld_user_test',
    });

    expect(result).toEqual({ id: 'app-1', revision: 4 });
    expect(fetchImpl).toHaveBeenLastCalledWith(
      'https://charm.ing/app/app-1',
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
      .mockResolvedValueOnce(Response.json({ id: 'app-1', revision: 4 }));

    await expect(
      runCommand({
        baseUrl: 'https://charm.ing',
        command: ['apps', 'update', 'app-1', directory],
        fetchImpl,
        options: {},
        token: 'bld_user_test',
      }),
    ).rejects.toThrow(
      'Charming did not return an ETag for this app source; refusing to update without optimistic concurrency. Retry. If it still fails, run `charming doctor` and check that `--base-url` points to Charming.',
    );
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://charm.ing/app/app-1/source',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  test('dry-runs a generated mutation without making a request', async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    const result = await runCommand({
      baseUrl: 'https://charm.ing',
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

  test('rejects a missing required body in a generated request', async () => {
    await expect(
      runCommand({
        baseUrl: 'https://charm.ing',
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
        baseUrl: 'https://charm.ing',
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
        baseUrl: 'https://charm.ing',
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
    const result = await runCommand({
      baseUrl: 'https://charm.ing',
      command: ['agent-context'],
      options: {},
    });

    expect(result).toEqual(
      expect.objectContaining({
        auth: expect.objectContaining({ tokenKinds: ['chrm_user_*', 'chrm_app_*'] }),
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
        baseUrl: 'https://charm.ing',
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
        baseUrl: 'https://charm.ing',
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
      baseUrl: 'https://charm.ing',
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
      baseUrl: 'https://charm.ing',
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
      baseUrl: 'https://charm.ing',
      command: ['apps', 'rename', 'app-1', 'new-name'],
      fetchImpl,
      options: {},
      token: 'chrm_user_test',
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://charm.ing/account/apps/app-1/name',
      expect.objectContaining({ method: 'POST' }),
    );
    const init = fetchImpl.mock.calls[0]?.[1];
    expect(JSON.parse(init?.body as string)).toEqual({ app_name: 'new-name' });
    expect(result).toEqual({ ok: true, appName: 'new-name', previousAppName: 'old-name' });
  });

  test('dry-runs a rename without making a request', async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    const result = await runCommand({
      baseUrl: 'https://charm.ing',
      command: ['apps', 'rename', 'app-1', 'new-name'],
      fetchImpl,
      options: { 'dry-run': true },
      token: 'chrm_user_test',
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result).toEqual({
      dryRun: true,
      method: 'POST',
      path: '/account/apps/app-1/name',
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
        baseUrl: 'https://charm.ing',
        command: ['apps', 'rename', 'app-1', 'admin'],
        fetchImpl,
        options: {},
        token: 'chrm_user_test',
      }),
    ).rejects.toMatchObject({ kind: 'reserved_name', message: 'That name is reserved.' });
  });

  test('gives the source route more headroom than the default read timeout', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          (init as RequestInit).signal?.addEventListener('abort', () => {
            const error = new Error('This operation was aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }),
    );
    vi.useFakeTimers();

    const pending = runCommand({
      baseUrl: 'https://charm.ing',
      command: ['apps', 'source', 'app-1'],
      fetchImpl,
      options: {},
      token: 'chrm_app_test',
    });
    const assertion = expect(pending).rejects.toMatchObject({ kind: 'timeout', timeoutMs: 10_000 });
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
  });

  test('--timeout overrides the default for a request', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          (init as RequestInit).signal?.addEventListener('abort', () => {
            const error = new Error('This operation was aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }),
    );
    vi.useFakeTimers();

    const pending = runCommand({
      baseUrl: 'https://charm.ing',
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
      baseUrl: 'https://charm.ing',
      command: ['apps', 'describe', 'app-1'],
      fetchImpl,
      options: {},
      token: 'bld_user_test',
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://charm.ing/app/app-1/agent.json',
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
        baseUrl: 'https://charm.ing',
        command: ['api', 'request', 'delete-app'],
        fetchImpl,
        options: { param: ['id=app-1'] },
        token: 'bld_user_test',
      }),
    ).rejects.toThrow('Deletion requires --yes');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('requires explicit confirmation for a generated create that may overwrite an app', async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(
      runCommand({
        baseUrl: 'https://charm.ing',
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
        baseUrl: 'https://charm.ing',
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
        baseUrl: 'https://charm.ing',
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
        baseUrl: 'https://charm.ing',
        command: ['apps', 'delete', 'app-1'],
        options: { 'dry-run': true },
      }),
    ).resolves.toEqual({
      dryRun: true,
      method: 'DELETE',
      path: '/app/app-1',
    });
  });

  test('describes generated request and response schemas', async () => {
    const result = (await runCommand({
      baseUrl: 'https://charm.ing',
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
      baseUrl: 'https://charm.ing',
      command: ['api', 'request', 'patch-app-source'],
      fetchImpl,
      options: {
        body: '{"edits":[]}',
        param: ['id=app-1', 'If-Match="1"'],
      },
      token: 'bld_user_test',
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://charm.ing/app/app-1/source',
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
          baseUrl: 'https://charm.ing',
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
        baseUrl: 'https://charm.ing',
        command: ['api', 'request', operationId],
        fetchImpl,
        options: { ...(body === undefined ? {} : { body }), 'dry-run': true },
      }),
    ).resolves.toEqual(expect.objectContaining({ dryRun: true, method: 'POST' }));
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('saves a device-login token after a pending poll is approved', async () => {
    vi.useFakeTimers();
    const directory = await mkdtemp(join(tmpdir(), 'charming-auth-'));
    vi.stubEnv('XDG_CONFIG_HOME', directory);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(pairingStartResponse())
      .mockResolvedValueOnce(Response.json({ status: 'pending' }))
      .mockResolvedValueOnce(Response.json({ status: 'approved', token: 'chrm_user_saved-token' }));

    const login = runCommand({
      baseUrl: 'https://charm.ing',
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
      baseUrl: 'https://charm.ing',
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
        verification_url: 'https://charm.ing/pair',
      }),
    );

    await expect(
      runCommand({
        baseUrl: 'https://charm.ing',
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
      .mockResolvedValueOnce(pairingStartResponse('https://charm.ing', 600, 1, { [field]: value }));

    await expect(
      runCommand({
        baseUrl: 'https://charm.ing',
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
        pairingStartResponse('https://charm.ing', 600, 1, {
          verification_url_complete: 'https://charm.ing/pair?code=CHRM-ABC234',
        }),
      )
      .mockResolvedValueOnce(Response.json({ status: 'expired' }));

    const login = runCommand({
      baseUrl: 'https://charm.ing',
      command: ['auth', 'login'],
      fetchImpl,
      options: { 'no-open': true },
    });
    const rejection = expect(login).rejects.toThrow('Pairing code expired');
    await vi.advanceTimersByTimeAsync(1_000);

    await rejection;
    expect(stderr).toHaveBeenCalledWith(
      expect.stringContaining('https://charm.ing/pair?code=CHRM-ABC234'),
    );
  });

  test('stops device login at its deadline without a late poll', async () => {
    vi.useFakeTimers();
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(pairingStartResponse('https://charm.ing', 1, 5));

    const login = runCommand({
      baseUrl: 'https://charm.ing',
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
      .mockResolvedValueOnce(pairingStartResponse('https://charm.ing', 3_600, 3_600));

    const login = runCommand({
      baseUrl: 'https://charm.ing',
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
      baseUrl: 'https://charm.ing',
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
          baseUrl: 'https://charm.ing',
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
          'https://charm.ing|production-app': 'production-app-token',
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
        'https://charm.ing|production-app': 'production-app-token',
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
        baseUrl: 'https://charm.ing',
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
          verification_url: 'https://charm.ing/pair',
        },
      }),
    );

    try {
      const result = await runCommand({
        baseUrl: 'https://charm.ing',
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
            verification_url: 'https://charm.ing/pair',
          },
          tokenSaved: true,
        }),
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

async function appDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'charming-app-'));
  await writeFile(join(directory, 'module.js'), 'new module');
  await writeFile(join(directory, 'ui.js'), 'new ui');
  await writeFile(join(directory, 'styles.css'), 'new css');
  return directory;
}

function pairingStartResponse(
  origin = 'https://charm.ing',
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
