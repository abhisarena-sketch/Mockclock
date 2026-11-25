import type { ClockLike } from '@workfonic/mockclock';
import { assertClockLike } from './context.js';

/**
 * Shared across every copy of this package loaded in the realm, so two
 * versions of MockClock cannot both patch `Date` at once.
 */
const REGISTRY_KEY = Symbol.for('workfonic.mockclock.globalDate');

interface Registry {
  handle: GlobalDateHandle;
  original: DateConstructor;
  patched: DateConstructor;
  target: typeof globalThis;
}

type GlobalWithRegistry = typeof globalThis & { [REGISTRY_KEY]?: Registry };

export class GlobalPatchConflictError extends Error {
  readonly code = 'GLOBAL_PATCH_CONFLICT';
  constructor(message: string) {
    super(message);
    this.name = 'GlobalPatchConflictError';
  }
}

export interface GlobalDateHandle {
  /** Restore the original `Date`. Safe to call more than once. */
  uninstall(): void;
  /** False after `uninstall()`. */
  readonly active: boolean;
  /** The `Date` constructor that was replaced. */
  readonly originalDate: DateConstructor;
}

export interface InstallGlobalDateOptions {
  /** Object whose `Date` is patched. Default `globalThis`. Exposed for testing. */
  readonly target?: typeof globalThis;
}

/** Whether a MockClock global `Date` patch is currently installed on `target`. */
export function isGlobalDateInstalled(target: typeof globalThis = globalThis): boolean {
  return (target as GlobalWithRegistry)[REGISTRY_KEY] !== undefined;
}

/**
 * Replace the global `Date` so that `Date.now()`, `new Date()` and `Date()`
 * read from `clock`. Everything else (`new Date(value)`, `Date.parse`,
 * `Date.UTC`, `instanceof Date`, prototype methods) behaves as native.
 *
 * Nothing is patched on import. Call this explicitly, and always restore with
 * the returned handle (or use {@link withGlobalDate}, which restores even if
 * the callback throws).
 *
 * Limitations: affects only the current JavaScript realm. Worker threads,
 * child processes, `vm` contexts, native addons, `performance.now()`,
 * `process.hrtime()` and the operating-system clock are not affected.
 *
 * @throws {GlobalPatchConflictError} if another MockClock patch is already installed.
 */
export function installGlobalDate(clock: ClockLike, options: InstallGlobalDateOptions = {}): GlobalDateHandle {
  assertClockLike(clock);
  const target = (options.target ?? globalThis) as GlobalWithRegistry;
  const existing = target[REGISTRY_KEY];
  if (existing) {
    throw new GlobalPatchConflictError(
      'A MockClock global Date patch is already installed. Uninstall it first; only one clock can own the global Date at a time.',
    );
  }
  const original = target.Date;
  if (typeof original !== 'function' || typeof original.now !== 'function') {
    throw new GlobalPatchConflictError('globalThis.Date is not a Date constructor; refusing to patch');
  }

  const now = function now(): number {
    return clock.nowMs();
  };

  const patched: DateConstructor = new Proxy(original, {
    construct(Target, args, newTarget): object {
      // new Date() with no arguments reads the clock; anything else is native.
      const actualArgs = args.length === 0 ? [clock.nowMs()] : args;
      return Reflect.construct(Target, actualArgs, newTarget === patched ? Target : newTarget);
    },
    apply() {
      // Date() called as a function returns a string for the current time.
      return new original(clock.nowMs()).toString();
    },
    get(Target, prop, receiver) {
      if (prop === 'now') return now;
      return Reflect.get(Target, prop, receiver === patched ? Target : receiver);
    },
  });

  let active = true;
  const handle: GlobalDateHandle = {
    get active() {
      return active;
    },
    originalDate: original,
    uninstall() {
      if (!active) return;
      if (target.Date !== patched) {
        // Someone replaced Date after us (for example a fake-timer library).
        // Restoring now would silently discard their patch, so refuse loudly.
        throw new GlobalPatchConflictError(
          'globalThis.Date was replaced by other code after MockClock patched it. Restore that patch first, then uninstall MockClock.',
        );
      }
      target.Date = original;
      delete target[REGISTRY_KEY];
      active = false;
    },
  };

  target.Date = patched;
  target[REGISTRY_KEY] = { handle, original, patched, target };
  return handle;
}

/**
 * Install the global `Date` patch for the duration of `fn` and always restore
 * it afterwards, including when `fn` throws or its promise rejects.
 *
 * Do not run several `withGlobalDate` calls concurrently: the global `Date`
 * is shared process state. Concurrent calls throw {@link GlobalPatchConflictError}.
 * For concurrent work, inject clocks or use `runWithClock` instead.
 */
export function withGlobalDate<T>(clock: ClockLike, fn: () => T, options: InstallGlobalDateOptions = {}): T {
  const handle = installGlobalDate(clock, options);
  let result: T;
  try {
    result = fn();
  } catch (error) {
    handle.uninstall();
    throw error;
  }
  if (result instanceof Promise) {
    return result.finally(() => handle.uninstall()) as T;
  }
  handle.uninstall();
  return result;
}

/**
 * Emergency restore: uninstall whatever MockClock patch is installed on
 * `target`. Intended for global test teardown (`afterAll`). Returns true if
 * something was restored.
 */
export function restoreGlobalDate(target: typeof globalThis = globalThis): boolean {
  const reg = (target as GlobalWithRegistry)[REGISTRY_KEY];
  if (!reg) return false;
  reg.handle.uninstall();
  return true;
}
