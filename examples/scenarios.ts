/** Load a scenario and step through its events. */
import assert from 'node:assert/strict';
import { MockClock, listScenarios } from '@workfonic/mockclock';

console.log(`${listScenarios().length} scenarios: ${listScenarios().map((s) => s.id).join(', ')}\n`);

const clock = MockClock.scenario('billing-retry', { retryDays: [1, 3, 7], cancelAfterDays: 10 });
const s = clock.scenario!;
console.log(`${s.title}: starts frozen at ${s.startLocal}`);

const attempts: string[] = [];
for (const event of s.events) {
  if (event.atMs < clock.nowMs()) continue;
  clock.advanceTo(event.atMs, event.id);
  attempts.push(event.id);
  console.log(`  ${clock.zoned().iso}  ${event.label}`);
}
assert.deepEqual(attempts, ['retry-1', 'retry-2', 'retry-3', 'cancelled']);

// Scenarios are configurable and validated.
const leap = MockClock.scenario('leap-day', { year: 2032 });
leap.advance({ minutes: 1 });
assert.deepEqual(leap.today(), { year: 2032, month: 2, day: 29 });
assert.throws(() => MockClock.scenario('leap-day', { year: 2031 }), /not a leap year/);
console.log('\nleap-day 2032 reached', leap.today());
