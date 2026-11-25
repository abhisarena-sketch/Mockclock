/**
 * Inject a clock into a service instead of calling `new Date()` inside it.
 * The production code receives `systemClock`; tests receive a MockClock.
 */
import assert from 'node:assert/strict';
import { MockClock, addMonths, fromLocal, parsePlainDate, plainDateTime, type ClockLike, type PlainDate } from '@workfonic/mockclock';

class BillingService {
  constructor(
    private readonly clock: ClockLike,
    private readonly timeZone: string,
  ) {}

  /** Renewal n is anchor + n months (never chained), at 09:00 local time. */
  renewalAt(anchor: PlainDate, n: number): number {
    return fromLocal(plainDateTime(addMonths(anchor, n), { hour: 9 }), this.timeZone);
  }

  /** How many renewals are due by now. */
  renewalsDue(anchor: PlainDate): number {
    let n = 0;
    while (this.renewalAt(anchor, n + 1) <= this.clock.nowMs()) n++;
    return n;
  }
}

const anchor = parsePlainDate('2026-01-31');
const clock = new MockClock({ timeZone: 'Europe/London', frozen: true });
clock.travel({ local: '2026-01-31T09:00' });
const billing = new BillingService(clock, 'Europe/London');

const seen: string[] = [];
for (let month = 1; month <= 4; month++) {
  clock.advanceTo(billing.renewalAt(anchor, month));
  seen.push(clock.zoned().iso);
  assert.equal(billing.renewalsDue(anchor), month);
}
console.log('Renewals for a Jan 31 anchor:');
for (const s of seen) console.log('  ', s);

// February is clamped to the 28th; March returns to the 31st; BST starts in late March.
assert.deepEqual(seen, [
  '2026-02-28T09:00:00+00:00',
  '2026-03-31T09:00:00+01:00',
  '2026-04-30T09:00:00+01:00',
  '2026-05-31T09:00:00+01:00',
]);
