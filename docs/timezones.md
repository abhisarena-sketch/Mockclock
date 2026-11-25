# Time zones and DST

## Three kinds of value

| Kind | Type | Example | Notes |
|---|---|---|---|
| Instant | `Date`, `number` (epoch ms), ISO string with offset | `2026-11-30T23:59:00Z` | An exact point in time. The only thing a `MockClock` stores. |
| Local date / date-time | `PlainDate`, `PlainDateTime`, offset-less string | `2026-03-08T02:30` | A wall-clock reading with no zone. Not an instant. |
| Zoned date-time | `ZonedDateTime` | `2026-12-01T05:29:00+05:30` + `Asia/Kolkata` | An instant read in a zone. |

Wherever MockClock needs an instant, a string must include `Z` or an offset. `'2026-11-30T23:59:00'` and `'2026-11-30'` throw `AmbiguousDateInputError` (code `AMBIGUOUS_DATE_INPUT`); they are never silently read as UTC or as machine-local time. To use a local time, say which zone it is in:

```ts
clock.travel({ local: '2026-11-30T23:59', timeZone: 'Asia/Kolkata' });
fromLocal('2026-11-30T23:59', 'Asia/Kolkata');
```

## Where offsets come from

`getOffsetMs(instant, zone)` formats the instant with `Intl.DateTimeFormat` in that zone and compares the wall-clock fields with UTC. Offsets are therefore exactly what the runtime's time zone database says, including:

- 30- and 45-minute offsets (`Asia/Kolkata` +05:30, `Asia/Kathmandu` +05:45, `Pacific/Chatham` +12:45),
- 30-minute DST shifts (`Australia/Lord_Howe`),
- southern-hemisphere DST (`Australia/Sydney`),
- historical offsets with seconds (formatted as `-04:56:02`).

MockClock contains no offset tables. Zone names are validated with `Intl`; unknown zones throw `InvalidTimeZoneError`.

## Converting local times: gaps and overlaps

`resolveLocal(local, zone)` reports one of:

- `unique`: the local time maps to exactly one instant.
- `ambiguous`: it happens twice (clocks went back). `instants` holds both, earlier first.
- `gap`: it does not exist (clocks jumped forward). `gapMs` is the length of the gap.

`fromLocal(local, zone, disambiguation)` turns it into one instant:

| `disambiguation` | Overlap | Gap |
|---|---|---|
| `compatible` (default) | earlier | later: wall time + gap length |
| `earlier` | earlier | earlier: wall time − gap length |
| `later` | later | later |
| `reject` | `AmbiguousLocalTimeError` | `NonexistentLocalTimeError` |

Example, `America/New_York` 2026:

| Local time | Kind | `compatible` | `earlier` | `later` |
|---|---|---|---|---|
| 2026-03-08 02:30 | gap (1 h) | 03:30 −04:00 | 01:30 −05:00 | 03:30 −04:00 |
| 2026-11-01 01:30 | overlap | 01:30 −04:00 | 01:30 −04:00 | 01:30 −05:00 |

This is the same as `Temporal`'s `disambiguation` option and the behaviour most calendar applications use by default.

## Transitions

```ts
transitionsInYear('America/New_York', 2026);
// [{ iso: '2026-03-08T07:00:00.000Z', kind: 'gap', offsetBefore: '-05:00', offsetAfter: '-04:00', localBefore: '2026-03-08T01:59:59.999', localAfter: '2026-03-08T03:00:00' },
//  { iso: '2026-11-01T06:00:00.000Z', kind: 'overlap', ... }]
nextTransition('Europe/London', '2026-01-01T00:00:00Z');     // 2026-03-29T01:00:00.000Z
findTransitions(zone, start, end);
```

Transitions are found by sampling offsets every 6 hours and binary-searching each change to the second. Two transitions less than 6 hours apart would be missed; none exist in the current IANA database. Searches are limited to 200 years.

## Days and midnight

- `startOfLocalDay(date, zone)`: first instant of a local day. Usually midnight; on days where midnight is skipped (for example `America/Santiago` on 2026-09-06) it is 01:00.
- `hoursInLocalDay(date, zone)`: 24, or 23/25 on DST days (23.5 for Lord Howe).
- `isSameLocalDate(a, b, zone)`: compare dates as a user in that zone sees them. `2026-11-30T18:29:59Z` and `18:30:00Z` are the same UTC date but different dates in `Asia/Kolkata`.
- `localDate(instant, zone)`, `toZonedDateTime(instant, zone)`, `convertLocal(local, fromZone, toZone)`, `compareAcrossTimeZones(instant, zones)`.

## DST flag

`isDaylightSavingTime(instant, zone)` returns true when the offset is greater than the smaller of the January 1 and July 1 offsets of that year. This works for ordinary northern and southern hemisphere rules but can misreport zones that changed their standard offset during the year.

## Assumptions

- `resolveLocal` samples offsets one day either side of the local time, so it assumes at most one transition within ±24 hours.
- Results depend on the runtime's ICU data. Node.js updates it regularly; very old runtimes may have outdated rules for zones that changed recently.
