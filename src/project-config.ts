import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { applyEdits, modify, type ParseError, parse, printParseErrorCode } from 'jsonc-parser';

import { validateProfileName } from './profile-name.js';

const PROJECT_CONFIG_PATH = join('.config', 'charming.json');
const ALTERNATE_PROJECT_CONFIG_PATH = join('.charming', 'config.json');

const ALLOWED_KEYS = new Set(['$schema', 'profile']);

type ProjectConfig = { path: string; profile?: string };

type Boundaries = { cwd: string; home: string };

export async function findProjectConfig(
  boundaries: Boundaries,
): Promise<ProjectConfig | undefined> {
  const path = locateProjectConfig(boundaries);
  return path
    ? { path, profile: parseProjectConfig(path, await readFile(path, 'utf8')).profile }
    : undefined;
}

export async function writeProjectProfile(
  name: string,
  boundaries: Boundaries,
): Promise<{ path: string }> {
  const existing = locateProjectConfig(boundaries);
  if (!existing) {
    const path = join(projectRoot(boundaries), PROJECT_CONFIG_PATH);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify({ profile: name }, null, 2)}\n`);
    return { path };
  }
  const text = await readFile(existing, 'utf8');
  parseProjectConfig(existing, text);
  const edits = modify(text, ['profile'], name, {
    formattingOptions: { insertSpaces: true, tabSize: indentWidth(text) },
  });
  await writeFile(existing, applyEdits(text, edits));
  return { path: existing };
}

function locateProjectConfig({ cwd, home }: Boundaries): string | undefined {
  for (const directory of searchedDirectories({ cwd, home })) {
    const preferred = join(directory, PROJECT_CONFIG_PATH);
    const alternate = join(directory, ALTERNATE_PROJECT_CONFIG_PATH);
    const hasPreferred = existsSync(preferred);
    const hasAlternate = existsSync(alternate);
    if (hasPreferred && hasAlternate) {
      throw new Error(
        `Found both ${preferred} and ${alternate}. Keep ${PROJECT_CONFIG_PATH} and delete ${ALTERNATE_PROJECT_CONFIG_PATH}.`,
      );
    }
    if (hasPreferred) return preferred;
    if (hasAlternate) return alternate;
  }
  return undefined;
}

function projectRoot(boundaries: Boundaries): string {
  const root = searchedDirectories(boundaries).at(-1);
  if (!root) {
    throw new Error(
      'Run `charming profile use NAME --project` inside a git repository. Project config is read only between the working directory and the git root.',
    );
  }
  return root;
}

function searchedDirectories({ cwd, home }: Boundaries): string[] {
  const stopAt = resolve(home);
  const directories: string[] = [];
  let directory = resolve(cwd);
  while (directory !== stopAt) {
    directories.push(directory);
    if (isGitRoot(directory)) return directories;
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return [];
}

function isGitRoot(directory: string): boolean {
  return existsSync(join(directory, '.git'));
}

function parseProjectConfig(path: string, text: string): { profile?: string } {
  const errors: ParseError[] = [];
  const value: unknown = parse(text, errors, { allowTrailingComma: true });
  const [error] = errors;
  if (error) {
    const { column, line } = position(text, error.offset);
    throw new Error(
      `Invalid JSON in ${path}:${line}:${column}: ${printParseErrorCode(error.error)}. Fix or remove that file.`,
    );
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${path} must contain a JSON object like {"profile": "work"}.`);
  }
  if (containsSecret(value)) {
    throw new Error(
      `${path} contains a credential. Project config is committed with the repository, so it holds only a profile name. Remove the token and run \`charming auth login --profile NAME\` to save it in your user config.`,
    );
  }
  const unknown = Object.keys(value).filter((key) => !ALLOWED_KEYS.has(key));
  if (unknown.length > 0) {
    throw new Error(
      `${path} has unsupported keys: ${unknown.join(', ')}. Project config holds only "profile"; origins and credentials live in your user config.`,
    );
  }
  const profile = (value as Record<string, unknown>).profile;
  if (profile === undefined) return {};
  if (typeof profile !== 'string') throw new Error(`"profile" in ${path} must be a string.`);
  validateProfileName(profile);
  return { profile };
}

function containsSecret(value: unknown): boolean {
  if (typeof value === 'string') return value.startsWith('chrm_');
  if (Array.isArray(value)) return value.some(containsSecret);
  if (typeof value !== 'object' || value === null) return false;
  return Object.entries(value).some(
    ([key, entry]) => key.toLowerCase() === 'token' || containsSecret(entry),
  );
}

function position(text: string, offset: number): { column: number; line: number } {
  const before = text.slice(0, offset).split('\n');
  return { column: (before.at(-1)?.length ?? 0) + 1, line: before.length };
}

function indentWidth(text: string): number {
  return text.match(/\n( +)\S/)?.[1].length ?? 2;
}
