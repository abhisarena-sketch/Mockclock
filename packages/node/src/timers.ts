import type { ClockChangeEvent, MockClock } from '@workfonic/mockclock';

/**
 * MockClock does not implement its own timer queue. Instead it drives an
 * established fake-timer implementation through this small interface.
 */
export interface TimerDriver {
  /** Fire due timers while moving fake time forward by `ms`. */
  tick(ms: number): void;
  /** Jump fake time without firing timers (used when MockClock moves backwards). */
  setSystemTime(ms: number): void;
}

export interface TimerLink {
  /** Stop forwarding clock changes to the timer driver. Does not uninstall the driver. */
  unlink(): void;
  readonly linked: boolean;
}

function requireFrozen(clock: MockClock, what: string): void {
  if (!clock.isFrozen()) {
    throw new Error(
      `${what} requires a frozen MockClock so that time only moves when you move it. Call clock.freeze() first.`,
    );
  }
}

/**
 * Forward every MockClock change to a {@link TimerDriver}: moving forward fires
 * due timers in order; moving backward (rewind, earlier `set`/`travel`, `reset`
 * to an earlier real time) moves fake time without firing anything.
 *
 * During a forward move, MockClock already reports the destination time while
 * the driver fires intermediate timers. Timer callbacks that need the time at
 * which they were scheduled should read the faked `Date.now()`.
 */
export function linkTimers(clock: MockClock, driver: TimerDriver): TimerLink {
  requireFrozen(clock, 'linkTimers');
  driver.setSystemTime(clock.nowMs());
  let position = clock.nowMs();
  let syncing = false;
  let linked = true;

  const sync = () => {
    if (syncing) return; // re-entrant change from a timer callback: handled by the loop below
    syncing = true;
    try {
      // Loop because timer callbacks may move the clock again.
      for (let guard = 0; guard < 10_000; guard++) {
        const target = clock.nowMs();
        if (target === position) return;
        const from = position;
        position = target;
        if (target > from) driver.tick(target - from);
        else driver.setSystemTime(target);
      }
      throw new Error('linkTimers: timer callbacks kept moving the clock (more than 10,000 re-entrant changes)');
    } finally {
      syncing = false;
    }
  };

  const off = clock.subscribe((_e: ClockChangeEvent) => sync());
  return {
    get linked() {
      return linked;
    },
    unlink() {
      if (!linked) return;
      off();
      linked = false;
    },
  };
}

// ------------------------------------------------------------------ @sinonjs/fake-timers

/** The parts of `@sinonjs/fake-timers` used by {@link installFakeTimers}. */
export interface FakeTimersModuleLike {
  withGlobal(global: object): {
    // `any` keeps this structurally compatible with every @sinonjs/fake-timers
    // version's own Config type; installFakeTimers passes { now, toFake, shouldClearNativeTimers }.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    install(config: any): FakeTimersClockLike;
  };
}

export interface FakeTimersClockLike {
  now: number;
  tick(ms: number): number;
  setSystemTime(now: number): void;
  uninstall(): unknown;
  countTimers?(): number;
}

export interface InstallFakeTimersOptions {
  /** The `@sinonjs/fake-timers` module, passed in so MockClock has no hard dependency on it. */
  readonly implementation: FakeTimersModuleLike;
  /** Which globals to fake. Default: timers and `Date`. */
  readonly toFake?: string[];
  /** Global object to install into. Default `globalThis`. */
  readonly target?: object;
}

export interface FakeTimersHandle {
  /** The underlying `@sinonjs/fake-timers` clock (for `countTimers()`, `runAll()` and so on). */
  readonly timers: FakeTimersClockLike;
  /** Stop syncing and restore the real timers and `Date`. Safe to call more than once. */
  uninstall(): void;
}

const DEFAULT_TO_FAKE = ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'Date'];

/**
 * Install `@sinonjs/fake-timers` and keep it in step with a frozen MockClock.
 * Advancing the MockClock fires due `setTimeout`/`setInterval` callbacks.
 *
 * ```ts
 * import * as FakeTimers from '@sinonjs/fake-timers';
 * const handle = installFakeTimers(clock, { implementation: FakeTimers });
 * try { clock.advance({ minutes: 5 }); } finally { handle.uninstall(); }
 * ```
 *
 * Do not combine with `installGlobalDate`: both replace the global `Date`.
 */
export function installFakeTimers(clock: MockClock, options: InstallFakeTimersOptions): FakeTimersHandle {
  if (!options?.implementation || typeof options.implementation.withGlobal !== 'function') {
    throw new TypeError(
      'installFakeTimers needs { implementation }: pass the @sinonjs/fake-timers module (import * as FakeTimers from "@sinonjs/fake-timers")',
    );
  }
  requireFrozen(clock, 'installFakeTimers');
  const timers = options.implementation.withGlobal(options.target ?? globalThis).install({
    now: clock.nowMs(),
    toFake: options.toFake ?? DEFAULT_TO_FAKE,
    shouldClearNativeTimers: true,
  });
  let link: TimerLink;
  try {
    link = linkTimers(clock, {
      tick: (ms) => {
        timers.tick(ms);
      },
      setSystemTime: (ms) => timers.setSystemTime(ms),
    });
  } catch (error) {
    timers.uninstall();
    throw error;
  }
  let installed = true;
  return {
    timers,
    uninstall() {
      if (!installed) return;
      installed = false;
      link.unlink();
      timers.uninstall();
    },
  };
}

// ------------------------------------------------------------------ Vitest / Jest

/** The parts of Vitest's `vi` or Jest's `jest` object used by {@link linkTestFrameworkTimers}. */
export interface TestFrameworkTimersLike {
  advanceTimersByTime(ms: number): unknown;
  setSystemTime(now: number | Date): unknown;
}

/**
 * Keep Vitest (`vi`) or Jest (`jest`) fake timers in step with a frozen
 * MockClock. Call `vi.useFakeTimers()` / `jest.useFakeTimers()` first.
 *
 * ```ts
 * vi.useFakeTimers();
 * const link = linkTestFrameworkTimers(clock, vi);
 * clock.advance({ seconds: 30 }); // fires timers scheduled within 30 s
 * link.unlink(); vi.useRealTimers();
 * ```
 */
export function linkTestFrameworkTimers(clock: MockClock, framework: TestFrameworkTimersLike): TimerLink {
  if (typeof framework?.advanceTimersByTime !== 'function' || typeof framework.setSystemTime !== 'function') {
    throw new TypeError('linkTestFrameworkTimers expects Vitest `vi` or Jest `jest`');
  }
  return linkTimers(clock, {
    tick: (ms) => {
      framework.advanceTimersByTime(ms);
    },
    setSystemTime: (ms) => {
      framework.setSystemTime(ms);
    },
  });
}
