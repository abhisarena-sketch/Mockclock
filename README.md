# MockClock

### Control time. Test anything.

[![CI](https://github.com/abhisarena-sketch/mockclock/actions/workflows/ci.yml/badge.svg)](https://github.com/abhisarena-sketch/mockclock/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

MockClock is a time simulation toolkit for developers and QA engineers, by Workfonic Labs. It lets you test code that depends on dates, time zones, schedules, subscriptions, billing cycles, expiry dates and payroll periods by moving an isolated clock, without touching your computer's system clock.

It ships as:

| Package | What it is |
|---|---|
| [`@workfonic/mockclock`](packages/core) | The SDK: isolated clocks, calendar-correct arithmetic, IANA time zones and DST, and 15 ready-made scenarios. Zero runtime dependencies. |
| [`@workfonic/mockclock-node`](packages/node) | Node.js integration: clock injection, per-request clocks via `AsyncLocalStorage`, an explicit and reversible global `Date` patch, and adapters for `@sinonjs/fake-timers` and Vitest/Jest timers. |
| [`@workfonic/mockclock-cli`](packages/cli) | The `mockclock` command: inspect time zones and DST, resolve scenarios, and simulate time with JSON output and optional session files. |
| [`apps/playground`](apps/playground) | An interactive Next.js playground built on the core package. |

> **Status:** 0.1.0, not yet published to npm. Install from source until the first release (see [Installation](#installation)).

---

## Why

Time-dependent bugs hide in the cases nobody waits for: the 31st of a month, February 29, the hour that does not exist when clocks spring forward, the invoice that becomes overdue at midnight in the customer's time zone rather than in UTC. Testing them usually means one of three bad options: changing the machine clock, sleeping in tests, or sprinkling `Date.now()` stubs that drift out of step with timers.

MockClock gives you a clock object you control:

- **Isolated.** Each `MockClock` is independent. Nothing global changes unless you explicitly ask for it.
- **Calendar-correct.** Months and years are calendar units with a documented end-of-month policy, never approximated as fixed milliseconds.
- **Time-zone aware.** Offsets come from the runtime's `Intl` data, including 30- and 45-minute zones. DST gaps and overlaps are detected and resolved explicitly.
- **Strict.** An instant without an offset (`2026-11-30T23:59:00`) is rejected instead of being silently read as UTC.
- **Scenario-driven.** Month-end, leap day, trial expiry, payroll cut-off, token expiry and more are one call away, configurable and defined in a single registry.

## Installation

Requires Node.js 20 or later.

Once published:

```bash
npm install --save-dev @workfonic/mockclock
npm install --save-dev @workfonic/mockclock-node   # optional Node.js integration
npm install --global @workfonic/mockclock-cli      # optional CLI
```

Until then, build from source:

```bash
git clone https://github.com/abhisarena-sketch/mockclock.git
cd mockclock
npm install
npm run build:packages
```

Contributors need Node.js 22.18+ for the development tooling (Vitest 5, tsup 9). The published packages target Node.js 20+, and CI checks them on Node 20.

## Quick start

```ts
import { MockClock } from '@workfonic/mockclock';

const clock = new MockClock();            // reads real time until you change it

clock.freeze('2026-11-30T23:59:00Z');
clock.now();                               // 2026-11-30T23:59:00.000Z

clock.advance({ days: 2, hours: 3, minutes: 30 });
clock.now();                               // 2026-12-03T03:29:00.000Z

clock.rewind({ days: 1 });                 // 2026-12-02T03:29:00.000Z
clock.set('2027-01-01T00:00:00Z');
clock.reset();                             // back to real time
```

Inject the clock into the code under test instead of calling `new Date()` inside it:

```ts
import { MockClock, systemClock, type ClockLike } from '@workfonic/mockclock';

class TrialService {
  constructor(private readonly clock: ClockLike = systemClock) {}
  isActive(endsAt: number) {
    return this.clock.nowMs() < endsAt;
  }
}

const clock = MockClock.scenario('trial-expiry');          // frozen one hour before the trial ends
const ends = clock.scenario!.events.find((e) => e.id === 'trial-ends')!.atMs;
const trials = new TrialService(clock);

trials.isActive(ends);   // true
clock.advanceTo(ends);
trials.isActive(ends);   // false
```

## API reference

The full reference is in [docs/api.md](docs/api.md). The main surface:

### `new MockClock(options?)`

| Option | Default | Meaning |
|---|---|---|
| `timeZone` | `'UTC'` | IANA zone for calendar arithmetic, `today()` and `zoned()`. Never inferred from the machine. |
| `now` | none | Start simulating at this instant (or `{ local, timeZone }`). Without it the clock reads real time. |
| `frozen` | `false` | Start frozen. With no `now`, freezes at the current real time. |
| `overflow` | `'constrain'` | End-of-month policy: `'constrain'` clamps Jan 31 + 1 month to Feb 28/29; `'reject'` throws. |
| `disambiguation` | `'compatible'` | How local times in DST gaps/overlaps resolve. |
| `historyLimit` | `500` | Change events kept in `clock.history`. |
| `realTime` | native `Date.now` | Real-time source, for testing MockClock itself. |

| Method | Description |
|---|---|
| `now()`, `nowMs()`, `toISOString()` | Current simulated time. `now()` returns a new `Date` every call. |
| `zoned(tz?)`, `today(tz?)` | Wall-clock reading and local calendar date in a zone. |
| `freeze(at?)`, `resume()` | Stop time (optionally at an instant); let it run again from where it stopped. |
| `set(at)`, `travel(target)` | Jump to an instant, or to `{ local: '2027-01-01T09:00', timeZone: 'Asia/Tokyo' }`. Keeps frozen/running state. |
| `advance(d)`, `rewind(d)`, `travelBy(d)`, `tick(ms)` | Move by a duration. `advance`/`rewind` take non-negative durations; `travelBy` takes a signed one. |
| `advanceTo(t)`, `rewindTo(t)` | Move to a target, refusing to go the wrong way. |
| `peek(d)` | Compute `now + d` without moving. |
| `reset()` | Return to real time. |
| `mode`, `isFrozen()`, `isRunning()`, `isSimulated()`, `state()` | Inspect the clock (`'real'`, `'running'` or `'frozen'`). |
| `subscribe(listener)`, `history` | Change events (`action`, `fromMs`, `toMs`, `deltaMs`, `label`). |
| `toJSON()`, `MockClock.fromSnapshot(s)` | Serialize and restore. |
| `MockClock.scenario(id, params?, options?)` | A frozen clock at a scenario's start; events in `clock.scenario`. |

Durations accept `years`, `months`, `weeks`, `days`, `hours`, `minutes`, `seconds` and `milliseconds` as whole numbers. ISO 8601 strings (`P1M2DT3H`) are supported through `parseIsoDuration`.

Also exported: time zone functions (`toZonedDateTime`, `fromLocal`, `resolveLocal`, `convertLocal`, `compareAcrossTimeZones`, `findTransitions`, `transitionsInYear`, `nextTransition`, `hoursInLocalDay`, `startOfLocalDay`, `isDaylightSavingTime`, `isSameLocalDate`), plain-date functions (`addMonths`, `addYears`, `addDays`, `daysInMonth`, `isLeapYear`, `addBusinessDays`, `lastBusinessDayOfMonth`, `quarterOf` and more), the scenario registry, and typed errors with stable `code` values.

## Calendar arithmetic

Calendar units are applied to the **local date in the clock's time zone**, in the order years, months, then weeks and days, keeping the wall-clock time. Hours and smaller are then added as exact elapsed time. This matches `Temporal.ZonedDateTime#add`.

| Start | Operation | Result | Why |
|---|---|---|---|
| 2026-01-31 | `+ { months: 1 }` | 2026-02-28 | day 31 does not exist; clamped (`overflow: 'constrain'`) |
| 2024-01-31 | `+ { months: 1 }` | 2024-02-29 | leap year |
| 2026-03-31 | `- { months: 1 }` | 2026-02-28 | same rule backwards |
| 2024-02-29 | `+ { years: 1 }` | 2025-02-28 | no Feb 29 in 2025 |
| 2026-01-31 | `+1 month`, then `+1 month` | 2026-03-28 | chaining is not the same as `+ { months: 2 }` (2026-03-31) |
| 2026-03-07 12:00 New York | `+ { days: 1 }` | 2026-03-08 12:00 EDT | 23 hours elapse (spring forward) |
| 2026-03-07 12:00 New York | `+ { hours: 24 }` | 2026-03-08 13:00 EDT | exactly 24 hours elapse |

With `overflow: 'reject'`, the first, third and fourth rows throw `CalendarOverflowError`. Details: [docs/calendar-arithmetic.md](docs/calendar-arithmetic.md).

## Time zone behaviour

MockClock distinguishes three kinds of value:

- **Instants**: an exact point in time (`Date`, epoch milliseconds, or an ISO string with `Z`/offset).
- **Local calendar dates and date-times**: `PlainDate` / `PlainDateTime`, with no zone. Not instants.
- **Zoned date-times**: an instant read in an IANA zone (`ZonedDateTime`, e.g. `2026-12-01T05:29:00+05:30`).

Offsets are read from `Intl.DateTimeFormat` for the given IANA zone, so they reflect the runtime's time zone database, including non-whole-hour zones such as `Asia/Kolkata` (+05:30), `Asia/Kathmandu` (+05:45) and `Australia/Lord_Howe` (30-minute DST).

When a local time is converted to an instant:

| `disambiguation` | Overlap (time happens twice, fall back) | Gap (time skipped, spring forward) |
|---|---|---|
| `compatible` (default) | earlier instant | shifted forward by the gap (02:30 → 03:30) |
| `earlier` | earlier instant | shifted backward by the gap (02:30 → 01:30) |
| `later` | later instant | shifted forward by the gap |
| `reject` | throws `AmbiguousLocalTimeError` | throws `NonexistentLocalTimeError` |

Use `resolveLocal()` to see which case applies. Local days that start after midnight (for example `America/Santiago` on its spring-forward day) are handled by `startOfLocalDay()`. Details: [docs/timezones.md](docs/timezones.md).

## Scenarios

```ts
const clock = MockClock.scenario('month-end');                       // 2026-11-30T23:59:00Z, frozen
const feb = MockClock.scenario('month-end', { year: 2027, month: 2, timeZone: 'Asia/Kolkata' });

for (const event of feb.scenario!.events) console.log(event.local, event.label);
```

| Id | Simulates |
|---|---|
| `month-end` | Last seconds of a month rolling into the next |
| `year-end` | December 31 into January 1 |
| `leap-day` | February 28 → 29 → March 1 in a leap year |
| `trial-expiry` | A trial ending N calendar days after sign-up |
| `subscription-renewal` | Anchor-based monthly/yearly renewals across short months |
| `payroll` | Cut-off N business days before pay day (last business day of the month) |
| `invoice-due` | Net-N invoice becoming overdue at the end of its due date |
| `quarter-close` | End of a fiscal quarter (configurable fiscal-year start) |
| `midnight-rollover` | Final second of a local day |
| `dst-transition` | Just before a spring-forward gap or fall-back overlap |
| `holiday-boundary` | Last business day before a holiday and weekend |
| `leave-accrual` | Monthly accrual of annual leave |
| `token-expiry` | Access-token `exp` with verifier leeway |
| `coupon-expiry` | Coupon valid through a local date |
| `billing-retry` | Failed payment retries, then cancellation |

Every scenario, parameter and default lives in one registry ([`scenarios.ts`](packages/core/src/scenarios.ts)). Parameters are validated; unknown parameters are errors. MockClock ships no public-holiday data: pass holidays as parameters. Details: [docs/scenarios.md](docs/scenarios.md).

## Node.js integration

```ts
import { runWithClock, ambientClock, withGlobalDate, installFakeTimers } from '@workfonic/mockclock-node';

// 1. Prefer injection. For deep call stacks, give each request or test its own ambient clock:
await runWithClock(clock, () => handler(req));        // code reads ambientClock.now()

// 2. Legacy code that calls new Date(): patch explicitly, restored even on throw.
await withGlobalDate(clock, async () => legacyJob());

// 3. Timers: drive @sinonjs/fake-timers (or Vitest/Jest timers) from the clock.
import * as FakeTimers from '@sinonjs/fake-timers';
const handle = installFakeTimers(clock, { implementation: FakeTimers });
clock.advance({ minutes: 5 });                         // fires due setTimeout/setInterval callbacks
handle.uninstall();
```

Nothing is patched on import. Global patches refuse to install twice, refuse to clobber a patch installed on top of them, and preserve `instanceof Date`, `Date.parse`, `Date.UTC` and subclassing. Details and limitations: [docs/node.md](docs/node.md).

## CLI

```bash
mockclock now
mockclock freeze 2026-11-30T23:59:00Z
mockclock advance --days 2 --hours 4
mockclock rewind --days 1
mockclock travel 2027-01-01T00:00:00Z
mockclock reset
mockclock scenarios
mockclock scenario month-end
mockclock timezone Asia/Kolkata
```

**State does not persist between commands unless you ask for it.** Each command is independent: `advance` starts from `--from <instant>` or the real time and prints the result. To keep simulated time across commands, pass `--session <file>` (or set `MOCKCLOCK_SESSION`); the clock is then stored in that JSON file:

```bash
export MOCKCLOCK_SESSION=.mockclock-session.json
mockclock freeze 2026-11-30T23:59:00Z
mockclock advance --days 2 --hours 4
mockclock now --json
```

The CLI only changes its own session file. It cannot change the time seen by other processes. Every command supports `--json`. Exit codes: `0` success, `1` runtime or session-file error, `2` invalid usage or input. Details: [docs/cli.md](docs/cli.md).

## Playground

```bash
npm install
npm run build:packages
npm run dev --workspace @workfonic/mockclock-playground   # http://localhost:3000
```

The playground (Next.js, Tailwind CSS, shadcn/ui-style components) shows real versus simulated time, simulation controls with the equivalent TypeScript, a scenario explorer, a time zone comparison, a DST explorer, an event timeline, and billing, trial, payroll and token demos. It imports `@workfonic/mockclock` directly; it has no simulation logic of its own, no backend and no analytics. `npm run build` produces a static site in `apps/playground/out`.

## Examples

Runnable, self-checking examples live in [`examples/`](examples): quick start, billing renewal with injection, time zones and DST, scenarios, legacy code with `withGlobalDate`, per-request clocks with `AsyncLocalStorage`, and fake timers. Run them all with:

```bash
npm run build:packages && npm run examples
```

## Architecture

```
packages/core    @workfonic/mockclock      pure TypeScript, no dependencies, no Node APIs
  ├─ calendar.ts      plain dates, month/year arithmetic, business days
  ├─ instant.ts       strict instant parsing
  ├─ duration.ts      duration validation, ISO 8601 durations
  ├─ timezone.ts      Intl-based offsets, conversion, DST transitions, addDuration
  ├─ clock.ts         MockClock
  └─ scenarios.ts     the scenario registry
packages/node    @workfonic/mockclock-node  depends on core; AsyncLocalStorage, Date patch, timer adapters
packages/cli     @workfonic/mockclock-cli   depends on core; node:util parseArgs, session files
apps/playground  Next.js static site        depends on core only
```

Key decisions are recorded in [docs/architecture.md](docs/architecture.md): dependency injection first, no custom timer engine, Temporal-compatible arithmetic without a Temporal dependency, explicit CLI persistence.

## Limitations

- MockClock does not and cannot change the operating system clock, other processes, worker threads, child processes, native addons or remote services.
- The global `Date` patch affects the current JavaScript realm only. `performance.now()`, `process.hrtime()` and `Intl` APIs that read the system time internally are not patched.
- Time zone data comes from the runtime (`Intl`). Different Node.js or browser versions can disagree about historical or future rule changes.
- `resolveLocal`/`fromLocal` assume at most one offset transition within ±24 hours of the local time, and `findTransitions` assumes transitions are at least 6 hours apart. Both hold for the current IANA database.
- `isDaylightSavingTime` is a heuristic (offset greater than the smaller of the January and July offsets).
- Leap seconds are not modelled (like JavaScript `Date`). Sub-millisecond precision is truncated.
- Only the ISO 8601 (Gregorian) calendar is supported; years 1 to 9999 for plain dates.
- During a forward `advance` with linked fake timers, MockClock reports the destination time while intermediate timers fire; timer callbacks should read the faked `Date.now()` for their own scheduled time.

## Security

MockClock makes no network requests, collects no data, has no telemetry and uses no `eval` or `Function` (enforced by lint). The core has no runtime dependencies. Global patching is opt-in and reversible. The playground disables Next.js telemetry in its scripts. See [SECURITY.md](SECURITY.md) to report a vulnerability.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, the test layout and conventions, and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Questions go to [SUPPORT.md](SUPPORT.md).

```bash
npm install
npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e
```

## Roadmap

- Publish 0.1.0 to npm.
- Deploy the playground as a static site.
- Optional `Temporal` interop (`Temporal.Instant` / `ZonedDateTime` inputs and outputs) once Temporal ships in Node.js LTS.
- Browser test-runner integrations (Playwright `page.clock`, Cypress `cy.clock`) as adapters.
- Recurrence helpers (cron-like schedules evaluated against a MockClock).
- More scenarios (end-of-trading-day, school terms, tax-year boundaries), contributed through the registry.

## License

[MIT](LICENSE) © Workfonic Labs
