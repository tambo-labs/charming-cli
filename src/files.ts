import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';

export async function readJsonValue(value: string): Promise<unknown> {
  const text = value.startsWith('@') ? await readFile(resolve(value.slice(1)), 'utf8') : value;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON${value.startsWith('@') ? ` in ${value.slice(1)}` : ''}`);
  }
}

export async function readAppBundle(input: {
  directory?: string;
  module?: string;
  styles?: string;
  ui?: string;
}): Promise<{ module: string; styles?: string; ui?: string }> {
  const directory = resolve(input.directory ?? '.');
  const modulePath = resolve(input.module ?? directory, input.module ? '' : 'module.js');
  const bundle: { module: string; styles?: string; ui?: string } = {
    module: await readRequired(modulePath, 'module'),
  };
  const ui = await readOptional(input.ui ? resolve(input.ui) : resolve(directory, 'ui.js'));
  const styles = await readOptional(
    input.styles ? resolve(input.styles) : resolve(directory, 'styles.css'),
  );
  if (ui !== undefined) bundle.ui = ui;
  if (styles !== undefined) bundle.styles = styles;
  return bundle;
}

async function readRequired(path: string, label: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    throw new Error(`Could not read ${label} file: ${path}`);
  }
}

async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

export async function writeAppBundle(
  directory: string,
  source: { module: string; styles?: string | null; ui?: string | null },
): Promise<void> {
  const output = resolve(directory);
  await mkdir(output, { recursive: true });
  await writeFile(resolve(output, 'module.js'), source.module);
  if (source.ui !== undefined && source.ui !== null)
    await writeFile(resolve(output, 'ui.js'), source.ui);
  if (source.styles !== undefined && source.styles !== null)
    await writeFile(resolve(output, 'styles.css'), source.styles);
}

const PACKAGE_FILE = /(?:^|\/)[^/]+\.(?:js|mjs|json)$/;
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
 * and styles.css at the root, and every .js, .mjs, or .json file beneath it,
 * keyed by its path relative to the directory with forward slashes. Hidden
 * entries, node_modules, lockfiles, editor configs, nested package.json files,
 * and other file types stay on disk. Charming refuses a file no entry imports, so keep only what the App
 * uses in the directory.
 */
export async function readAppPackage(directory: string): Promise<Record<string, string>> {
  const root = resolve(directory);
  const files: Record<string, string> = {};
  for (const key of await packageFileKeys(root))
    files[key] = await readFile(resolve(root, key), 'utf8');
  if (!('package.json' in files)) throw new Error(`No package.json in ${root}`);
  if (!('server.js' in files)) throw new Error(`No server.js in ${root}`);
  return Object.fromEntries(Object.entries(files).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

async function packageFileKeys(root: string): Promise<string[]> {
  const keys: string[] = [];
  async function walk(current: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (error) {
      if (current !== root || (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || SKIPPED_DIRECTORIES.has(entry.name)) continue;
      const path = resolve(current, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
        continue;
      }
      if (!entry.isFile()) continue;
      const key = relative(root, path).split(sep).join('/');
      if (ROOT_ONLY_FILES.has(key) || (PACKAGE_FILE.test(key) && !SKIPPED_FILES.has(entry.name)))
        keys.push(key);
    }
  }
  await walk(root);
  return keys;
}

/**
 * Writes a package tree into a directory. A later `--files` save sends every
 * package file the directory holds, so a file the tree does not name would be
 * published again; the write refuses such a directory instead of leaving it.
 */
export async function writeAppPackage(
  directory: string,
  files: Record<string, string>,
): Promise<void> {
  const output = resolve(directory);
  const writes = Object.entries(files).map(([key, text]) => {
    const path = resolve(output, key);
    if (!path.startsWith(`${output}${sep}`))
      throw new Error(`Refusing to write ${key} outside ${output}`);
    if (key.split('/').some((segment) => segment.startsWith('.') || segment === 'node_modules'))
      throw new Error(
        `Refusing to write ${key}: Charming App paths have no hidden or node_modules segments`,
      );
    return [path, text] as const;
  });
  const stale = (await packageFileKeys(output)).filter((key) => !(key in files));
  if (stale.length > 0)
    throw new Error(
      `Refusing to write into ${output}: it holds ${stale.join(', ')}, which the App does not have, and a later --files save would publish them. Remove them or choose an empty directory.`,
    );
  for (const [path, text] of writes) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, text);
  }
}
