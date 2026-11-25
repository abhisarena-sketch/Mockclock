/**
 * Quick start: the README example, with assertions.
 * Run: npx tsx examples/quick-start.ts (after `npm run build`)
 */
import assert from 'node:assert/strict';
import { MockClock } from '@workfonic/mockclock';

const clock = new MockClock(); // reads real time until you change it

clock.freeze('2026-11-30T23:59:00Z');
console.log('frozen  ', clock.now().toISOString());
assert.equal(clock.toISOString(), '2026-11-30T23:59:00.000Z');

clock.advance({ days: 2, hours: 3, minutes: 30 });
console.log('advanced', clock.toISOString());
assert.equal(clock.toISOString(), '2026-12-03T03:29:00.000Z');

clock.rewind({ days: 1 });
console.log('rewound ', clock.toISOString());
assert.equal(clock.toISOString(), '2026-12-02T03:29:00.000Z');

clock.set('2027-01-01T00:00:00Z');
console.log('set     ', clock.toISOString());

// Calendar months are real months, not 30-day blocks.
clock.set('2026-01-31T09:00:00Z').advance({ months: 1 });
console.log('Jan 31 + 1 month =', clock.toISOString());
assert.equal(clock.toISOString(), '2026-02-28T09:00:00.000Z');

clock.reset();
console.log('reset   ', clock.mode); // 'real'
assert.equal(clock.mode, 'real');
