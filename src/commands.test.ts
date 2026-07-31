import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, test, vi } from 'vitest';

import { runCommand } from './commands.js';

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

  test('rejects unknown options before making a request', async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(
      runCommand({
        baseUrl: 'https://charm.ing',
        command: ['apps', 'list'],
        fetchImpl,
        options: { limt: '1' },
        token: 'bld_user_test',
      }),
    ).rejects.toThrow('Unknown option --limt');
    expect(fetchImpl).not.toHaveBeenCalled();
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

  test('redacts credentials from generated API output', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ token: 'bld_user_secret', ok: true }));

    const result = await runCommand({
      baseUrl: 'https://charm.ing',
      command: ['api', 'request', 'create-token'],
      fetchImpl,
      options: {},
      token: 'bld_user_caller',
    });

    expect(result).toEqual({ ok: true, token: '[redacted]' });
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
