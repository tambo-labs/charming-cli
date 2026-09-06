import { describe, expect, test, vi } from 'vitest';

import { fetchThatWaitsForAbort } from '../test-helpers.js';
import { CharmingClient, isOpenableUrl, TimeoutError } from './http.js';

describe('CharmingClient', () => {
  test('sends bearer auth and JSON bodies', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ ok: true }, { headers: { ETag: '"v2"' } }));
    const client = new CharmingClient({
      baseUrl: 'https://charm.ing/',
      token: 'bld_user_test',
      fetchImpl,
    });

    const result = await client.request('PUT', '/app/abc', {
      body: { module: 'export const manifest = {}' },
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://charm.ing/app/abc',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          Authorization: 'Bearer bld_user_test',
          'Content-Type': 'application/json',
        }),
      }),
    );
    expect(result).toEqual({ data: { ok: true }, etag: '"v2"', status: 200 });
  });

  test('turns Charming error envelopes into typed errors', async () => {
    const client = new CharmingClient({
      baseUrl: 'https://charm.ing',
      fetchImpl: async () =>
        Response.json(
          {
            ok: false,
            error: {
              kind: 'version_mismatch',
              message: 'Source changed.',
              recovery: { kind: 'refetch' },
            },
          },
          { status: 412 },
        ),
    });

    await expect(client.request('PATCH', '/app/abc/source')).rejects.toEqual(
      expect.objectContaining({
        kind: 'version_mismatch',
        message: 'Source changed.',
        status: 412,
      }),
    );
  });

  test('passes multipart bodies through without a content-type override', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ ok: true }));
    const form = new FormData();
    form.set('key', 'icon.txt');
    const client = new CharmingClient({ baseUrl: 'https://charm.ing', fetchImpl });

    await client.request('POST', '/app/abc/assets', { rawBody: form });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://charm.ing/app/abc/assets',
      expect.objectContaining({
        body: form,
        headers: { Accept: 'application/json' },
      }),
    );
  });

  test('refuses plain HTTP outside loopback', () => {
    expect(
      () => new CharmingClient({ baseUrl: 'http://preview.example', fetchImpl: vi.fn() }),
    ).toThrow('The API origin must use HTTPS');
  });

  test('falls back to a flat { reason, message } error envelope when there is no error.kind', async () => {
    const client = new CharmingClient({
      baseUrl: 'https://charm.ing',
      fetchImpl: async () =>
        Response.json(
          { ok: false, reason: 'reserved_name', message: 'That name is reserved.' },
          {
            status: 400,
          },
        ),
    });

    await expect(client.request('POST', '/account/apps/app-1/name')).rejects.toEqual(
      expect.objectContaining({
        kind: 'reserved_name',
        message: 'That name is reserved.',
        status: 400,
      }),
    );
  });

  test('turns an aborted request into a TimeoutError naming the timeout used', async () => {
    const client = new CharmingClient({
      baseUrl: 'https://charm.ing',
      fetchImpl: fetchThatWaitsForAbort,
    });

    const error = await client.request('GET', '/app/abc/source', { timeoutMs: 5 }).catch((e) => e);

    expect(error).toBeInstanceOf(TimeoutError);
    expect(error.kind).toBe('timeout');
    expect(error.message).toContain('5ms');
    expect(error.message).toContain('--timeout');
  });
});

describe('isOpenableUrl', () => {
  test('allows an HTTPS URL on the same origin as the API', () => {
    expect(isOpenableUrl('https://charm.ing/pair?code=1&label=ci', 'https://charm.ing')).toBe(true);
  });

  test('allows loopback HTTP on the same origin', () => {
    expect(isOpenableUrl('http://localhost:3000/pair', 'http://localhost:3000')).toBe(true);
  });

  test('refuses a URL on a different origin than the API', () => {
    expect(isOpenableUrl('https://attacker.example/pair', 'https://charm.ing')).toBe(false);
  });

  test('refuses a non-HTTPS scheme even on a matching hostname', () => {
    expect(isOpenableUrl('javascript:alert(1)', 'https://charm.ing')).toBe(false);
  });

  test('refuses plain HTTP outside loopback', () => {
    expect(isOpenableUrl('http://charm.ing/pair', 'http://charm.ing')).toBe(false);
  });

  test('refuses an unparsable URL', () => {
    expect(isOpenableUrl('not a url', 'https://charm.ing')).toBe(false);
  });
});
