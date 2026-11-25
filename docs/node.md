# Node.js integration (`@workfonic/mockclock-node`)

```bash
npm install --save-dev @workfonic/mockclock @workfonic/mockclock-node
```

Importing the package has **no side effects**. Nothing global changes until you call one of the install functions below.

## 1. Dependency injection (recommended)

Accept a `ClockLike` (`{ now(): Date; nowMs(): number }`) in your services. Pass `systemClock` in production and a `MockClock` in tests. This needs no Node adapter at all and is safe under any concurrency.

```ts
import { systemClock, type ClockLike } from '@workfonic/mockclock';
class InvoiceService {
  constructor(private readonly clock: ClockLike = systemClock) {}
}
```

For APIs that take a callback:

```ts
import { createNowFunction, createDateFactory } from '@workfonic/mockclock-node';
const now = createNowFunction(clock);      // () => number, like Date.now
const makeDate = createDateFactory(clock); // makeDate() = clock time; makeDate(x) = new Date(x)
```

## 2. Ambient clock per request or test (`AsyncLocalStorage`)

When threading a clock through every constructor is impractical, inject `ambientClock` once and choose the clock per async context:

```ts
import { ambientClock, runWithClock } from '@workfonic/mockclock-node';

const audit = new AuditLog(ambientClock);           // created once at start-up

await runWithClock(clockA, () => handle(requestA)); // reads clockA, across awaits and timers
await runWithClock(clockB, () => handle(requestB)); // concurrently reads clockB
```

Outside `runWithClock`, `currentClock()` and `ambientClock` read the real system clock.

## 3. Global `Date` patch (legacy code)

For code that calls `new Date()` or `Date.now()` directly:

```ts
import { installGlobalDate, withGlobalDate } from '@workfonic/mockclock-node';

await withGlobalDate(clock, async () => {
  await legacyJob(); // new Date(), Date.now() and Date() read `clock`
});                  // restored here, including after a throw or rejection

const handle = installGlobalDate(clock);
try { /* ... */ } finally { handle.uninstall(); }
```

What it does:

- Replaces `globalThis.Date` with a `Proxy` of the original constructor. `new Date()`, `Date.now()` and `Date()` read the clock. `new Date(value)`, `Date.parse`, `Date.UTC`, prototype methods, `instanceof Date` and `class X extends Date` behave natively.
- Keeps the original constructor (`handle.originalDate`) and restores exactly it.
- Refuses a second installation (`GlobalPatchConflictError`), even from another copy of the package in the same process (the registry is keyed by `Symbol.for`).
- Refuses to uninstall if something else replaced `Date` after it, because restoring would silently discard that other patch. Restore the other patch first.
- `restoreGlobalDate()` is a teardown safety net (`afterAll`).
- MockClock itself always reads the native `Date.now` captured when the core module loaded, so a patched `Date` never feeds back into the clock.

What it does not do:

- It does not affect worker threads, child processes, `vm` contexts or other realms, native addons, `performance.now()`, `process.hrtime()`, file timestamps, or the operating-system clock.
- It is process-wide. Do not run `withGlobalDate` concurrently with different clocks (it throws if you try). Use injection or `runWithClock` for concurrent work.
- If `@workfonic/mockclock` is first imported *after* some other library has already replaced `Date`, MockClock's real-time source is that library's `Date.now`. Pass `realTime` explicitly in that case.

## 4. Timers

MockClock does not implement its own timer queue. It drives established fake-timer implementations.

### `@sinonjs/fake-timers`

```ts
import * as FakeTimers from '@sinonjs/fake-timers';
import { installFakeTimers } from '@workfonic/mockclock-node';

const clock = new MockClock({ now: '2026-01-01T00:00:00Z', frozen: true });
const handle = installFakeTimers(clock, { implementation: FakeTimers });
try {
  setTimeout(refresh, 30_000);
  clock.advance({ minutes: 1 }); // fires refresh at 00:00:30 (fake Date.now() = that time)
  clock.rewind({ hours: 1 });    // moves fake time back, fires nothing
} finally {
  handle.uninstall();            // restores real timers and Date
}
```

`@sinonjs/fake-timers` is an optional peer dependency; you pass the module in, so MockClock never imports it itself. The clock must be frozen. Do not combine with `installGlobalDate`: both replace `Date`.

### Vitest or Jest fake timers

```ts
vi.useFakeTimers();                               // or jest.useFakeTimers()
const link = linkTestFrameworkTimers(clock, vi);  // or (clock, jest)
clock.advance({ seconds: 30 });                   // vi.advanceTimersByTime(30_000)
link.unlink();
vi.useRealTimers();
```

### Any other driver

`linkTimers(clock, { tick(ms), setSystemTime(ms) })` forwards clock changes to any implementation.

Semantics: moving forward calls `tick(delta)` (fires due timers in order); moving backward calls `setSystemTime` (fires nothing). If a timer callback moves the clock again, the adapter keeps syncing until the clock is stable. While a forward `advance` is being synced, `clock.now()` already reports the destination; inside timer callbacks, the faked `Date.now()` reports each timer's own scheduled time.

## 5. Test hooks

```ts
import { afterEach, beforeEach, it } from 'vitest';
import { setupMockClock } from '@workfonic/mockclock-node';

const ctx = setupMockClock({ beforeEach, afterEach }, { now: '2026-11-30T23:59:00Z', frozen: true });

it('closes the month', () => {
  ctx.clock.advance({ minutes: 1 });
});
```

Works with any framework that has `beforeEach`/`afterEach` (Vitest, Jest, Mocha, `node:test`). Set `patchGlobalDate: true` to also patch `Date` for each test; it is uninstalled in `afterEach` even if the test failed.
