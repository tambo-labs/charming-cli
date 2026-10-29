import { afterEach, beforeEach, describe, expect, test, vi, type MockInstance } from 'vitest';

import { directoryOutsideAnyProject, fetchThatWaitsForAbort } from '../test-helpers.js';
import { BuildNotPublishedError, followSavedBuild, waitForBuild } from './builds.js';
import { main } from './cli.js';
import { type CommandContext } from './commands.js';
import { resolveSession } from './config.js';
import { ApiError } from './http.js';

const ORIGIN = 'https://charming.test';

function build(state: string, extra: Record<string, unknown> = {}) {
  return {
    ok: true,
    buildId: 'build_1',
    state,
    deadline: '2026-10-29T10:10:00.000Z',
    ...extra,
  };
}

async function context(fetchImpl: typeof fetch): Promise<CommandContext> {
  return {
    fetchImpl,
    options: {},
    session: await resolveSession({
      baseUrl: ORIGIN,
      cwd: await directoryOutsideAnyProject(),
      env: { ...process.env, CHARMING_PROFILE: '' },
      purpose: 'use',
      token: 'chrm_user_test',
    }),
  };
}

function progressEvents(stderr: { mock: { calls: unknown[][] } }) {
  return stderr.mock.calls
    .map(([chunk]) => String(chunk))
    .flatMap((chunk) => chunk.split('\n').filter(Boolean))
    .map((line) => JSON.parse(line));
}

let stderr: MockInstance<typeof process.stderr.write>;

beforeEach(() => {
  stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('builds wait', () => {
  test('polls until the build publishes, waiting what the server asks and reporting each state', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-29T10:00:00.000Z') });
    const responses = [
      build('queued', { retryAfterSeconds: 3 }),
      build('queued', { retryAfterSeconds: 3 }),
      build('building', { retryAfterSeconds: 5 }),
      build('published', { appId: 'app-1', revision: 4, url: 'https://charming.test/u/app' }),
    ];
    const fetchImpl = vi.fn<typeof fetch>(async () => Response.json(responses.shift()));

    const waited = waitForBuild(await context(fetchImpl), 'build_1');
    await vi.advanceTimersByTimeAsync(2_999);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(5_000);

    await expect(waited).resolves.toMatchObject({ state: 'published', revision: 4 });
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe(`${ORIGIN}/api/v1/app-builds/build_1`);
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer chrm_user_test');
    expect(progressEvents(stderr)).toEqual([
      { event: 'build_state', buildId: 'build_1', state: 'queued' },
      { event: 'build_state', buildId: 'build_1', state: 'building' },
      { event: 'build_state', buildId: 'build_1', state: 'published' },
    ]);
  });

  test('returns at once for a build that already finished', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => Response.json(build('published')));

    await expect(waitForBuild(await context(fetchImpl), 'build_1')).resolves.toMatchObject({
      state: 'published',
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  test.each(['failed', 'superseded', 'canceled', 'expired'])(
    'throws with the finished build when it ends %s',
    async (state) => {
      const finished = build(state, { error: { kind: 'file_missing', message: 'No such file' } });
      const fetchImpl = vi.fn<typeof fetch>(async () => Response.json(finished));

      const error = await waitForBuild(await context(fetchImpl), 'build_1').catch(
        (caught: unknown) => caught,
      );

      expect(error).toBeInstanceOf(BuildNotPublishedError);
      expect(error).toMatchObject({ build: finished, kind: `build_${state}` });
      expect(fetchImpl).toHaveBeenCalledOnce();
    },
  );

  test('keeps waiting through transient poll failures', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-29T10:00:00.000Z') });
    const replies = [
      () =>
        Response.json({ error: { kind: 'unavailable', message: 'Bad gateway' } }, { status: 502 }),
      () => Response.json(build('building')),
      () =>
        Response.json({ error: { kind: 'unavailable', message: 'Bad gateway' } }, { status: 503 }),
      () => Response.json(build('published')),
    ];
    const fetchImpl = vi.fn<typeof fetch>(async () => replies.shift()!());

    const waited = waitForBuild(await context(fetchImpl), 'build_1');
    await vi.advanceTimersByTimeAsync(20_000);

    await expect(waited).resolves.toMatchObject({ state: 'published' });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  test('retries a dropped connection and a request that times out', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-29T10:00:00.000Z') });
    const attempts = [
      () => Promise.reject(new TypeError('fetch failed')),
      (init?: RequestInit) => fetchThatWaitsForAbort('', init),
      () => Promise.resolve(Response.json(build('published'))),
    ];
    const fetchImpl = vi.fn<typeof fetch>(async (_input, init) => attempts.shift()!(init));
    const configured = await context(fetchImpl);
    configured.timeoutMs = 1_000;

    const waited = waitForBuild(configured, 'build_1');
    await vi.advanceTimersByTimeAsync(10_000);

    await expect(waited).resolves.toMatchObject({ state: 'published' });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  test('rejects an empty status body with a clear error', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('', { status: 200 }));

    await expect(waitForBuild(await context(fetchImpl), 'build_1')).rejects.toThrow(
      'empty status for build build_1',
    );
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  test('exits 2 when a build is still running long past its deadline', async () => {
    const stuck = build('building', { deadline: '2020-01-01T00:00:00.000Z' });
    const fetchImpl = vi.fn<typeof fetch>(async () => Response.json(stuck));

    const code = await main(
      ['builds', 'wait', 'build_1', '--base-url', ORIGIN, '--token', 'chrm_user_test'],
      { fetchImpl },
    );

    expect(code).toBe(2);
    expect(String(stderr.mock.calls.at(-1)?.[0])).toContain('after its deadline');
  });

  test('passes a save that started no build through unchanged', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const saved = { id: 'app-1', revision: 3 };

    await expect(followSavedBuild(await context(fetchImpl), saved)).resolves.toBe(saved);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('stops after repeated poll failures and on a client error', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-29T10:00:00.000Z') });
    const unavailable = vi.fn<typeof fetch>(async () =>
      Response.json({ error: { kind: 'unavailable', message: 'Bad gateway' } }, { status: 502 }),
    );
    const failing = waitForBuild(await context(unavailable), 'build_1').catch(
      (caught: unknown) => caught,
    );
    await vi.advanceTimersByTimeAsync(20_000);
    await expect(failing).resolves.toMatchObject({ status: 502 });
    expect(unavailable).toHaveBeenCalledTimes(3);

    const missing = vi.fn<typeof fetch>(async () =>
      Response.json({ error: { kind: 'not_found', message: 'No such build' } }, { status: 404 }),
    );
    const error = await waitForBuild(await context(missing), 'build_1').catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(missing).toHaveBeenCalledOnce();
  });

  test('gives up once a build is still running past its deadline', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-29T10:09:00.000Z') });
    const fetchImpl = vi.fn<typeof fetch>(async () => Response.json(build('building')));

    const waited = waitForBuild(await context(fetchImpl), 'build_1').catch(
      (caught: unknown) => caught,
    );
    await vi.advanceTimersByTimeAsync(5 * 60_000);

    await expect(waited).resolves.toMatchObject({
      message: expect.stringContaining('still building after its deadline'),
    });
    expect(fetchImpl.mock.calls.length).toBeGreaterThan(1);
  });

  test('reports a failed build as JSON on stderr with its own exit code', async () => {
    const failed = build('failed', {
      error: { kind: 'dependency_unresolved', message: 'Cannot resolve' },
    });
    const fetchImpl = vi.fn<typeof fetch>(async () => Response.json(failed));
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const code = await main(
      ['builds', 'wait', 'build_1', '--base-url', ORIGIN, '--token', 'chrm_user_test'],
      { fetchImpl },
    );

    expect(code).toBe(6);
    expect(stdout).not.toHaveBeenCalled();
    const envelope = JSON.parse(String(stderr.mock.calls.at(-1)?.[0]));
    expect(envelope).toMatchObject({
      ok: false,
      error: { kind: 'build_failed', message: expect.stringContaining('failed'), build: failed },
    });
  });
});
