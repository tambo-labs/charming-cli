import { execFile } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { captureOutput, runCommand as runOclifCommand } from '@oclif/test';
import { describe, expect, test, vi } from 'vitest';

import { main } from './cli.js';

describe('main', () => {
  test('renders generated help for a mutation command', async () => {
    const dispatched = await runOclifCommand('agent-context', process.cwd(), { stripAnsi: true });
    const output = await runBinary(['apps', 'create', '--help']);

    expect(dispatched.error).toBeUndefined();
    expect(output.stdout).toContain('$ charming apps create [DIRECTORY]');
    expect(output.stdout).toContain('--dry-run');
    expect(output.stdout).toContain('--yes');
    expect(output.stderr).toBe('');
  });

  test('redacts secrets embedded in API errors', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        {
          error: {
            kind: 'upstream_error',
            message: 'Rejected Bearer chrm_user_secret-value',
            recovery: { token: 'chrm_app_nested-secret' },
          },
        },
        { status: 500 },
      ),
    );

    const result = await captureOutput(() =>
      main(['apps', 'list', '--token', 'chrm_user_caller'], { fetchImpl }),
    );

    expect(result.result).toBe(5);
    expect(result.stderr).not.toContain('chrm_user_secret');
    expect(result.stderr).not.toContain('chrm_app_nested');
    expect(result.stderr).toContain('[redacted]');
    expect(result.stdout).toBe('');
  });

  test('accepts the existing prefix-positioned global flags', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ apps: [] }));

    await expect(
      main(
        ['--base-url', 'https://preview.example', '--token', 'chrm_user_caller', 'apps', 'list'],
        { fetchImpl },
      ),
    ).resolves.toBe(0);

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://preview.example/app',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  test('accepts equals-form repeated request flags', async () => {
    await expect(
      main([
        'api',
        'request',
        'set-app-public',
        '--param=id=app-1',
        '--body={"public":true}',
        '--dry-run',
      ]),
    ).resolves.toBe(0);
  });

  test('apps call --output compact prints single-line JSON', async () => {
    const output = await runBinary([
      'apps',
      'call',
      'app-1',
      'echo',
      '--input',
      '{"a":1}',
      '--output',
      'compact',
      '--dry-run',
    ]);

    expect(output.stdout.trim()).toBe(
      '{"dryRun":true,"method":"POST","path":"/app/app-1/api/echo","body":{"a":1}}',
    );
    expect(output.stdout).not.toContain('\n  ');
  });

  test('apps call without --output pretty-prints', async () => {
    const output = await runBinary(['apps', 'call', 'app-1', 'echo', '--dry-run']);

    expect(output.stdout).toContain('\n  "dryRun": true');
  });

  test('apps call replaces an oversized response with a truncated wrapper', async () => {
    await withJsonServer({ data: 'x'.repeat(300_000) }, async (baseUrl) => {
      const output = await runBinary([
        'apps',
        'call',
        'app-1',
        'echo',
        '--base-url',
        baseUrl,
        '--token',
        'chrm_user_test',
      ]);

      const parsed = JSON.parse(output.stdout);
      expect(parsed.truncated).toBe(true);
      expect(parsed.originalLength).toBeGreaterThan(200_000);
      expect(parsed.preview.length).toBe(200_000);
      expect(parsed.hint).toContain('--output compact');
    });
  });

  test('apps call prints raw output at exactly the truncation boundary', async () => {
    // Pick n so JSON.stringify({data:'x'.repeat(n)}, null, 2) — the pretty
    // format `apps call` uses by default — lands exactly on
    // MAX_OUTPUT_CHARS (200_000).
    const overhead = JSON.stringify({ data: '' }, null, 2).length;
    const filler = 'x'.repeat(200_000 - overhead);

    await withJsonServer({ data: filler }, async (baseUrl) => {
      const output = await runBinary([
        'apps',
        'call',
        'app-1',
        'echo',
        '--base-url',
        baseUrl,
        '--token',
        'chrm_user_test',
      ]);

      expect(output.stdout.trim().length).toBe(200_000);
      const parsed = JSON.parse(output.stdout);
      expect(parsed.truncated).toBeUndefined();
      expect(parsed.data).toBe(filler);
    });
  });

  test('apps call prints the truncated wrapper for output one char past the boundary', async () => {
    const overhead = JSON.stringify({ data: '' }, null, 2).length;
    const filler = 'x'.repeat(200_000 - overhead + 1);

    await withJsonServer({ data: filler }, async (baseUrl) => {
      const output = await runBinary([
        'apps',
        'call',
        'app-1',
        'echo',
        '--base-url',
        baseUrl,
        '--token',
        'chrm_user_test',
      ]);

      const parsed = JSON.parse(output.stdout);
      expect(parsed.truncated).toBe(true);
    });
  });

  test('apps call --output compact keeps the truncated wrapper on a single line', async () => {
    await withJsonServer({ data: 'x'.repeat(300_000) }, async (baseUrl) => {
      const output = await runBinary([
        'apps',
        'call',
        'app-1',
        'echo',
        '--output',
        'compact',
        '--base-url',
        baseUrl,
        '--token',
        'chrm_user_test',
      ]);

      expect(output.stdout).not.toContain('\n  ');
      expect(output.stdout.trimEnd().split('\n')).toHaveLength(1);
      const parsed = JSON.parse(output.stdout);
      expect(parsed.truncated).toBe(true);
      expect(parsed.hint).toContain('--output compact');
    });
  });

  test('rejects a --timeout that is not a positive number', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const result = await captureOutput(() =>
      main(['apps', 'list', '--timeout', 'soon', '--token', 'chrm_user_test'], { fetchImpl }),
    );

    expect(result.result).toBe(2);
    expect(result.stderr).toContain('--timeout must be a positive number');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('maps an aborted request to the timeout error kind and exit code', async () => {
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

    const result = await captureOutput(() =>
      main(['apps', 'list', '--timeout', '5', '--token', 'chrm_user_test'], { fetchImpl }),
    );

    expect(result.result).toBe(8);
    expect(result.stderr).toContain('"kind": "timeout"');
    expect(result.stderr).toContain('5ms');
    expect(result.stderr).toContain('--timeout');
  });

  test('rejects an unknown flag before making a request', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const result = await captureOutput(() =>
      main(['apps', 'list', '--limt', '1', '--token', 'chrm_user_caller'], { fetchImpl }),
    );

    expect(result.result).toBe(2);
    expect(result.stderr).toContain('Unknown option --limt');
    expect(result.stdout).toBe('');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('runs every discovered command through the compiled CLI', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'charming-cli-command-'));
    await writeFile(join(directory, 'module.js'), 'export default {};');
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(() =>
      Promise.resolve(
        Response.json({
          info: { version: '1.0.0' },
          openapi: '3.1.0',
          paths: {},
          source: { module: 'export default {};' },
        }),
      ),
    );

    for (const [argv, expectedExitCode] of [
      [['agent-context'], 0],
      [['api', 'list'], 0],
      [['api', 'describe', 'list-apps'], 0],
      [
        [
          'api',
          'request',
          'set-app-public',
          '--param=id=app-1',
          '--body={"public":true}',
          '--dry-run',
        ],
        0,
      ],
      [['apps', 'list', '--token', 'chrm_user_test'], 0],
      [['apps', 'create', directory, '--description', 'A test app.', '--dry-run'], 0],
      [['apps', 'describe', 'app-1', '--token', 'chrm_app_test'], 0],
      [['apps', 'source', 'app-1', '--token', 'chrm_app_test'], 0],
      [['apps', 'update', 'app-1', directory, '--dry-run'], 0],
      [['apps', 'call', 'app-1', 'echo', '--dry-run'], 0],
      [['apps', 'call', 'app-1', 'echo', '--output', 'compact', '--dry-run'], 0],
      [['apps', 'delete', 'app-1', '--dry-run'], 0],
      [['apps', 'rename', 'app-1', 'new-name', '--dry-run'], 0],
      [['auth', 'login', '--no-open'], 2],
      [['auth', 'logout', '--token', 'chrm_user_test'], 2],
      [['auth', 'status', '--token', 'chrm_user_test'], 0],
      [['doctor'], 0],
    ] as const) {
      await expect(main([...argv], { fetchImpl })).resolves.toBe(expectedExitCode);
    }

    expect(fetchImpl).toHaveBeenCalled();
  });
});

async function runBinary(args: string[]): Promise<{ stderr: string; stdout: string }> {
  return promisify(execFile)(process.execPath, ['bin/run.js', ...args], { cwd: process.cwd() });
}

/** Serves `body` as JSON on a loopback port for the duration of `use`, then shuts down. */
async function withJsonServer(
  body: unknown,
  use: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server: Server = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(body));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address() as AddressInfo;
    await use(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}
