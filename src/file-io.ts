import { mkdir, readFile, writeFile } from 'node:fs/promises';

import * as Effect from 'effect/Effect';

export function fileOperation<A>(run: (signal: AbortSignal) => Promise<A>) {
  return Effect.tryPromise({
    try: run,
    catch: (error) => {
      if (error instanceof Error) return error;
      throw error;
    },
  });
}

export function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

export function readText(path: string) {
  return fileOperation((signal) => readFile(path, { encoding: 'utf8', signal }));
}

export function readOptionalText(path: string) {
  return readText(path).pipe(Effect.catchIf(isMissingFile, () => Effect.succeed(undefined)));
}

export function writeText(path: string, text: string) {
  return Effect.uninterruptible(fileOperation(() => writeFile(path, text)));
}

export function makeDirectory(path: string) {
  return Effect.uninterruptible(fileOperation(() => mkdir(path, { recursive: true })));
}
