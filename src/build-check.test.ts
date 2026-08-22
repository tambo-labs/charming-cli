import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test, vi } from 'vitest';

import { commandsNeedBuild, ensureCommandsBuilt, isSourceEntry } from './build-check.js';

describe('isSourceEntry', () => {
  test('is true for the TypeScript entry point', () => {
    expect(isSourceEntry('file:///repo/packages/cli/src/cli.ts')).toBe(true);
  });

  test('is false for the compiled entry point', () => {
    expect(isSourceEntry('file:///repo/packages/cli/dist/cli.js')).toBe(false);
  });
});

describe('commandsNeedBuild', () => {
  let root: string;

  afterEach(async () => {
    if (root) await rm(root, { force: true, recursive: true });
  });

  test('is true when dist/commands does not exist', async () => {
    root = await mkdtemp(join(tmpdir(), 'charming-cli-build-check-'));
    await mkdir(join(root, 'src', 'commands'), { recursive: true });
    await writeFile(join(root, 'src', 'commands', 'doctor.ts'), 'export default {};');

    expect(commandsNeedBuild(root)).toBe(true);
  });

  test('is true when a source file is newer than the built commands', async () => {
    root = await mktemp();
    await touch(join(root, 'dist', 'commands', 'doctor.js'), 1_000);
    await touch(join(root, 'src', 'commands', 'doctor.ts'), 2_000);

    expect(commandsNeedBuild(root)).toBe(true);
  });

  test('is false when the built commands are newer than every source file', async () => {
    root = await mktemp();
    await touch(join(root, 'src', 'commands', 'doctor.ts'), 1_000);
    await touch(join(root, 'dist', 'commands', 'doctor.js'), 2_000);

    expect(commandsNeedBuild(root)).toBe(false);
  });

  async function mktemp(): Promise<string> {
    return mkdtemp(join(tmpdir(), 'charming-cli-build-check-'));
  }

  async function touch(path: string, mtimeOffsetMs: number): Promise<void> {
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, '');
    const { utimes } = await import('node:fs/promises');
    const time = new Date(mtimeOffsetMs);
    await utimes(path, time, time);
  }
});

describe('ensureCommandsBuilt', () => {
  let root: string;

  afterEach(async () => {
    if (root) await rm(root, { force: true, recursive: true });
  });

  test('skips the build for the compiled entry point even when stale', async () => {
    root = await mkdtemp(join(tmpdir(), 'charming-cli-build-check-'));
    const build = vi.fn();

    await ensureCommandsBuilt({ build, moduleUrl: 'file:///repo/dist/cli.js', root });

    expect(build).not.toHaveBeenCalled();
  });

  test('builds once when dist/commands is missing, and skips a second call once fresh', async () => {
    root = await mkdtemp(join(tmpdir(), 'charming-cli-build-check-'));
    await mkdir(join(root, 'src', 'commands'), { recursive: true });
    await writeFile(join(root, 'src', 'commands', 'doctor.ts'), 'export default {};');
    const build = vi.fn(async () => {
      await mkdir(join(root, 'dist', 'commands'), { recursive: true });
      await writeFile(join(root, 'dist', 'commands', 'doctor.js'), 'export default {};');
    });

    await ensureCommandsBuilt({ build, moduleUrl: 'file:///repo/src/cli.ts', root });
    expect(build).toHaveBeenCalledTimes(1);

    await ensureCommandsBuilt({ build, moduleUrl: 'file:///repo/src/cli.ts', root });
    expect(build).toHaveBeenCalledTimes(1);
  });

  test('raises an explicit build command when the automatic build fails', async () => {
    root = await mkdtemp(join(tmpdir(), 'charming-cli-build-check-'));
    await mkdir(join(root, 'src', 'commands'), { recursive: true });
    await writeFile(join(root, 'src', 'commands', 'doctor.ts'), 'export default {};');
    const build = vi.fn(() => {
      throw new Error('tsc exploded');
    });

    await expect(
      ensureCommandsBuilt({ build, moduleUrl: 'file:///repo/src/cli.ts', root }),
    ).rejects.toThrow('bun run --cwd packages/cli build');
  });
});
