import { afterEach, describe, expect, test, vi } from 'vitest';

import { main } from './cli.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('main', () => {
  test('lists every mutation dry-run flag in help', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await expect(main(['--help'])).resolves.toBe(0);

    const output = stdout.mock.calls.flat().join('');
    expect(output).toContain('apps create [DIR]');
    expect(output).toContain('apps update <APP_ID>');
    expect(output).toContain('apps call <APP_ID>');
    expect(output).toContain('apps delete <APP_ID>');
    expect(output.match(/\[--dry-run\]/g)).toHaveLength(5);
  });

  test('redacts secrets embedded in API errors', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
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

    await expect(
      main(['apps', 'list', '--token', 'chrm_user_caller'], { fetchImpl }),
    ).resolves.toBe(5);

    const output = stderr.mock.calls.flat().join('');
    expect(output).not.toContain('chrm_user_secret');
    expect(output).not.toContain('chrm_app_nested');
    expect(output).toContain('[redacted]');
    expect(stdout).not.toHaveBeenCalled();
  });
});
