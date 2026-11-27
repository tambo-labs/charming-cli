import * as Effect from 'effect/Effect';

export function fromPromise<A>(
  run: (signal: AbortSignal) => PromiseLike<A>,
): Effect.Effect<A, unknown> {
  return Effect.tryPromise({ try: run, catch: (error) => error });
}

export function promiseFn<Args extends unknown[], A, E>(
  workflow: (...args: Args) => Effect.fn.Return<A, E>,
): (...args: Args) => Promise<A> {
  return (...args) => Effect.runPromise(Effect.gen(() => workflow(...args)));
}

export function toPromise<Args extends unknown[], A, E>(
  workflow: (...args: Args) => Effect.Effect<A, E>,
): (...args: Args) => Promise<A> {
  return (...args) => Effect.runPromise(workflow(...args));
}
