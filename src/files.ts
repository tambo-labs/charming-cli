import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

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
