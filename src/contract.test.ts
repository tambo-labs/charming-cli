import { describe, expect, test } from 'vitest';

import { findOperation, operations } from './contract.js';

describe('generated operation catalog', () => {
  test('contains the core app and pairing operations', () => {
    expect(
      [
        'create-app',
        'list-apps',
        'get-app-source',
        'update-app',
        'delete-app',
        'start-pairing',
      ].every((id) => findOperation(id)),
    ).toBe(true);
  });

  test('has unique operation ids', () => {
    expect(new Set(operations.map((operation) => operation.id)).size).toBe(operations.length);
  });

  test('preserves operation count, timeouts, event auth, and the closed create schema', () => {
    expect(operations).toHaveLength(46);
    expect(findOperation('call-app-operation')).toEqual(
      expect.objectContaining({ timeoutMs: 30_000 }),
    );
    expect(findOperation('upload-app-asset')).toEqual(
      expect.objectContaining({ timeoutMs: 20_000 }),
    );
    expect(findOperation('subscribe-app-events')).toEqual(
      expect.objectContaining({
        security: expect.arrayContaining(['renderTokenQuery']),
        streaming: true,
      }),
    );
    expect(findOperation('create-app')?.requestBody?.schema).toEqual(
      expect.objectContaining({ additionalProperties: false }),
    );
  });
});
