/** Time zone conversion, DST gaps and overlaps. */
import assert from 'node:assert/strict';
import {
  MockClock,
  compareAcrossTimeZones,
  fromLocal,
  hoursInLocalDay,
  resolveLocal,
  toZonedDateTime,
  transitionsInYear,
} from '@workfonic/mockclock';

// One instant, five wall clocks.
for (const z of compareAcrossTimeZones('2026-11-30T23:59:00Z', ['Asia/Kolkata', 'America/New_York', 'Europe/London', 'Asia/Tokyo', 'Australia/Sydney'])) {
  console.log(z.timeZone.padEnd(18), z.iso);
}

const ny = 'America/New_York';
const [spring, fall] = transitionsInYear(ny, 2026);
console.log(`\n${ny} springs forward at ${spring!.iso} and falls back at ${fall!.iso}`);
assert.equal(hoursInLocalDay('2026-03-08', ny), 23);
assert.equal(hoursInLocalDay('2026-11-01', ny), 25);

// 02:30 on 8 March does not exist in New York.
const gap = resolveLocal('2026-03-08T02:30', ny);
assert.equal(gap.kind, 'gap');
console.log('02:30 on spring-forward day:', gap.kind, '->', toZonedDateTime(fromLocal('2026-03-08T02:30', ny), ny).iso);

// 01:30 on 1 November happens twice.
const overlap = resolveLocal('2026-11-01T01:30', ny);
assert.equal(overlap.kind, 'ambiguous');
console.log('01:30 on fall-back day: earlier', toZonedDateTime(fromLocal('2026-11-01T01:30', ny, 'earlier'), ny).iso, 'later', toZonedDateTime(fromLocal('2026-11-01T01:30', ny, 'later'), ny).iso);

// A daily job at 12:00 keeps its wall-clock time across DST; 24 hours does not.
const clock = new MockClock({ timeZone: ny, frozen: true });
clock.travel({ local: '2026-03-07T12:00' });
const a = clock.peek({ days: 1 });
const b = clock.peek({ hours: 24 });
console.log('\n+1 day  :', toZonedDateTime(a, ny).iso);
console.log('+24 hours:', toZonedDateTime(b, ny).iso);
assert.equal(toZonedDateTime(a, ny).hour, 12);
assert.equal(toZonedDateTime(b, ny).hour, 13);
