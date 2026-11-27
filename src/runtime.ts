import { AsyncLocalStorage } from 'node:async_hooks';

type Dependencies = {
  buildImpl?: () => void | Promise<void>;
  cwd?: string;
  fetchImpl?: typeof fetch;
};

type Runtime = Dependencies & { exitCode?: number };

const runtimeKey = Symbol.for('usecharming-command-invocations');
const global = globalThis as typeof globalThis & {
  [runtimeKey]?: { invocations: AsyncLocalStorage<Runtime>; fallback: Runtime };
};
const { invocations, fallback } = (global[runtimeKey] ??= {
  invocations: new AsyncLocalStorage<Runtime>(),
  fallback: {},
});

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
  return invocations.run({ ...dependencies }, run);
}

function currentRuntime(): Runtime {
  return invocations.getStore() ?? fallback;
}
