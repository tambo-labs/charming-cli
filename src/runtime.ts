type Dependencies = { buildImpl?: () => void | Promise<void>; fetchImpl?: typeof fetch };

type Runtime = Dependencies & { exitCode?: number };

const runtimeKey = Symbol.for('@usecharming/charming-cli-runtime');

export function currentDependencies(): Dependencies {
  return currentRuntime();
}

export function currentExitCode(): number | undefined {
  return currentRuntime().exitCode;
}

export function setExitCode(exitCode: number): void {
  currentRuntime().exitCode = exitCode;
}

export async function withRuntime<T>(
  dependencies: Dependencies,
  run: () => Promise<T>,
): Promise<T> {
  const global = globalThis as typeof globalThis & { [runtimeKey]?: Runtime };
  const previous = global[runtimeKey];
  global[runtimeKey] = { ...dependencies };
  try {
    return await run();
  } finally {
    global[runtimeKey] = previous;
  }
}

function currentRuntime(): Runtime {
  const global = globalThis as typeof globalThis & { [runtimeKey]?: Runtime };
  return (global[runtimeKey] ??= {});
}
