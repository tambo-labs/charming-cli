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

import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';

import {
  isAppId,
  readOnlyOperationValueEffect,
  writeAppSourceEffect,
  type CommandContext,
} from './commands.js';
import { DevError, isLoopbackHost } from './dev.js';
import { fileOperation } from './file-io.js';
import { toPromise } from './io.js';

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
export const pullLiveAppEffect = Effect.fnUntraced(function* (
  context: CommandContext,
  target: Extract<DevTarget, { kind: 'live' }>,
  options: { dataOperation?: string; log: (line: string) => void },
): Effect.fn.Return<{ statePath?: string }, unknown> {
  const { appId, directory } = target;
  const { dataOperation } = options;
  const value = dataOperation
    ? yield* readOnlyOperationValueEffect(context, appId, dataOperation)
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
    yield* refuseSymlink(stateDirectory);
    yield* refuseSymlink(statePath);
    yield* fileOperation(() => mkdir(stateDirectory, { recursive: true, mode: 0o700 }));
    yield* refuseSymlink(stateDirectory);
    yield* fileOperation(() => chmod(stateDirectory, 0o700));
  }

  if (target.pullSource) {
    yield* writeWholeSource(context, appId, directory);
    options.log(
      `Wrote the source of ${appId} to ${directory}. Its server code runs in this process with your file and network access; read it first if someone else last saved the App.`,
    );
  } else {
    options.log(
      `${directory} already holds files, so the live source was not pulled over them. Pass an empty --out directory to pull it again.`,
    );
  }
  if (!options.dataOperation) return {};

  yield* writePrivate(join(stateDirectory, '.gitignore'), '*\n');
  yield* writePrivate(statePath, `${JSON.stringify(value, null, 2)}\n`);
  options.log(
    `Wrote the live data ${options.dataOperation} returned to ${statePath}. It can hold real user data; delete it when you are done.`,
  );
  return { statePath };
});

export const pullLiveApp = toPromise(pullLiveAppEffect);

/**
 * Write the live source into a hidden directory beside `directory`, then move
 * each top-level entry in. A write that fails partway leaves no partial tree
 * that a later `charming dev <app-id>` would run as local edits. The target
 * holds only hidden entries and App paths are never hidden, so no move
 * replaces anything.
 */
const writeWholeSource = Effect.fnUntraced(function* (
  context: CommandContext,
  appId: string,
  directory: string,
) {
  const parent = dirname(directory);
  yield* fileOperation(() => mkdir(parent, { recursive: true }));
  yield* Effect.acquireUseRelease(
    fileOperation(() => mkdtemp(join(parent, `.${basename(directory)}-pull-`))),
    (staging) =>
      Effect.andThen(writeAppSourceEffect(context, appId, staging), moveSource(staging, directory)),
    (staging) => fileOperation(() => rm(staging, { recursive: true, force: true })),
  );
});

const moveSource = Effect.fnUntraced(function* (staging: string, directory: string) {
  const moved: string[] = [];
  yield* fileOperation(() => mkdir(directory, { recursive: true }));
  const entries = yield* fileOperation(() => readdir(staging));
  yield* Effect.forEach(entries, (entry) =>
    fileOperation(() => rename(join(staging, entry), join(directory, entry))).pipe(
      Effect.tap(() => Effect.sync(() => moved.push(entry))),
      Effect.uninterruptible,
    ),
  ).pipe(
    Effect.onExitIf(Exit.isFailure, () =>
      Effect.forEach(
        moved,
        (entry) =>
          fileOperation(() => rm(join(directory, entry), { recursive: true, force: true })),
        { discard: true },
      ),
    ),
  );
});

/** Refuse a symlink at `path`, which would send real user data to wherever it points. */
const refuseSymlink = Effect.fnUntraced(function* (path: string) {
  const entry = yield* fileOperation(() => lstat(path)).pipe(
    Effect.catch(() => Effect.succeed(null)),
  );
  if (entry?.isSymbolicLink()) {
    return yield* Effect.fail(
      new DevError(
        'invalid_state',
        `${path} is a symlink, so --pull-data will not write live data through it. Remove it and retry.`,
      ),
    );
  }
});

/**
 * Write `contents` to `path` readable by this user only: into a new temp file
 * that no symlink can redirect, renamed over `path`, which replaces a symlink
 * there instead of following it.
 */
function writePrivate(path: string, contents: string) {
  const temporary = `${path}.${process.pid}.tmp`;
  return fileOperation(() => writeFile(temporary, contents, { mode: 0o600, flag: 'wx' })).pipe(
    Effect.andThen(fileOperation(() => rename(temporary, path))),
    Effect.onError(() => fileOperation(() => unlink(temporary)).pipe(Effect.ignore)),
    Effect.uninterruptible,
  );
}
