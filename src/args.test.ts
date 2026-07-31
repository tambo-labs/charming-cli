import { describe, expect, test } from 'vitest';

import { parseArgs } from './args.js';

describe('parseArgs', () => {
  test('separates command words, options, and repeated options', () => {
    expect(
      parseArgs([
        'api',
        'request',
        'update-app',
        '--param',
        'id=123',
        '--param=id=456',
        '--body',
        '@payload.json',
      ]),
    ).toEqual({
      command: ['api', 'request', 'update-app'],
      options: {
        body: '@payload.json',
        param: ['id=123', 'id=456'],
      },
    });
  });

  test('keeps positional values after a double dash', () => {
    expect(parseArgs(['apps', 'call', 'id', 'search', '--', '--literal'])).toEqual({
      command: ['apps', 'call', 'id', 'search', '--literal'],
      options: {},
    });
  });
});
