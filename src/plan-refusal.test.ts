import { describe, expect, it } from 'vitest';

import { ApiError } from './http.js';

const refusalBody = {
  ok: false,
  error: {
    kind: 'routine_limit_exceeded',
    message: 'This app already has 3 Routines, the per-app limit.',
    plan: 'free',
    limit: 'routines_per_app',
    max: 3,
    upgradeUrl: 'https://charming.test/ada/~/settings/billing',
  },
};

describe('ApiError on a plan refusal', () => {
  it('keeps the refusal beside the message, so the link survives to the caller', () => {
    expect(new ApiError(429, refusalBody).refusal).toEqual({
      plan: 'free',
      limit: 'routines_per_app',
      max: 3,
      upgradeUrl: 'https://charming.test/ada/~/settings/billing',
    });
  });

  it('has no refusal on an ordinary failure', () => {
    expect(
      new ApiError(404, { ok: false, error: { kind: 'not_found', message: 'gone' } }).refusal,
    ).toBeUndefined();
  });

  it('ignores a plan that is not a tier we publish', () => {
    expect(
      new ApiError(429, { ok: false, error: { kind: 'x', plan: 'platinum' } }).refusal,
    ).toBeUndefined();
  });
});
