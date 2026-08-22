import { describe, expect, test } from 'vitest';

import { findParityIssues, formatParityIssues, type CatalogOperation } from './cli-parity.js';

function operation(id: string, properties: string[]): CatalogOperation {
  return {
    id,
    requestBody: {
      schema: {
        type: 'object',
        properties: Object.fromEntries(properties.map((name) => [name, { type: 'string' }])),
      },
    },
  };
}

describe('findParityIssues', () => {
  test('flags a request-body property with no matching CLI flag', () => {
    const issues = findParityIssues(
      [operation('create-app', ['module', 'description'])],
      { 'create-app': new Set(['module']) },
      {},
    );

    expect(issues).toEqual([{ operationId: 'create-app', property: 'description' }]);
  });

  test('is clean when every property has a matching flag', () => {
    const issues = findParityIssues(
      [operation('create-app', ['module', 'description'])],
      { 'create-app': new Set(['module', 'description']) },
      {},
    );

    expect(issues).toEqual([]);
  });

  test('an allowlisted property is not reported', () => {
    const issues = findParityIssues(
      [operation('create-app', ['module', 'pair'])],
      { 'create-app': new Set(['module']) },
      { 'create-app': new Set(['pair']) },
    );

    expect(issues).toEqual([]);
  });

  test('skips operations with no friendly command (covered generically by `api request`)', () => {
    const issues = findParityIssues(
      [operation('set-app-public', ['public'])],
      { 'create-app': new Set(['module']) },
      {},
    );

    expect(issues).toEqual([]);
  });

  test('skips an operation with no request body', () => {
    const issues = findParityIssues(
      [{ id: 'list-apps', requestBody: null }],
      { 'list-apps': new Set([]) },
      {},
    );

    expect(issues).toEqual([]);
  });
});

describe('formatParityIssues', () => {
  test('names the operation, the missing property, and the allowlist file', () => {
    const message = formatParityIssues([{ operationId: 'create-app', property: 'description' }]);

    expect(message).toContain('create-app');
    expect(message).toContain('description');
    expect(message).toContain('cli-parity-allowlist.json');
  });
});
