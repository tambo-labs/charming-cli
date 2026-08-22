import { describe, expect, test } from 'vitest';

import { canonicalizeGlobalFlags } from './argv.js';

describe('canonicalizeGlobalFlags', () => {
  test('moves prefix global flags after the discovered command without changing their values', () => {
    expect(
      canonicalizeGlobalFlags([
        '--base-url',
        'https://preview.example',
        '--token=chrm_user_test',
        'apps',
        'list',
        '--limit=3',
      ]),
    ).toEqual([
      'apps',
      'list',
      '--limit=3',
      '--base-url',
      'https://preview.example',
      '--token=chrm_user_test',
    ]);
  });
});
