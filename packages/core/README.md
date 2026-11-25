# @workfonic/mockclock

**Control time. Test anything.** Isolated, deterministic clocks for testing time-dependent code, by Workfonic Labs.

- Freeze, advance, rewind, set, travel and reset, with no global side effects.
- Calendar-correct months and years (Jan 31 + 1 month = Feb 28/29), with a documented end-of-month policy.
- IANA time zones via `Intl`, including 30/45-minute offsets; DST gaps and overlaps detected and resolved explicitly.
- 15 configurable scenarios: month-end, leap day, trial expiry, renewals, payroll, invoices, quarter close, DST, token expiry and more.
- Zero runtime dependencies. ESM and CommonJS. Node.js 20+ and modern browsers.

```bash
npm install --save-dev @workfonic/mockclock
```

```ts
import { MockClock } from '@workfonic/mockclock';

const clock = new MockClock({ timeZone: 'UTC' });
clock.freeze('2026-11-30T23:59:00Z');
clock.advance({ days: 2, hours: 3, minutes: 30 }); // 2026-12-03T03:29:00.000Z
clock.rewind({ days: 1 });
clock.travel({ local: '2027-01-01T09:00', timeZone: 'Asia/Tokyo' });
clock.reset();

const monthEnd = MockClock.scenario('month-end', { year: 2027, month: 2 });
```

Instants without an offset (`'2026-11-30T23:59:00'`) are rejected rather than guessed.

Documentation: [README](https://github.com/abhisarena-sketch/mockclock#readme) · [API](https://github.com/abhisarena-sketch/mockclock/blob/main/docs/api.md) · [Calendar arithmetic](https://github.com/abhisarena-sketch/mockclock/blob/main/docs/calendar-arithmetic.md) · [Time zones](https://github.com/abhisarena-sketch/mockclock/blob/main/docs/timezones.md) · [Scenarios](https://github.com/abhisarena-sketch/mockclock/blob/main/docs/scenarios.md)

MIT © Workfonic Labs
