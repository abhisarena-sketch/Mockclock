# @workfonic/mockclock-node

Node.js integration for [MockClock](https://github.com/abhisarena-sketch/mockclock), by Workfonic Labs.

```bash
npm install --save-dev @workfonic/mockclock @workfonic/mockclock-node
```

| Export | Purpose |
|---|---|
| `runWithClock`, `ambientClock`, `currentClock` | Per-request / per-test clocks via `AsyncLocalStorage`. |
| `createNowFunction`, `createDateFactory` | Inject a clock where a `now` callback or date factory is expected. |
| `installGlobalDate`, `withGlobalDate`, `restoreGlobalDate` | Explicit, reversible global `Date` patch for legacy code. Refuses conflicting installs. |
| `installFakeTimers` | Drive `@sinonjs/fake-timers` (optional peer) from a frozen MockClock. |
| `linkTestFrameworkTimers`, `linkTimers` | Drive Vitest/Jest fake timers, or any timer driver. |
| `setupMockClock` | Fresh clock per test via `beforeEach`/`afterEach`. |

```ts
import { MockClock } from '@workfonic/mockclock';
import { withGlobalDate } from '@workfonic/mockclock-node';

const clock = new MockClock({ now: '2026-12-31T23:59:59Z', frozen: true });
await withGlobalDate(clock, async () => {
  await legacyJobThatCallsNewDate();
}); // restored, even if the job throws
```

Nothing is patched on import. The global patch affects the current JavaScript realm only: not worker threads, child processes, native code or the operating-system clock. Details: [docs/node.md](https://github.com/abhisarena-sketch/mockclock/blob/main/docs/node.md).

MIT © Workfonic Labs
