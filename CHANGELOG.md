# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/). All three packages (`@workfonic/mockclock`, `@workfonic/mockclock-node`, `@workfonic/mockclock-cli`) are versioned together.

## [Unreleased]

## [0.1.0] - 2026-11-25

First public release candidate. Not yet published to npm.

### Added

- `@workfonic/mockclock` (core, zero runtime dependencies):
  - `MockClock` with `now`, `freeze`, `resume`, `set`, `travel`, `travelBy`, `advance`, `rewind`, `advanceTo`, `rewindTo`, `tick`, `peek`, `reset`, `state`, change events, bounded history and JSON snapshots.
  - Calendar-correct duration arithmetic for milliseconds through years. Calendar units are applied in the clock's IANA time zone; end-of-month overflow is `constrain` (default) or `reject`.
  - Strict input parsing: instants must carry `Z` or an offset; local date-times are never silently treated as UTC.
  - Intl-based time zone engine: offsets (including 30- and 45-minute zones), conversion, DST transition search, gap/overlap resolution with `compatible`/`earlier`/`later`/`reject`, local day boundaries and day lengths.
  - Plain date utilities: leap years, month arithmetic, business days, fiscal quarters.
  - Scenario registry with 15 configurable scenarios: month-end, year-end, leap-day, trial-expiry, subscription-renewal, payroll, invoice-due, quarter-close, midnight-rollover, dst-transition, holiday-boundary, leave-accrual, token-expiry, coupon-expiry, billing-retry.
- `@workfonic/mockclock-node`: `runWithClock`/`ambientClock` (AsyncLocalStorage), `createNowFunction`, `createDateFactory`, explicit and reversible global `Date` patching (`installGlobalDate`, `withGlobalDate`), timer adapters for `@sinonjs/fake-timers` and Vitest/Jest fake timers, and `setupMockClock` test hooks.
- `@workfonic/mockclock-cli`: `mockclock` command (`now`, `freeze`, `resume`, `advance`, `rewind`, `travel`, `reset`, `scenarios`, `scenario`, `timezone`) with JSON output, explicit `--session` files and documented exit codes.
- Next.js playground (`apps/playground`) built on the core package.
- Documentation, runnable examples, CI, release workflow and community files.

[Unreleased]: https://github.com/abhisarena-sketch/mockclock/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/abhisarena-sketch/mockclock/releases/tag/v0.1.0
