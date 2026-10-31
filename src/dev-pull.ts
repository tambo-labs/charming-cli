import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  rename,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, join, resolve, sep } from 'node:path';

import {
  isAppId,
  readOnlyOperationValue,
  writeAppSource,
  type CommandContext,
} from './commands.js';
import { DevError, isLoopbackHost } from './dev.js';

/** Where pulled data goes beside the source: hidden, so a `--files` save never reads it. */
const PULLED_DIRECTORY = '.charming-dev';
export const PULLED_STATE_PATH = join(PULLED_DIRECTORY, 'state.json');

/** What `charming dev` serves: a local directory, or a live App pulled into one. */
export type DevTarget =
  | { kind: 'local'; directory: string | undefined }
  | {
      kind: 'live';
      appId: string;
      directory: string;
      /** False when the directory already holds files, which are never overwritten. */
      pullSource: boolean;
    };

/** Whether `directory` holds anything but hidden entries such as `.git`; it must be a directory if it exists. */
function holdsFiles(directory: string): boolean {
  if (!existsSync(directory)) return false;
  if (!statSync(directory).isDirectory()) {
    throw new DevError(
      'invalid_arguments',
      `${directory} is not a directory. Pass a new or empty directory to --out.`,
    );
  }
  return readdirSync(directory).some((entry) => !entry.startsWith('.'));
}

/** Whether `path` exists as a file or a directory holding files: an empty one is a pull target. */
function holdsLocalApp(path: string): boolean {
  if (!existsSync(path)) return false;
  return !statSync(path).isDirectory() || holdsFiles(path);
}

/**
 * Whether `--state` or `--save-state` names a file `--pull-data` wrote: one
 * inside a `.charming-dev` directory, or the App directory's pulled file under
 * another name, such as a hard link.
 */
function holdsPulledData(
  flags: { state?: string; saveState?: string },
  appDirectory: string,
): boolean {
  const pulledFile = statSync(join(appDirectory, PULLED_STATE_PATH), { throwIfNoEntry: false });
  return [flags.state, flags.saveState].some((path) => {
    if (path === undefined) return false;
    const names = [resolve(path), realPath(path)];
    if (names.some((name) => name.toLowerCase().split(sep).includes(PULLED_DIRECTORY))) {
      return true;
    }
    const named = statSync(path, { throwIfNoEntry: false });
    return (
      named !== undefined &&
      pulledFile !== undefined &&
      named.dev === pulledFile.dev &&
      named.ino === pulledFile.ino
    );
  });
}

/**
 * `path` with every symlink resolved, through its directory when the file
 * does not exist yet, so a link to `.charming-dev` names the pulled file too.
 */
function realPath(path: string): string {
  const resolved = resolve(path);
  if (existsSync(resolved)) return realpathSync(resolved);
  const directory = dirname(resolved);
  return existsSync(directory) ? join(realpathSync(directory), basename(resolved)) : resolved;
}

/**
 * Decide what to serve from the positional argument and the pull flags. An
 * App ID names a live App unless a directory of that name holding files exists
 * and no pull flag asks for the App; with `--out` or `--pull-data` it always
 * names one.
 */
export function devTarget(
  argument: string | undefined,
  flags: {
    out?: string;
    pullData?: string;
    state?: string;
    saveState?: string;
    host?: string;
    check?: boolean;
  },
): DevTarget {
  if (flags.pullData === '') {
    throw new DevError(
      'invalid_arguments',
      "--pull-data needs the name of a read-only GET operation that returns the App's storage.",
    );
  }
  if (
    flags.check &&
    (flags.pullData !== undefined || holdsPulledData(flags, flags.out ?? argument ?? '.'))
  ) {
    throw new DevError(
      'invalid_arguments',
      "--check runs the App's ui in this process, not a browser sandbox, so it never renders live data. Drop --pull-data, or seed storage from a file you wrote.",
    );
  }
  const pullFlags = flags.out !== undefined || flags.pullData !== undefined;
  if (argument && isAppId(argument) && (pullFlags || !holdsLocalApp(argument))) {
    if (flags.pullData !== undefined && flags.host !== undefined && !isLoopbackHost(flags.host)) {
      throw new DevError(
        'invalid_arguments',
        `--pull-data serves live user data, so it only listens on a loopback --host such as 127.0.0.1, not ${flags.host}.`,
      );
    }
    if (flags.pullData !== undefined && flags.state !== undefined) {
      throw new DevError(
        'invalid_arguments',
        '--pull-data seeds storage from the live App, and --state seeds it from a file. Pass one of them.',
      );
    }
    if (flags.pullData !== undefined && flags.saveState !== undefined) {
      throw new DevError(
        'invalid_arguments',
        `--pull-data keeps live data in the private ${PULLED_STATE_PATH}, and --save-state would copy it to another file. Drop --save-state.`,
      );
    }
    const directory = resolve(flags.out ?? argument);
    return { kind: 'live', appId: argument, directory, pullSource: !holdsFiles(directory) };
  }
  if (pullFlags) {
    throw new DevError(
      'invalid_arguments',
      '--out and --pull-data need the ID of a live app in place of the directory.',
    );
  }
  return { kind: 'local', directory: argument };
}

/**
 * Prepare a live App for `charming dev <app-id>`. With `dataOperation`, read
 * the storage a read-only GET operation returns first, so a refused operation
 * leaves nothing on disk, and check where the data goes before anything is
 * written. Then write the App's source, unless the directory already holds
 * files, and the data, readable by this user only and ignored by git. Reads
 * only from Charming.
 */
export async function pullLiveApp(
  context: CommandContext,
  target: Extract<DevTarget, { kind: 'live' }>,
  options: { dataOperation?: string; log: (line: string) => void },
): Promise<{ statePath?: string }> {
  const { appId, directory } = target;
  const value = options.dataOperation
    ? await readOnlyOperationValue(context, appId, options.dataOperation)
    : undefined;
  if (
    options.dataOperation &&
    (typeof value !== 'object' || value === null || Array.isArray(value))
  ) {
    throw new DevError(
      'invalid_state',
      `--pull-data ${options.dataOperation} returned ${Array.isArray(value) ? 'an array' : value === null ? 'null' : typeof value}, not an object of storage keys to values. Name a read-only operation that returns the App's storage in that shape.`,
    );
  }

  const statePath = join(directory, PULLED_STATE_PATH);
  const stateDirectory = dirname(statePath);
  if (options.dataOperation) {
    await refuseSymlink(stateDirectory);
    await refuseSymlink(statePath);
    await mkdir(stateDirectory, { recursive: true, mode: 0o700 });
    await refuseSymlink(stateDirectory);
    await chmod(stateDirectory, 0o700);
  }

  if (target.pullSource) {
    await writeWholeSource(context, appId, directory);
    options.log(
      `Wrote the source of ${appId} to ${directory}. Its server code runs in this process with your file and network access; read it first if someone else last saved the App.`,
    );
  } else {
    options.log(
      `${directory} already holds files, so the live source was not pulled over them. Pass an empty --out directory to pull it again.`,
    );
  }
  if (!options.dataOperation) return {};

  await writePrivate(join(stateDirectory, '.gitignore'), '*\n');
  await writePrivate(statePath, `${JSON.stringify(value, null, 2)}\n`);
  options.log(
    `Wrote the live data ${options.dataOperation} returned to ${statePath}. It can hold real user data; delete it when you are done.`,
  );
  return { statePath };
}

/**
 * Write the live source into a hidden directory beside `directory`, then move
 * each top-level entry in. A write that fails partway leaves no partial tree
 * that a later `charming dev <app-id>` would run as local edits. The target
 * holds only hidden entries and App paths are never hidden, so no move
 * replaces anything.
 */
async function writeWholeSource(
  context: CommandContext,
  appId: string,
  directory: string,
): Promise<void> {
  const parent = dirname(directory);
  await mkdir(parent, { recursive: true });
  const staging = await mkdtemp(join(parent, `.${basename(directory)}-pull-`));
  const moved: string[] = [];
  try {
    await writeAppSource(context, appId, staging);
    await mkdir(directory, { recursive: true });
    for (const entry of await readdir(staging)) {
      await rename(join(staging, entry), join(directory, entry));
      moved.push(entry);
    }
  } catch (error) {
    for (const entry of moved) await rm(join(directory, entry), { recursive: true, force: true });
    throw error;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

/** Refuse a symlink at `path`, which would send real user data to wherever it points. */
async function refuseSymlink(path: string): Promise<void> {
  const entry = await lstat(path).catch(() => null);
  if (entry?.isSymbolicLink()) {
    throw new DevError(
      'invalid_state',
      `${path} is a symlink, so --pull-data will not write live data through it. Remove it and retry.`,
    );
  }
}

/**
 * Write `contents` to `path` readable by this user only: into a new temp file
 * that no symlink can redirect, renamed over `path`, which replaces a symlink
 * there instead of following it.
 */
async function writePrivate(path: string, contents: string): Promise<void> {
  const temporary = `${path}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, contents, { mode: 0o600, flag: 'wx' });
    await rename(temporary, path);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}
