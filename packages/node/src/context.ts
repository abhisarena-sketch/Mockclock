import { AsyncLocalStorage } from 'node:async_hooks';
import { systemClock, type ClockLike } from '@workfonic/mockclock';

const storage = new AsyncLocalStorage<ClockLike>();

/**
 * Run `fn` with `clock` as the ambient clock for everything it calls,
 * including across `await`, timers and promise callbacks started inside it
 * (via `AsyncLocalStorage`). Other concurrent async work is unaffected, so
 * parallel tests or requests can each use their own clock.
 *
 * ```ts
 * await runWithClock(clock, () => app.handleRequest(req));
 * ```
 */
export function runWithClock<T>(clock: ClockLike, fn: () => T): T {
  assertClockLike(clock);
  return storage.run(clock, fn);
}

/** The ambient clock set by {@link runWithClock}, or the real system clock. */
export function currentClock(): ClockLike {
  return storage.getStore() ?? systemClock;
}

/** Whether code is currently running inside {@link runWithClock}. */
export function hasAmbientClock(): boolean {
  return storage.getStore() !== undefined;
}

/**
 * A `ClockLike` that always delegates to {@link currentClock}. Inject it into
 * long-lived services once; each call reads whichever clock is ambient.
 */
export const ambientClock: ClockLike = Object.freeze({
  now: () => currentClock().now(),
  nowMs: () => currentClock().nowMs(),
});

/** A `Date.now`-compatible function bound to a clock, for code that accepts a `now` callback. */
export function createNowFunction(clock: ClockLike): () => number {
  assertClockLike(clock);
  return () => clock.nowMs();
}

/**
 * A `new Date()` replacement bound to a clock. With no arguments it returns the
 * clock's time; with arguments it behaves exactly like `new Date(...args)`.
 */
export function createDateFactory(clock: ClockLike): (...args: ConstructorParameters<DateConstructor> | []) => Date {
  assertClockLike(clock);
  const NativeDate = Date;
  return (...args) => (args.length === 0 ? new NativeDate(clock.nowMs()) : new NativeDate(...(args as [number])));
}

export function assertClockLike(clock: unknown): asserts clock is ClockLike {
  if (
    clock === null ||
    typeof clock !== 'object' ||
    typeof (clock as ClockLike).now !== 'function' ||
    typeof (clock as ClockLike).nowMs !== 'function'
  ) {
    throw new TypeError('Expected a clock with now() and nowMs() methods (for example a MockClock)');
  }
}
