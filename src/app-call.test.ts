import { captureOutput } from '@oclif/test';
import { describe, expect, test, vi } from 'vitest';

import { fetchThatWaitsForAbort } from '../test-helpers.js';
import { main } from './cli.js';
import { runApi, runApps, type CommandContext } from './commands.js';

const APP_ID = '00000000-0000-4000-8000-000000000001';
const APP_PATH = `/app/${APP_ID}`;

function route(op: string, method: string, path: string, destructive = false) {
  return { op, method, path, destructive, discoveredFrom: ['routes_export'] };
}

const OPERATIONS = [
  route('read', 'GET', '/api/v2/items'),
  route('add', 'POST', '/api/add'),
  route('rename', 'PUT', '/api/items/rename'),
  route('touch', 'PATCH', '/api/items/touch'),
  route('remove', 'DELETE', '/api/remove'),
  route('reset', 'POST', '/api/reset', true),
  route('purgeRead', 'GET', '/api/purge-read', true),
];

function fixture(options: CommandContext['options'] = {}) {
  const fetchImpl = vi
    .fn<typeof fetch>()
    .mockImplementation(async (_url, init) =>
      fetchImpl.mock.calls.length === 1
        ? Response.json({ operations: OPERATIONS })
        : Response.json({ ok: true, method: init?.method }),
    );
  const context: CommandContext = {
    baseUrl: 'https://charming.test',
    token: 'chrm_user_fixture',
    options,
    fetchImpl,
  };
  return { context, fetchImpl };
}

function call(entry: 'apps' | 'api', context: CommandContext, operation: string, input?: unknown) {
  const encoded = input === undefined ? undefined : JSON.stringify(input);
  return entry === 'apps'
    ? runApps('call', [APP_ID, operation], {
        ...context,
        options: { ...context.options, ...(encoded === undefined ? {} : { input: encoded }) },
      })
    : runApi('request', ['call-app-operation'], {
        ...context,
        options: {
          ...context.options,
          param: [`id=${APP_ID}`, `operation=${operation}`],
          ...(encoded === undefined ? {} : { body: encoded }),
        },
      });
}

function sent(fetchImpl: ReturnType<typeof fixture>['fetchImpl'], index: number) {
  const call = fetchImpl.mock.calls[index];
  if (!call) throw new Error(`fetch was not called ${index + 1} times`);
  const [url, init] = call;
  const body = init?.body;
  return {
    url: url instanceof Request ? url.url : url.toString(),
    method: init?.method,
    body: typeof body === 'string' ? (JSON.parse(body) as unknown) : body,
  };
}

describe.each(['apps', 'api'] as const)('%s call dispatch', (entry) => {
  test.each([
    ['add', 'POST', '/api/add'],
    ['rename', 'PUT', '/api/items/rename'],
    ['touch', 'PATCH', '/api/items/touch'],
    ['remove', 'DELETE', '/api/remove'],
    ['reset', 'POST', '/api/reset'],
  ])('sends %s with its declared %s method and path', async (operation, method, path) => {
    const { context, fetchImpl } = fixture({ yes: true });

    await call(entry, context, operation, { id: 'item-1' });

    expect(sent(fetchImpl, 0)).toMatchObject({
      url: `https://charming.test${APP_PATH}/agent.json`,
      method: 'GET',
    });
    expect(sent(fetchImpl, 1)).toEqual({
      url: `https://charming.test${APP_PATH}${path}`,
      method,
      body: { id: 'item-1' },
    });
  });

  test('sends a declared GET with its input as repeated query values', async () => {
    const { context, fetchImpl } = fixture();

    await call(entry, context, 'read', { text: 'hi', tags: ['a', 'b'], limit: 2 });

    expect(sent(fetchImpl, 1)).toEqual({
      url: `https://charming.test${APP_PATH}/api/v2/items?text=hi&tags=a&tags=b&limit=2`,
      method: 'GET',
      body: undefined,
    });
  });

  test.each(['remove', 'reset', 'purgeRead'])(
    'refuses destructive %s without --yes after discovery only',
    async (operation) => {
      const { context, fetchImpl } = fixture();

      await expect(call(entry, context, operation, {})).rejects.toThrow(
        `Destructive operation \`${operation}\` requires --yes. Use --dry-run to preview it.`,
      );
      expect(fetchImpl).toHaveBeenCalledOnce();
    },
  );

  test('previews a destructive operation without --yes or calling it', async () => {
    const { context, fetchImpl } = fixture({ 'dry-run': true });

    const preview = await call(entry, context, 'remove', { id: 'item-1' });

    expect(preview).toEqual({
      dryRun: true,
      method: 'DELETE',
      path: `${APP_PATH}/api/remove`,
      body: { id: 'item-1' },
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  test('redacts credential query values in a GET preview but sends them live', async () => {
    const input = {
      token: 'private-token',
      access_token: 'private-access',
      authorization: 'private-auth',
      device_code: 'private-device',
      text: 'visible',
      note: 'chrm_user_leaked1234',
    };
    const preview = fixture({ 'dry-run': true });

    expect(await call(entry, preview.context, 'read', input)).toEqual({
      dryRun: true,
      method: 'GET',
      path: `${APP_PATH}/api/v2/items?token=%5Bredacted%5D&access_token=%5Bredacted%5D&authorization=%5Bredacted%5D&device_code=%5Bredacted%5D&text=visible&note=%5Bredacted%5D`,
    });

    const live = fixture();
    await call(entry, live.context, 'read', input);
    expect(sent(live.fetchImpl, 1).url).toBe(
      `https://charming.test${APP_PATH}/api/v2/items?token=private-token&access_token=private-access&authorization=private-auth&device_code=private-device&text=visible&note=chrm_user_leaked1234`,
    );
  });

  test('redacts credential fields in a non-GET preview body', async () => {
    const { context } = fixture({ 'dry-run': true });

    expect(await call(entry, context, 'add', { token: 'private-token', title: 'Milk' })).toEqual({
      dryRun: true,
      method: 'POST',
      path: `${APP_PATH}/api/add`,
      body: { token: '[redacted]', title: 'Milk' },
    });
  });

  test('POSTs an undeclared operation without --yes when the app declares no routes', async () => {
    const { context, fetchImpl } = fixture();
    fetchImpl.mockResolvedValueOnce(Response.json({ operations: [] }));

    await call(entry, context, 'legacy', { id: 'item-1' });

    expect(sent(fetchImpl, 1)).toEqual({
      url: `https://charming.test${APP_PATH}/api/legacy`,
      method: 'POST',
      body: { id: 'item-1' },
    });
  });

  test('bounds discovery and the operation with their own timeouts and honors --timeout for both', async () => {
    vi.useFakeTimers();
    try {
      for (const [phase, override, expected] of [
        ['discovery', undefined, 2_000],
        ['discovery', 17, 17],
        ['operation', undefined, 30_000],
        ['operation', 17, 17],
      ] as const) {
        const { context, fetchImpl } = fixture();
        fetchImpl.mockImplementation(fetchThatWaitsForAbort);
        if (phase === 'operation') {
          fetchImpl.mockResolvedValueOnce(Response.json({ operations: OPERATIONS }));
        }
        const pending = call(entry, { ...context, timeoutMs: override }, 'add', {});
        const assertion = expect(pending).rejects.toMatchObject({
          kind: 'timeout',
          timeoutMs: expected,
        });
        await vi.advanceTimersByTimeAsync(expected);
        await assertion;
        expect(fetchImpl).toHaveBeenCalledTimes(phase === 'discovery' ? 1 : 2);
      }
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('api request call-app-operation', () => {
  test('forwards --header to discovery and the operation', async () => {
    const { context, fetchImpl } = fixture({ header: ['X-Request-Tag=tag-1'] });

    await call('api', context, 'add', {});

    for (const index of [0, 1]) {
      expect(new Headers(fetchImpl.mock.calls[index]?.[1]?.headers).get('X-Request-Tag')).toBe(
        'tag-1',
      );
    }
  });

  test('previews the declared method instead of the catalog POST', async () => {
    const { context, fetchImpl } = fixture({ 'dry-run': true });

    expect(await call('api', context, 'read', { text: 'hi' })).toEqual({
      dryRun: true,
      method: 'GET',
      path: `${APP_PATH}/api/v2/items?text=hi`,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});

test('the apps call command accepts --yes for a destructive operation', async () => {
  const { fetchImpl } = fixture();

  const result = await captureOutput(() =>
    main(
      [
        'apps',
        'call',
        APP_ID,
        'remove',
        '--yes',
        '--token',
        'chrm_user_fixture',
        '--base-url',
        'https://charming.test',
      ],
      {
        fetchImpl,
      },
    ),
  );

  expect(result.result).toBe(0);
  expect(sent(fetchImpl, 1)).toMatchObject({
    url: `https://charming.test${APP_PATH}/api/remove`,
    method: 'DELETE',
  });
});

test('the api request command accepts --yes for a destructive app operation', async () => {
  const { fetchImpl } = fixture();

  const result = await captureOutput(() =>
    main(
      [
        'api',
        'request',
        'call-app-operation',
        '--param',
        `id=${APP_ID}`,
        '--param',
        'operation=remove',
        '--yes',
        '--token',
        'chrm_user_fixture',
        '--base-url',
        'https://charming.test',
      ],
      { fetchImpl },
    ),
  );

  expect(result.result).toBe(0);
  expect(sent(fetchImpl, 1)).toEqual({
    url: `https://charming.test${APP_PATH}/api/remove`,
    method: 'DELETE',
    body: undefined,
  });
});
