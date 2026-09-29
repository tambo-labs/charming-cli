import { describe, expect, test } from 'vitest';

import { findOperation, operations } from './contract.js';

describe('generated operation catalog', () => {
  test('contains the core app and pairing operations', () => {
    expect(
      [
        'create-app',
        'list-apps',
        'get-app-source',
        'get-app-build',
        'cancel-app-build',
        'update-app',
        'delete-app',
        'start-pairing',
      ].every((id) => findOperation(id)),
    ).toBe(true);
  });

  test('keeps legacy failures and the rich activity timeline distinct', () => {
    expect(findOperation('get-app-activity')).toMatchObject({
      method: 'GET',
      path: '/app/{id}/activity',
    });
    const timeline = findOperation('get-app-activity-timeline');
    expect(timeline).toMatchObject({
      method: 'GET',
      path: '/api/v1/apps/{appId}/activity',
      security: ['userToken'],
    });
    expect(timeline?.parameters.map((parameter) => parameter.name)).toEqual([
      'appId',
      'kinds',
      'since',
      'before',
      'beforeId',
      'limit',
    ]);
  });

  test('has unique operation ids', () => {
    expect(new Set(operations.map((operation) => operation.id)).size).toBe(operations.length);
  });

  test('preserves operation count, timeouts, event auth, and the closed create schema', () => {
    expect(operations).toHaveLength(74);
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
