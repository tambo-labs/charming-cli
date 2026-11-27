import * as Effect from 'effect/Effect';

import { stringOption } from './args.js';
import { followSavedBuildEffect } from './builds.js';
import {
  type CommandContext,
  type SourceResponse,
  IDEMPOTENCY_KEY_PREVIEW,
  assertAppId,
  clientFor,
  idempotencyKey,
  packageFiles,
  requireConsent,
  requireUserTokenEffect,
  timeoutFor,
  validSource,
} from './commands.js';
import { writeAppBundleEffect, writeAppPackageEffect } from './files.js';
import { toPromise } from './io.js';

const LIST_TIMEOUT_MS = 5_000;
const REVISION_TIMEOUT_MS = 10_000;
const WHOLE_NUMBER_RE = /^[1-9][0-9]*$/;
const IF_MATCH_PREVIEW = '<"N" for the current revision from the History list>';

export const runHistoryEffect = Effect.fnUntraced(function* (
  action: string | undefined,
  positionals: string[],
  context: CommandContext,
): Effect.fn.Return<unknown, unknown> {
  if (action !== 'list' && action !== 'get' && action !== 'restore') {
    return yield* Effect.fail(new Error('Usage: charming apps history list|get|restore'));
  }
  const appId = positionals[0];
  if (!appId)
    return yield* Effect.fail(new Error(`Usage: charming apps history ${action} <APP_ID>`));
  assertAppId(appId);
  const base = `/api/v1/apps/${encodeURIComponent(appId)}/revisions`;

  if (action === 'list') {
    const query = new URLSearchParams();
    for (const name of ['limit', 'before']) {
      const value = stringOption(context.options, name);
      if (value === undefined) continue;
      if (!WHOLE_NUMBER_RE.test(value)) {
        return yield* Effect.fail(
          new Error(`--${name} must be a whole number from 1, got ${value}.`),
        );
      }
      query.set(name, value);
    }
    return yield* list(context, base, query);
  }

  const revision = revisionArgument(action, positionals[1]);
  if (action === 'get') return yield* get(context, appId, `${base}/${revision}`, revision);
  return yield* restore(context, base, revision);
});

export const runHistory = toPromise(runHistoryEffect);

const list = Effect.fnUntraced(function* (
  context: CommandContext,
  base: string,
  query: URLSearchParams,
) {
  const client = clientFor(context, yield* requireUserTokenEffect(context));
  const suffix = query.size > 0 ? `?${query}` : '';
  return (yield* client.requestEffect('GET', `${base}${suffix}`, {
    timeoutMs: timeoutFor(context, LIST_TIMEOUT_MS),
  })).data;
});

const get = Effect.fnUntraced(function* (
  context: CommandContext,
  appId: string,
  path: string,
  revision: string,
) {
  const client = clientFor(context, yield* requireUserTokenEffect(context));
  const data = (yield* client.requestEffect('GET', path, {
    timeoutMs: timeoutFor(context, REVISION_TIMEOUT_MS),
  })).data as SourceResponse;
  const out = stringOption(context.options, 'out');
  if (!out) return data;
  const files = packageFiles(data);
  if (files) yield* writeAppPackageEffect(out, files);
  else yield* writeAppBundleEffect(out, validSource(data));
  return { appId, revision: Number(revision), outputDirectory: out };
});

const restore = Effect.fnUntraced(function* (
  context: CommandContext,
  base: string,
  revision: string,
) {
  const path = `${base}/${revision}/restore`;
  requireConsent(context, 'Restoring a revision');
  if (context.options['dry-run'] === true) {
    return {
      dryRun: true,
      method: 'POST',
      path,
      headers: {
        'If-Match': IF_MATCH_PREVIEW,
        'Idempotency-Key': IDEMPOTENCY_KEY_PREVIEW,
      },
    };
  }
  const client = clientFor(context, yield* requireUserTokenEffect(context));
  const listing = (yield* client.requestEffect('GET', `${base}?limit=1`, {
    timeoutMs: timeoutFor(context, LIST_TIMEOUT_MS),
  })).data as { currentRevision?: unknown };
  if (typeof listing.currentRevision !== 'number') {
    return yield* Effect.fail(
      new Error('Charming returned an invalid History list. Run `charming doctor`.'),
    );
  }
  const restored = (yield* client.requestEffect('POST', path, {
    headers: {
      'If-Match': `"${listing.currentRevision}"`,
      'Idempotency-Key': idempotencyKey(),
    },
    timeoutMs: timeoutFor(context, REVISION_TIMEOUT_MS),
  })).data;
  return context.options.wait === true
    ? yield* followSavedBuildEffect(context, restored)
    : restored;
});

function revisionArgument(action: string, value: string | undefined): string {
  if (value === undefined)
    throw new Error(`Usage: charming apps history ${action} <APP_ID> <REVISION>`);
  if (!WHOLE_NUMBER_RE.test(value)) {
    throw new Error(
      `The revision must be a whole number from 1, got ${value}. Run \`charming apps history list <APP_ID>\` for the revisions.`,
    );
  }
  return value;
}
