import { captureOutput } from '@oclif/test';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { main } from './cli.js';

describe('oclif command routing', () => {
  afterEach(() => vi.restoreAllMocks());
  test('parses app list flags and prints the fetched result', async () => {
    const stdout = vi.spyOn(console, 'log').mockImplementation(() => {});
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ apps: [{ id: 'app-7', name: 'Notes' }] }));
    const output = await captureOutput(() =>
      main(
        [
          'apps',
          'list',
          '--base-url',
          'https://cli.example',
          '--token',
          'chrm_user_test',
          '--limit',
          '10',
        ],
        { fetchImpl },
      ),
    );
    expect(output.result).toBe(0);
    expect(output.stderr).toBe('');
    expect(JSON.parse(stdout.mock.calls.map(([line]) => line).join('\n'))).toEqual({
      apps: [{ id: 'app-7', name: 'Notes' }],
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://cli.example/app?limit=10');
    expect(init?.method).toBe('GET');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer chrm_user_test');
  });

  test('parses API mutation parameters and prints the response', async () => {
    const stdout = vi.spyOn(console, 'log').mockImplementation(() => {});
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ id: 'app-7', public: true }));
    const output = await captureOutput(() =>
      main(
        [
          'api',
          'request',
          'set-app-public',
          '--param',
          'id=app-7',
          '--body',
          '{"public":true}',
          '--base-url',
          'https://cli.example',
          '--token',
          'chrm_user_test',
          '--yes',
        ],
        { fetchImpl },
      ),
    );
    expect(output.result).toBe(0);
    expect(output.stderr).toBe('');
    expect(JSON.parse(stdout.mock.calls.map(([line]) => line).join('\n'))).toEqual({
      id: 'app-7',
      public: true,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://cli.example/app/app-7/public');
    expect(init?.method).toBe('PUT');
    expect(JSON.parse(typeof init?.body === 'string' ? init.body : 'null')).toEqual({
      public: true,
    });
  });
});
