/**
 * Legacy code that calls `new Date()` directly can be tested with an explicit,
 * reversible global patch. Prefer injection for new code.
 */
import assert from 'node:assert/strict';
import { MockClock } from '@workfonic/mockclock';
import { isGlobalDateInstalled, withGlobalDate } from '@workfonic/mockclock-node';

function isCouponValid(validThrough: string): boolean {
  // legacy: reads the global clock
  return new Date().toISOString().slice(0, 10) <= validThrough;
}

const clock = new MockClock({ now: '2026-12-31T23:59:59Z', frozen: true });

withGlobalDate(clock, () => {
  assert.equal(isCouponValid('2026-12-31'), true);
  clock.advance({ seconds: 1 });
  assert.equal(isCouponValid('2026-12-31'), false);
  console.log('inside withGlobalDate, Date.now() =', new Date(Date.now()).toISOString());
});

// Restored, even if the callback had thrown.
assert.equal(isGlobalDateInstalled(), false);
assert.ok(new Date().getUTCFullYear() < 2100);
console.log('after withGlobalDate, real Date restored:', new Date().toISOString());

try {
  withGlobalDate(clock, () => {
    throw new Error('test failure inside the patch');
  });
} catch (error) {
  console.log('callback threw:', (error as Error).message, '| still restored:', !isGlobalDateInstalled());
  assert.equal(isGlobalDateInstalled(), false);
}
