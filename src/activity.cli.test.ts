import { execFile } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { expect, test } from 'vitest';

test('compiled CLI keeps timeline and legacy activity paths, filters, auth, and envelopes distinct', async () => {
  const requests: Array<{ method?: string; url?: string; authorization?: string }> = [];
  const retention = { tier: 'free', hours: 24, since: new Date(0).toISOString(), truncated: true };
  const timeline = { ok: true, appId: 'app/id', items: [], hasMore: true, retention };
  const legacy = { ok: true, value: { items: [], retention } };
  const server = createServer((request, response) => {
    requests.push({
      method: request.method,
      url: request.url,
      authorization: request.headers.authorization,
    });
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(request.url?.startsWith('/api/v1/') ? timeline : legacy));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing fixture address');
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const cwd = await mkdtemp(join(tmpdir(), 'charming-activity-cli-'));
    const binary = join(process.cwd(), 'bin/run.js');
    const filters = {
      kinds: 'app_publish,api_call',
      since: new Date(0).toISOString(),
      before: new Date(1_000).toISOString(),
      beforeId: 'cursor-id',
      limit: '2',
    };
    const rich = await promisify(execFile)(
      process.execPath,
      [
        binary,
        'api',
        'request',
        'get-app-activity-timeline',
        '--base-url',
        baseUrl,
        '--token',
        'fixture-token',
        '--param',
        'appId=app/id',
        ...Object.entries(filters).flatMap(([key, value]) => ['--param', `${key}=${value}`]),
      ],
      { cwd },
    );
    expect(rich.stderr).toBe('');
    expect(JSON.parse(rich.stdout)).toEqual(timeline);
    const old = await promisify(execFile)(
      process.execPath,
      [
        binary,
        'api',
        'request',
        'get-app-activity',
        '--base-url',
        baseUrl,
        '--token',
        'fixture-token',
        '--param',
        'id=app/id',
        '--param',
        'limit=2',
      ],
      { cwd },
    );
    expect(old.stderr).toBe('');
    expect(JSON.parse(old.stdout)).toEqual(legacy);
    expect(requests).toEqual([
      {
        method: 'GET',
        url: `/api/v1/apps/app%2Fid/activity?${new URLSearchParams(filters)}`,
        authorization: 'Bearer fixture-token',
      },
      {
        method: 'GET',
        url: '/app/app%2Fid/activity?limit=2',
        authorization: 'Bearer fixture-token',
      },
    ]);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
