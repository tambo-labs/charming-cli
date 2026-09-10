import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

import { describe, expect, it, vi } from 'vitest';

describe('CRUD template', () => {
  it('escapes stored item values in the HTML written by the list renderer', async () => {
    const source = await readFile(
      join(import.meta.dirname, '..', 'skills', 'charming', 'templates', 'crud', 'ui.js'),
      'utf8',
    );
    const content = {
      innerHTML: '',
      querySelector: () => ({ addEventListener() {} }),
      querySelectorAll: () => [],
    };
    const shell = { innerHTML: '' };
    const list = vi.fn(async () => [
      { id: '" onclick="alert(1)', text: '<img src=x onerror="alert(1)"> & \'', done: false },
    ]);
    runInNewContext(source, {
      window: { charming: { api: () => ({ list }), onStateChange() {} } },
      document: {
        querySelector: (selector: string) => (selector === '#app' ? shell : content),
        activeElement: null,
      },
      setInterval: () => 0,
      setTimeout: () => 0,
    });
    await vi.waitFor(() =>
      expect(content.innerHTML).toContain(
        '&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &#39;',
      ),
    );
    expect(list).toHaveBeenCalledWith({});
    expect(content.innerHTML).toContain('data-id="&quot; onclick=&quot;alert(1)"');
    expect(content.innerHTML).not.toContain('<img');
    expect(content.innerHTML).not.toContain('data-id="" onclick="');
  });
});
