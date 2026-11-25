# API reference: `@workfonic/mockclock`

Everything is exported from the package root. Types are bundled (`.d.ts` for ESM, `.d.cts` for CommonJS).

```ts
import { MockClock } from '@workfonic/mockclock';            // ESM
const { MockClock } = require('@workfonic/mockclock');       // CommonJS
```

## Inputs

### `DateInput`

`Date | number | string`. Strings must be ISO 8601 with `Z` or an offset: `2026-11-30T23:59:00Z`, `2026-11-30T23:59:00.123+05:30`, `2026-11-30T23:59:00-0500`. Digits beyond milliseconds are truncated. Offset-less strings throw `AmbiguousDateInputError`; impossible values (February 30, hour 24, second 60) throw `InvalidDateError`. Numbers must be whole, finite epoch milliseconds within the `Date` range.

### `TravelTarget`

`DateInput | { local: string | PlainDateTime; timeZone?: string; disambiguation?: Disambiguation }`. The local form is interpreted in `timeZone` (default: the clock's zone).

### `DurationLike`

`{ years?, months?, weeks?, days?, hours?, minutes?, seconds?, milliseconds? }`, whole numbers, one sign. Misspelled units throw with a suggestion (`day` → `days`). See [calendar-arithmetic.md](calendar-arithmetic.md).

## `class MockClock implements ClockLike`

### Constructor

`new MockClock(options?: MockClockOptions)`

| Option | Type | Default |
|---|---|---|
| `timeZone` | `string` | `'UTC'` |
| `now` | `TravelTarget` | none (real mode) |
| `frozen` | `boolean` | `false` |
| `overflow` | `'constrain' \| 'reject'` | `'constrain'` |
| `disambiguation` | `'compatible' \| 'earlier' \| 'later' \| 'reject'` | `'compatible'` |
| `realTime` | `() => number` | native `Date.now` captured at load |
| `historyLimit` | `number` | `500` |
| `scenario` | `ResolvedScenario` | set by `MockClock.scenario` |

### Reading

| Member | Returns |
|---|---|
| `now()` | `Date` (new object each call) |
| `nowMs()` | `number` |
| `toISOString()` | `string` (UTC) |
| `zoned(timeZone?)` | `ZonedDateTime` |
| `today(timeZone?)` | `PlainDate` |
| `realNowMs()` | real time from the real-time source |
| `state()` | `ClockState`: `{ mode, frozen, simulated, nowMs, now, realNowMs, realNow, offsetFromRealMs, timeZone, zoned }` |
| `mode` | `'real' \| 'running' \| 'frozen'` |
| `isFrozen()`, `isRunning()`, `isSimulated()` | `boolean` |
| `timeZone`, `overflow` | current settings |
| `history` | `readonly ClockChangeEvent[]`, oldest first |
| `scenario` | `ResolvedScenario \| undefined` |

### Changing

All return `this` for chaining. All accept an optional trailing `label` string, recorded on the change event.

| Method | Behaviour |
|---|---|
| `freeze(at?)` | Freeze at `at`, or at the current simulated time. |
| `resume()` | Run again from the frozen instant. No-op if running. |
| `set(at)` | Jump; keep frozen/running state. |
| `travel(target)` | Same as `set`, also takes `{ local, timeZone }`. |
| `travelBy(duration)` | Signed duration. |
| `advance(duration)` | Non-negative duration forward. |
| `rewind(duration)` | Non-negative duration backward. |
| `tick(ms)` | `advance({ milliseconds: ms })`. |
| `advanceTo(target)` | Throws `InvalidClockOperationError` if `target` is in the simulated past. |
| `rewindTo(target)` | Throws if `target` is in the simulated future. |
| `reset()` | Back to real time (running). History and listeners are kept. |
| `setTimeZone(zone)` | Change the arithmetic zone without moving time. |
| `clearHistory()` | Empty `history`. |

`peek(duration)` returns `now + duration` as a `Date` without moving.

### Events

`subscribe(listener): () => void`. Listeners receive `ClockChangeEvent` `{ action, fromMs, toMs, deltaMs, mode, label?, sequence }` after the state has changed. If a listener throws, the other listeners still run, the change is not rolled back, and the error (or an `AggregateError`) is rethrown to the caller.

### Snapshots

`toJSON(): ClockSnapshot` → `{ version: 1, mode, timeZone, simulatedMs, realAnchorMs }`. `MockClock.fromSnapshot(snapshot, options?)` validates and restores it; a running snapshot continues relative to real time.

### Scenarios

`MockClock.scenario(id, params?, options?)` returns a frozen clock at the scenario start in the scenario's zone. See [scenarios.md](scenarios.md).

## `ClockLike` and `systemClock`

```ts
interface ClockLike { now(): Date; nowMs(): number }
const systemClock: ClockLike; // real time
```

## Time zone functions

| Function | Description |
|---|---|
| `isValidTimeZone(zone)`, `assertTimeZone(zone)` | Validate with `Intl`. |
| `listTimeZones()` | `Intl.supportedValuesOf('timeZone')` (empty if unsupported). |
| `systemTimeZone()` | The runtime's zone. Never used implicitly. |
| `getOffsetMs(instant, zone)`, `formatOffset(ms)` | UTC offset. |
| `toZonedDateTime(instant, zone)` | `ZonedDateTime`: plain fields + `epochMs`, `timeZone`, `offsetMs`, `offset`, `dayOfWeek`, `iso`, `utc`, `date`. |
| `formatInTimeZone(instant, zone)` | ISO string with offset. |
| `localDate(instant, zone)` | `PlainDate`. |
| `resolveLocal(local, zone)` | `{ kind: 'unique' \| 'ambiguous' \| 'gap', instants, ... }`. |
| `fromLocal(local, zone, disambiguation?)` | Epoch ms. |
| `convertLocal(local, fromZone, toZone, disambiguation?)` | `ZonedDateTime` in `toZone`. |
| `compareAcrossTimeZones(instant, zones)` | `ZonedDateTime[]`. |
| `isSameLocalDate(a, b, zone)` | Same local calendar date. |
| `startOfLocalDay(date, zone)` | First instant of a local day. |
| `hoursInLocalDay(date, zone)` | Day length in hours. |
| `isDaylightSavingTime(instant, zone)` | Heuristic DST flag. |
| `timeZoneAbbreviation(instant, zone, locale?)` | e.g. `EST`, `GMT+5:30`. |
| `findTransitions(zone, start, end)` | `TimeZoneTransition[]`. |
| `transitionsInYear(zone, year)`, `nextTransition(zone, from)`, `previousTransition(zone, from)` | |
| `addDuration(instant, duration, { timeZone, overflow, disambiguation })` | The arithmetic used by `MockClock`. |

## Plain-date functions

`plainDate`, `plainTime`, `plainDateTime`, `parsePlainDate`, `parsePlainTime`, `parsePlainDateTime`, `formatPlainDate`, `formatPlainTime`, `formatPlainDateTime`, `isLeapYear`, `daysInMonth`, `daysInYear`, `addDays`, `addMonths`, `addYears`, `daysBetween`, `compareDates`, `isSameDate`, `isoDayOfWeek`, `startOfMonth`, `endOfMonth`, `isLastDayOfMonth`, `quarterOf`, `isWeekend`, `isBusinessDay`, `addBusinessDays`, `nextBusinessDay`, `previousBusinessDay`, `lastBusinessDayOfMonth`. Constants `MS_PER_SECOND`, `MS_PER_MINUTE`, `MS_PER_HOUR`, `MS_PER_DAY`.

## Duration functions

`normalizeDuration`, `negateDuration`, `isZeroDuration`, `hasCalendarUnits`, `parseIsoDuration`, `formatIsoDuration`, `describeDuration`, `DURATION_UNITS`.

## Instant functions

`toEpochMs(input, label?)`, `parseInstant(text, label?)`, `formatInstant(ms)`.

## Scenario registry

`SCENARIOS`, `SCENARIO_IDS`, `isScenarioId`, `listScenarios()`, `describeScenario(id)`, `resolveScenario(id, params?)`. Types `ScenarioId`, `ScenarioParams`, `ScenarioParamSpec`, `ResolvedScenario`, `ScenarioEvent`, `ScenarioSummary`.

## Errors

All extend `MockClockError` and carry a stable `code`:

| Class | `code` |
|---|---|
| `InvalidDateError` | `INVALID_DATE` |
| `AmbiguousDateInputError` | `AMBIGUOUS_DATE_INPUT` |
| `InvalidDurationError` | `INVALID_DURATION` |
| `InvalidTimeZoneError` | `INVALID_TIME_ZONE` |
| `NonexistentLocalTimeError` | `NONEXISTENT_LOCAL_TIME` |
| `AmbiguousLocalTimeError` | `AMBIGUOUS_LOCAL_TIME` |
| `CalendarOverflowError` | `CALENDAR_OVERFLOW` |
| `InvalidClockOperationError` | `INVALID_CLOCK_OPERATION` |
| `UnknownScenarioError` | `UNKNOWN_SCENARIO` |
| `InvalidScenarioParameterError` | `INVALID_SCENARIO_PARAMETER` |
| `InvalidSnapshotError` | `INVALID_SNAPSHOT` |

For `@workfonic/mockclock-node` see [node.md](node.md); for the CLI see [cli.md](cli.md).
