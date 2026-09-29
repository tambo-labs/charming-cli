import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function directoryOutsideAnyProject(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'charming-cwd-'));
  await mkdir(join(directory, '.git'));
  return directory;
}

export function fetchThatWaitsForAbort(
  _input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  return new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => {
      const error = new Error('This operation was aborted');
      error.name = 'AbortError';
      reject(error);
    });
  });
}
