/**
 * @workfonic/mockclock-node: Node.js integrations for MockClock.
 *
 * Importing this module has no side effects. Global patching only happens
 * when you call `installGlobalDate`, `withGlobalDate` or `installFakeTimers`.
 */
export {
  ambientClock,
  createDateFactory,
  createNowFunction,
  currentClock,
  hasAmbientClock,
  runWithClock,
} from './context.js';
export {
  GlobalPatchConflictError,
  installGlobalDate,
  isGlobalDateInstalled,
  restoreGlobalDate,
  withGlobalDate,
  type GlobalDateHandle,
  type InstallGlobalDateOptions,
} from './global-date.js';
export {
  installFakeTimers,
  linkTestFrameworkTimers,
  linkTimers,
  type FakeTimersClockLike,
  type FakeTimersHandle,
  type FakeTimersModuleLike,
  type InstallFakeTimersOptions,
  type TestFrameworkTimersLike,
  type TimerDriver,
  type TimerLink,
} from './timers.js';
export { setupMockClock, type MockClockTestContext, type SetupMockClockOptions, type TestHooks } from './test-helpers.js';
