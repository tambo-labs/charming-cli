import { readdir } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';

import * as Effect from 'effect/Effect';

import {
  fileOperation,
  isMissingFile,
  makeDirectory,
  readOptionalText,
  readText,
  writeText,
} from './file-io.js';
import { toPromise } from './io.js';

export const readJsonValueEffect = Effect.fnUntraced(function* (
  value: string,
): Effect.fn.Return<unknown, Error> {
  const text = value.startsWith('@') ? yield* readText(resolve(value.slice(1))) : value;
  try {
    return JSON.parse(text);
  } catch (cause) {
    return yield* Effect.fail(
      new Error(`Invalid JSON${value.startsWith('@') ? ` in ${value.slice(1)}` : ''}`, { cause }),
    );
  }
});

export const readJsonValue = toPromise(readJsonValueEffect);

export const readAppBundleEffect = Effect.fnUntraced(function* (input: {
  directory?: string;
  module?: string;
  styles?: string;
  ui?: string;
}): Effect.fn.Return<{ module: string; styles?: string; ui?: string }, Error> {
  const directory = resolve(input.directory ?? '.');
  const modulePath = resolve(input.module ?? directory, input.module ? '' : 'module.js');
  const bundle: { module: string; styles?: string; ui?: string } = {
    module: yield* readText(modulePath).pipe(
      Effect.mapError((cause) => new Error(`Could not read module file: ${modulePath}`, { cause })),
    ),
  };
  const ui = yield* readOptionalText(input.ui ? resolve(input.ui) : resolve(directory, 'ui.js'));
  const styles = yield* readOptionalText(
    input.styles ? resolve(input.styles) : resolve(directory, 'styles.css'),
  );
  if (ui !== undefined) bundle.ui = ui;
  if (styles !== undefined) bundle.styles = styles;
  return bundle;
});

export const readAppBundle = toPromise(readAppBundleEffect);

export const writeAppBundleEffect = Effect.fnUntraced(function* (
  directory: string,
  source: { module: string; styles?: string | null; ui?: string | null },
): Effect.fn.Return<void, Error> {
  const output = resolve(directory);
  yield* makeDirectory(output);
  yield* writeText(resolve(output, 'module.js'), source.module);
  if (source.ui !== undefined && source.ui !== null)
    yield* writeText(resolve(output, 'ui.js'), source.ui);
  if (source.styles !== undefined && source.styles !== null)
    yield* writeText(resolve(output, 'styles.css'), source.styles);
});

export const writeAppBundle = toPromise(writeAppBundleEffect);

const PACKAGE_FILE = /(?:^|\/)[^/]+\.(?:js|mjs|ts|json)$/;
const ROOT_ONLY_FILES = new Set(['package.json', 'styles.css']);
const SKIPPED_FILES = new Set([
  'package.json',
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
  'bun.lock',
  'pnpm-lock.yaml',
  'tsconfig.json',
  'jsconfig.json',
]);
const SKIPPED_DIRECTORIES = new Set(['node_modules']);

/**
 * Reads an App directory as the package tree Charming accepts: package.json
 * and styles.css at the root, and every .js, .mjs, .ts, or .json file beneath it,
 * keyed by its path relative to the directory with forward slashes. Hidden
 * entries, node_modules, lockfiles, editor configs, nested package.json files,
 * TypeScript declaration files such as charming-env.d.ts, and other file types
 * stay on disk. Charming refuses a file no entry imports, so keep only what the App
 * uses in the directory.
 */
export const readAppPackageEffect = Effect.fnUntraced(function* (
  directory: string,
): Effect.fn.Return<Record<string, string>, Error> {
  const root = resolve(directory);
  const files: Record<string, string> = {};
  for (const key of yield* packageFileKeys(root)) files[key] = yield* readText(resolve(root, key));
  if (!('package.json' in files))
    return yield* Effect.fail(new Error(`No package.json in ${root}`));
  if (!('server.js' in files)) return yield* Effect.fail(new Error(`No server.js in ${root}`));
  return Object.fromEntries(Object.entries(files).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
});

export const readAppPackage = toPromise(readAppPackageEffect);

const packageFileKeys = Effect.fnUntraced(function* (root: string) {
  const keys: string[] = [];
  function walk(current: string): Effect.Effect<void, Error> {
    return Effect.gen(function* () {
      const entries = yield* fileOperation(() => readdir(current, { withFileTypes: true })).pipe(
        Effect.catchIf(
          (error) => current === root && isMissingFile(error),
          () => Effect.succeed([]),
        ),
      );
      for (const entry of entries) {
        if (entry.name.startsWith('.') || SKIPPED_DIRECTORIES.has(entry.name)) continue;
        const path = resolve(current, entry.name);
        if (entry.isDirectory()) {
          yield* walk(path);
          continue;
        }
        if (!entry.isFile()) continue;
        const key = relative(root, path).split(sep).join('/');
        if (
          ROOT_ONLY_FILES.has(key) ||
          (PACKAGE_FILE.test(key) && !SKIPPED_FILES.has(entry.name) && !key.endsWith('.d.ts'))
        )
          keys.push(key);
      }
    });
  }
  yield* walk(root);
  return keys;
});

/**
 * Writes a package tree into a directory. A later `--files` save sends every
 * package file the directory holds, so a file the tree does not name would be
 * published again; the write refuses such a directory instead of leaving it.
 */
export const writeAppPackageEffect = Effect.fnUntraced(function* (
  directory: string,
  files: Record<string, string>,
): Effect.fn.Return<void, Error> {
  const output = resolve(directory);
  const writes: Array<[string, string]> = [];
  for (const [key, text] of Object.entries(files)) {
    const path = resolve(output, key);
    if (!path.startsWith(`${output}${sep}`))
      return yield* Effect.fail(new Error(`Refusing to write ${key} outside ${output}`));
    if (key.split('/').some((segment) => segment.startsWith('.') || segment === 'node_modules'))
      return yield* Effect.fail(
        new Error(
          `Refusing to write ${key}: Charming App paths have no hidden or node_modules segments`,
        ),
      );
    writes.push([path, text]);
  }
  const stale = (yield* packageFileKeys(output)).filter((key) => !(key in files));
  if (stale.length > 0)
    return yield* Effect.fail(
      new Error(
        `Refusing to write into ${output}: it holds ${stale.join(', ')}, which the App does not have, and a later --files save would publish them. Remove them or choose an empty directory.`,
      ),
    );
  for (const [path, text] of writes) {
    yield* makeDirectory(dirname(path));
    yield* writeText(path, text);
  }
});

export const writeAppPackage = toPromise(writeAppPackageEffect);
