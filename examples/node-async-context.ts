/** Per-request clocks with AsyncLocalStorage: concurrent work never shares a clock. */
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { MockClock } from '@workfonic/mockclock';
import { ambientClock, runWithClock } from '@workfonic/mockclock-node';

// A service that was written against `ambientClock` once, at start-up.
const audit = {
  async record(event: string) {
    await sleep(5);
    return `${ambientClock.now().toISOString()} ${event}`;
  },
};

const tokyoMonthEnd = MockClock.scenario('month-end', { timeZone: 'Asia/Tokyo' });
const leapDay = MockClock.scenario('leap-day');

const [a, b] = await Promise.all([
  runWithClock(tokyoMonthEnd, () => audit.record('close books')),
  runWithClock(leapDay, () => audit.record('accrue interest')),
]);
console.log(a);
console.log(b);
assert.equal(a, '2026-11-30T14:59:00.000Z close books');
assert.equal(b, '2028-02-28T23:59:00.000Z accrue interest');
