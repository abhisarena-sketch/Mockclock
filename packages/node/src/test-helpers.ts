import { MockClock, type MockClockOptions } from '@workfonic/mockclock';
import { installGlobalDate, type GlobalDateHandle } from './global-date.js';

export interface TestHooks {
  beforeEach(fn: () => void | Promise<void>): unknown;
  afterEach(fn: () => void | Promise<void>): unknown;
}

export interface SetupMockClockOptions extends MockClockOptions {
  /**
   * Also patch the global `Date` for each test. Default `false`: prefer
   * injecting `ctx.clock` into the code under test. Requires tests in the same
   * file to run sequentially (the Vitest and Jest default).
   */
  readonly patchGlobalDate?: boolean;
}

export interface MockClockTestContext {
  /** A fresh MockClock for the current test. Throws outside a test. */
  readonly clock: MockClock;
}

/**
 * Create a fresh MockClock before every test and clean it up after, for any
 * framework with `beforeEach`/`afterEach` (Vitest, Jest, Mocha, node:test).
 *
 * ```ts
 * import { beforeEach, afterEach } from 'vitest';
 * const ctx = setupMockClock({ beforeEach, afterEach }, { now: '2026-11-30T23:59:00Z', frozen: true });
 * it('renews', () => { ctx.clock.advance({ minutes: 1 }); ... });
 * ```
 */
export function setupMockClock(hooks: TestHooks, options: SetupMockClockOptions = {}): MockClockTestContext {
  if (typeof hooks?.beforeEach !== 'function' || typeof hooks.afterEach !== 'function') {
    throw new TypeError('setupMockClock expects an object with beforeEach and afterEach functions');
  }
  const { patchGlobalDate = false, ...clockOptions } = options;
  let clock: MockClock | undefined;
  let handle: GlobalDateHandle | undefined;

  hooks.beforeEach(() => {
    clock = new MockClock(clockOptions);
    if (patchGlobalDate) handle = installGlobalDate(clock);
  });
  hooks.afterEach(() => {
    try {
      handle?.uninstall();
    } finally {
      handle = undefined;
      clock = undefined;
    }
  });

  return {
    get clock(): MockClock {
      if (!clock) throw new Error('ctx.clock is only available inside a test (after beforeEach has run)');
      return clock;
    },
  };
}
