import { Flags } from '@oclif/core';

import { type CommandContext, clientFor, requireUserToken } from './commands.js';
import { ApiError } from './http.js';

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
export async function followSavedBuild(context: CommandContext, saved: unknown): Promise<unknown> {
  const buildId =
    typeof saved === 'object' && saved !== null && 'buildId' in saved ? saved.buildId : undefined;
  if (typeof buildId !== 'string') return saved;
  process.stderr.write(`${JSON.stringify({ event: 'build_accepted', buildId })}\n`);
  return waitForBuild(context, buildId);
}

export async function waitForBuild(context: CommandContext, buildId: string): Promise<unknown> {
  const client = clientFor(context, await requireUserToken(context));
  const path = `/api/v1/app-builds/${encodeURIComponent(buildId)}`;
  let reported: unknown;
  let failures = 0;
  while (true) {
    let data: unknown;
    try {
      data = (
        await client.request('GET', path, { timeoutMs: context.timeoutMs ?? POLL_TIMEOUT_MS })
      ).data;
      failures = 0;
    } catch (error) {
      failures += 1;
      if (!isTransient(error) || failures >= MAX_POLL_FAILURES) throw error;
      await wait(DEFAULT_POLL_MS);
      continue;
    }
    if (typeof data !== 'object' || data === null) {
      throw new Error(
        `Charming returned an empty status for build ${buildId}. Check it with \`charming api request get-app-build --param buildId=${buildId}\`.`,
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
      throw new BuildNotPublishedError({ ...build, buildId });
    }
    if (pastDeadline(build)) {
      throw new Error(
        `Build ${buildId} is still ${String(build.state)} after its deadline (${String(build.deadline)}). Check it with \`charming api request get-app-build --param buildId=${buildId}\`.`,
      );
    }
    await wait(pollInterval(build));
  }
}

function isTransient(error: unknown): boolean {
  if (error instanceof ApiError) return error.status >= 500 || error.status === 429;
  return true;
}

function pastDeadline(build: Build): boolean {
  if (typeof build.deadline !== 'string') return false;
  const deadline = Date.parse(build.deadline);
  return Number.isFinite(deadline) && Date.now() > deadline + DEADLINE_GRACE_MS;
}

function pollInterval(build: Build): number {
  const seconds = build.retryAfterSeconds;
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) {
    return DEFAULT_POLL_MS;
  }
  return Math.min(seconds * 1_000, MAX_POLL_MS);
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
