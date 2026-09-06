import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

import { describe, expect, it } from 'vitest';

describe('CRUD template', () => {
  it('escapes stored item values before inserting them into HTML', async () => {
    const source = await readFile(
      join(import.meta.dirname, '..', 'skills', 'charming', 'templates', 'crud', 'ui.js'),
      'utf8',
    );
    const context: {
      escapeForTest?: (value: unknown) => string;
      window: object;
      setInterval: () => number;
      setTimeout: () => number;
    } = {
      window: {
        charming: {
          api: () => ({ list: () => new Promise(() => {}) }),
          onStateChange: () => {},
        },
      },
      setInterval: () => 0,
      setTimeout: () => 0,
    };

    runInNewContext(`${source}\nglobalThis.escapeForTest = escapeHtml;`, context);

    expect(context.escapeForTest?.(`<img src=x onerror="alert(1)"> & '`)).toBe(
      '&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &#39;',
    );
  });
});
