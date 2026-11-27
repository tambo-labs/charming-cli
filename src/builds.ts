import { Flags } from '@oclif/core';
import * as Clock from 'effect/Clock';
import * as Effect from 'effect/Effect';
import * as Schedule from 'effect/Schedule';

import { type CommandContext, clientFor, requireUserTokenEffect } from './commands.js';
import { ApiError } from './http.js';
import { toPromise } from './io.js';

const TERMINAL_STATES = new Set(['published', 'failed', 'superseded', 'canceled', 'expired']);
const DEFAULT_POLL_MS = 2_000;
const MAX_POLL_MS = 15_000;
const DEADLINE_GRACE_MS = 30_000;
const POLL_TIMEOUT_MS = 5_000;
const MAX_POLL_FAILURES = 3;

export const waitFlag = Flags.boolean({
  description:
    'With --files, wait for the build to finish and print it. A build that ends without publishing exits with code 6.',
});

export function requireFilesForWait(flags: { files?: string; wait?: boolean }): void {
  if (flags.wait && !flags.files) {
    throw new Error('--wait follows a package build. Add --files <directory>.');
  }
}

type Build = {
  buildId?: unknown;
  deadline?: unknown;
  retryAfterSeconds?: unknown;
  state?: unknown;
};

/** A build that reached a final state other than `published`. */
export class BuildNotPublishedError extends Error {
  readonly build: unknown;
  readonly kind: string;

  constructor(build: Build) {
    const state = String(build.state);
    super(`Build ${String(build.buildId)} ${state} without publishing.`);
    this.name = 'BuildNotPublishedError';
    this.build = build;
    this.kind = `build_${state}`;
  }
}

/** Follows the build a package save started; any other result passes through. */
export const followSavedBuildEffect = Effect.fnUntraced(function* (
  context: CommandContext,
  saved: unknown,
) {
  const buildId =
    typeof saved === 'object' && saved !== null && 'buildId' in saved ? saved.buildId : undefined;
  if (typeof buildId !== 'string') return saved;
  process.stderr.write(`${JSON.stringify({ event: 'build_accepted', buildId })}\n`);
  return yield* pollBuild(context, buildId);
});

export const followSavedBuild = toPromise(followSavedBuildEffect);

export function waitForBuild(context: CommandContext, buildId: string): Promise<unknown> {
  return Effect.runPromise(pollBuild(context, buildId));
}

export const pollBuild = Effect.fnUntraced(function* (context: CommandContext, buildId: string) {
  const token = yield* requireUserTokenEffect(context);
  const client = clientFor(context, token);
  const path = `/api/v1/app-builds/${encodeURIComponent(buildId)}`;
  const poll = client
    .requestEffect('GET', path, { timeoutMs: context.timeoutMs ?? POLL_TIMEOUT_MS })
    .pipe(
      Effect.retry({
        while: isTransient,
        times: MAX_POLL_FAILURES - 1,
        schedule: Schedule.spaced(DEFAULT_POLL_MS),
      }),
    );
  let reported: unknown;
  while (true) {
    const { data } = yield* poll;
    if (typeof data !== 'object' || data === null) {
      return yield* Effect.fail(
        new Error(
          `Charming returned an empty status for build ${buildId}. Check it with \`charming api request get-app-build --param buildId=${buildId}\`.`,
        ),
      );
    }
    const build: Build = data;
    if (build.state !== reported) {
      reported = build.state;
      process.stderr.write(
        `${JSON.stringify({ event: 'build_state', buildId, state: build.state })}\n`,
      );
    }
    if (build.state === 'published') return build;
    if (typeof build.state === 'string' && TERMINAL_STATES.has(build.state)) {
      return yield* Effect.fail(new BuildNotPublishedError({ ...build, buildId }));
    }
    if (pastDeadline(build, yield* Clock.currentTimeMillis)) {
      return yield* Effect.fail(
        new Error(
          `Build ${buildId} is still ${String(build.state)} after its deadline (${String(build.deadline)}). Check it with \`charming api request get-app-build --param buildId=${buildId}\`.`,
        ),
      );
    }
    yield* Effect.sleep(pollInterval(build));
  }
});

function isTransient(error: unknown): boolean {
  if (error instanceof ApiError) return error.status >= 500 || error.status === 429;
  return true;
}

function pastDeadline(build: Build, now: number): boolean {
  if (typeof build.deadline !== 'string') return false;
  const deadline = Date.parse(build.deadline);
  return Number.isFinite(deadline) && now > deadline + DEADLINE_GRACE_MS;
}

function pollInterval(build: Build): number {
  const seconds = build.retryAfterSeconds;
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) {
    return DEFAULT_POLL_MS;
  }
  return Math.min(seconds * 1_000, MAX_POLL_MS);
}
