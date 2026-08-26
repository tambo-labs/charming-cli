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

  test('moves a prefix --timeout after the discovered command, like --base-url and --token', () => {
    expect(canonicalizeGlobalFlags(['--timeout', '5000', 'apps', 'list'])).toEqual([
      'apps',
      'list',
      '--timeout',
      '5000',
    ]);
  });
});
