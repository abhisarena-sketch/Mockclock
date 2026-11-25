# Calendar arithmetic

MockClock never converts a month or a year to a fixed number of milliseconds. This page defines exactly what `advance`, `rewind`, `travelBy`, `peek` and `addDuration` do.

## Units

| Unit | Kind | Applied as |
|---|---|---|
| `years` | calendar | change the year of the local date |
| `months` | calendar | change the month of the local date |
| `weeks` | calendar | `7 × weeks` local calendar days |
| `days` | calendar | local calendar days |
| `hours`, `minutes`, `seconds`, `milliseconds` | exact | elapsed time (3 600 000, 60 000, 1 000, 1 ms) |

All values must be whole numbers. Use a smaller unit for fractions (`{ minutes: 90 }`, not `{ hours: 1.5 }`). Within one duration all non-zero components must have the same sign. `advance` and `rewind` accept only non-negative durations; `travelBy` accepts signed ones.

## Algorithm

Given an instant `t`, a duration `d`, a time zone `z`, an overflow policy and a disambiguation:

1. Read `t` as a local date and wall-clock time in `z`.
2. Add `d.years` to the year. If the day does not exist (February 29 in a common year), apply the overflow policy.
3. Add `d.months` to the month. If the day does not exist in the target month, apply the overflow policy.
4. Add `7 × d.weeks + d.days` calendar days.
5. Convert the new local date with the original wall-clock time back to an instant in `z`, using the disambiguation option if it falls in a DST gap or overlap.
6. Add `d.hours`, `d.minutes`, `d.seconds` and `d.milliseconds` as exact elapsed time.

Steps 1-5 are skipped if the duration has no calendar units. This is the same order and behaviour as `Temporal.ZonedDateTime.prototype.add`.

The time zone is the clock's `timeZone` option (default `UTC`). MockClock never uses the machine's time zone implicitly, so the same test gives the same answer on every computer.

## End-of-month policy

| Policy | Behaviour |
|---|---|
| `constrain` (default) | Clamp to the last day of the target month. |
| `reject` | Throw `CalendarOverflowError` with the offending date. |

```ts
new MockClock({ now: '2026-01-31T09:00:00Z', frozen: true }).advance({ months: 1 }); // 2026-02-28T09:00Z
new MockClock({ now: '2026-01-31T09:00:00Z', frozen: true, overflow: 'reject' }).advance({ months: 1 }); // throws
```

Worked examples (all `constrain`):

| Start | Duration | Result |
|---|---|---|
| 2026-01-31 | +1 month | 2026-02-28 |
| 2024-01-31 | +1 month | 2024-02-29 |
| 2026-01-31 | +2 months | 2026-03-31 |
| 2026-03-31 | +1 month | 2026-04-30 |
| 2026-03-31 | −1 month | 2026-02-28 |
| 2028-03-31 | −1 month | 2028-02-29 |
| 2024-02-29 | +1 year | 2025-02-28 |
| 2024-02-29 | +4 years | 2028-02-29 |
| 2000-02-29 | +100 years | 2100-02-28 (2100 is not a leap year) |
| 2024-01-31 | +1 year +1 month +1 day | 2025-03-01 (2025-01-31 → 2025-02-28 → 2025-03-01) |

### Month arithmetic is not associative

Adding one month twice is not the same as adding two months:

```ts
addMonths(addMonths(parsePlainDate('2026-01-31'), 1), 1); // 2026-03-28
addMonths(parsePlainDate('2026-01-31'), 2);               // 2026-03-31
```

For recurring schedules (billing, accrual) compute each occurrence from the **anchor**: `anchor + n months`. The `subscription-renewal` and `leave-accrual` scenarios do this.

## Days versus hours across DST

```ts
const clock = new MockClock({ timeZone: 'America/New_York', frozen: true });
clock.travel({ local: '2026-03-07T12:00' });
clock.peek({ days: 1 });   // 2026-03-08T12:00-04:00, 23 hours later
clock.peek({ hours: 24 }); // 2026-03-08T13:00-04:00, 24 hours later
```

Use calendar units for "same time tomorrow" rules and exact units for lifetimes (token TTLs, timeouts).

If the target wall-clock time does not exist (for example 02:30 on a spring-forward day), the `disambiguation` option decides the result; the default moves it forward by the length of the gap. See [timezones.md](timezones.md).

## Plain-date helpers

`addDays`, `addMonths`, `addYears`, `daysInMonth`, `daysInYear`, `isLeapYear`, `daysBetween`, `isoDayOfWeek`, `startOfMonth`, `endOfMonth`, `isLastDayOfMonth`, `quarterOf`, `isWeekend`, `isBusinessDay`, `addBusinessDays`, `nextBusinessDay`, `previousBusinessDay` and `lastBusinessDayOfMonth` work on `PlainDate` values (`{ year, month, day }`) and never involve a time zone. `parsePlainDate` rejects impossible dates such as `2026-02-30` instead of rolling them over the way `new Date()` does.
