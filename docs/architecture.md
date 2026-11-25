# Architecture and design decisions

## Layout

```
mockclock/
├── packages/
│   ├── core/        @workfonic/mockclock        SDK. No runtime dependencies, no Node.js APIs.
│   ├── node/        @workfonic/mockclock-node   Node.js integration. Depends on core.
│   └── cli/         @workfonic/mockclock-cli    `mockclock` binary. Depends on core.
├── apps/playground/ Next.js static site. Depends on core only.
├── examples/        Self-checking examples run in CI against the built packages.
├── tests/e2e/       Tests of the built output: ESM/CJS imports, CLI binary, examples, packaging, docs.
├── docs/            Reference documentation.
└── scripts/         Build, packaging and docs-generation helpers.
```

Unit tests live next to each package (`packages/*/test`) and run against TypeScript sources through Vitest aliases, so `npm test` needs no build. End-to-end tests (`npm run test:e2e`) run against `dist/`.

## Core modules

| Module | Responsibility |
|---|---|
| `errors.ts` | Error classes with stable `code` values. |
| `calendar.ts` | `PlainDate`/`PlainTime`/`PlainDateTime`, validation, month/year arithmetic with overflow policy, business days. Pure arithmetic, no zones. |
| `instant.ts` | Strict parsing of instants. Rejects offset-less strings. |
| `duration.ts` | Duration validation, ISO 8601 durations. |
| `timezone.ts` | Intl-backed offsets, `ZonedDateTime`, local-time resolution, transitions, `addDuration`. |
| `clock.ts` | `MockClock`, `ClockLike`, `systemClock`, snapshots, events. |
| `scenarios.ts` | The scenario registry and its parameter validation. |

Dependencies flow one way: `calendar`/`errors` ← `instant`/`duration` ← `timezone` ← `scenarios` ← `clock`.

## Decisions

### Dependency injection first, global patching last

Most time bugs are easier to test, and safe to test in parallel, when code receives a clock. `ClockLike` is a two-method interface so application code does not depend on MockClock at all. Global `Date` patching exists for legacy code, is opt-in, refuses to stack, and restores in `finally`.

### A clock is an anchor, not a timer

A `MockClock` stores an anchor (simulated instant at a real instant) and whether it is frozen. `now()` is derived on read. There is no interval or background work, so clocks cost nothing when idle and cannot leak timers.

The real-time source is the native `Date.now` captured when the core module loads, so patching `Date` cannot feed simulated time back into the clock.

### Temporal semantics without a Temporal dependency

Calendar arithmetic and disambiguation follow `Temporal.ZonedDateTime` (calendar units on the local date, then exact time; `compatible`/`earlier`/`later`/`reject`). Temporal is not yet available in all supported Node.js versions and its polyfills are large, so the core implements the needed subset on top of `Intl.DateTimeFormat`. Results are designed to match Temporal so a future interop layer is straightforward.

### No invented offsets

Offsets are always computed from `Intl` for the requested IANA zone. There are no offset tables or whole-hour assumptions. DST transitions are discovered by scanning offsets, not hard-coded.

### No custom timer engine

Faking `setTimeout` correctly (ordering, nested timers, intervals, `setImmediate`, microtasks) is a solved problem. MockClock adapts to `@sinonjs/fake-timers` and to Vitest/Jest timers through a two-method `TimerDriver` interface instead of competing with them.

### One scenario registry

Scenario definitions, parameter types, ranges, defaults and descriptions live in one `SCENARIOS` object. The CLI, the playground and `docs/scenarios.md` (generated, checked in CI) all read from it.

### Explicit CLI persistence

A CLI process cannot keep a clock alive after it exits, and pretending otherwise would mislead. Without `--session` every command is stateless and says so; with it, state lives in a JSON file the user chose.

### Strict input

`new Date('2026-11-30')` is UTC midnight while `new Date('2026-11-30T00:00')` is local midnight, and `new Date('2026-02-30')` silently becomes March 2. MockClock rejects offset-less instants and impossible dates with errors that explain the fix.

### Packaging

- tsup builds ESM and CommonJS for core and node (CLI is ESM-only, as it is a binary), with `.d.ts`/`.d.cts` types and source maps.
- `exports` maps separate `import` and `require` conditions with their own type files.
- `sideEffects: false` and a single flat entry point keep the core tree-shakeable.
- Published packages declare `engines.node >= 20`; development tooling requires Node.js 22.18+.
