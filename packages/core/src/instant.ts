import { MAX_EPOCH_MS, daysInMonth, fractionToMs, utcEpochMs } from './calendar.js';
import { AmbiguousDateInputError, InvalidDateError } from './errors.js';

/**
 * Anything MockClock accepts as an absolute instant:
 *
 * - a `Date` (must be valid),
 * - a number of milliseconds since the Unix epoch,
 * - an ISO 8601 string **with** `Z` or an explicit UTC offset, such as
 *   `2026-11-30T23:59:00Z` or `2026-11-30T23:59:00+05:30`.
 *
 * Strings without an offset (`2026-11-30T23:59:00`, `2026-11-30`) are local
 * date-times. They are rejected with an {@link AmbiguousDateInputError} rather than
 * being silently treated as UTC; use `clock.travel({ local, timeZone })` or
 * `fromLocal()` for those.
 */
export type DateInput = Date | number | string;

const INSTANT_RE =
  /^([+-]\d{6}|\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?(Z|[+-]\d{2}(?::?\d{2})?)$/i;
const LOCAL_DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:[.,]\d{1,9})?)?)?$/;

/** Convert a {@link DateInput} to epoch milliseconds, validating it strictly. */
export function toEpochMs(input: DateInput, label = 'date'): number {
  if (input instanceof Date) {
    const ms = input.getTime();
    if (Number.isNaN(ms)) throw new InvalidDateError(`${label} is an invalid Date`);
    return ms;
  }
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw new InvalidDateError(`${label} must be a finite number of milliseconds`);
    if (!Number.isInteger(input)) throw new InvalidDateError(`${label} must be a whole number of milliseconds`);
    if (Math.abs(input) > MAX_EPOCH_MS) throw new InvalidDateError(`${label} is outside the range of a JavaScript Date`);
    return input;
  }
  if (typeof input === 'string') return parseInstant(input, label);
  throw new InvalidDateError(`${label} must be a Date, a number of epoch milliseconds or an ISO 8601 string`);
}

/** Parse an ISO 8601 instant string. The string must include `Z` or an offset. */
export function parseInstant(input: string, label = 'date'): number {
  const text = input.trim();
  const m = INSTANT_RE.exec(text);
  if (!m) {
    if (LOCAL_DATE_TIME_RE.test(text)) {
      throw new AmbiguousDateInputError(
        `${label} "${input}" has no UTC offset, so it is a local date-time, not an instant. ` +
          `Add "Z" or an offset (for example "${text.includes('T') || text.includes(' ') ? text : `${text}T00:00:00`}Z"), ` +
          `or use { local: "${text}", timeZone: "Area/City" }.`,
      );
    }
    throw new InvalidDateError(
      `${label} "${input}" is not a valid ISO 8601 instant. Expected a form like 2026-11-30T23:59:00Z or 2026-11-30T23:59:00+05:30.`,
    );
  }
  const [, y, mo, d, h, mi, s, frac, offset] = m as unknown as [string, string, string, string, string, string, string?, string?, string?];
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  const hour = Number(h);
  const minute = Number(mi);
  const second = s ? Number(s) : 0;
  if (month < 1 || month > 12) throw new InvalidDateError(`${label} "${input}" has an invalid month (${mo})`);
  if (day < 1 || day > daysInMonth(year, month)) {
    throw new InvalidDateError(`${label} "${input}" has an invalid day: ${y}-${mo} has ${daysInMonth(year, month)} days`);
  }
  if (hour > 23) throw new InvalidDateError(`${label} "${input}" has an invalid hour (${h}); use 00-23`);
  if (minute > 59) throw new InvalidDateError(`${label} "${input}" has an invalid minute (${mi})`);
  if (second > 59) throw new InvalidDateError(`${label} "${input}" has an invalid second (${s}); leap seconds are not supported`);
  const offsetMs = parseOffset(offset ?? 'Z', input, label);
  const ms = utcEpochMs(year, month, day, hour, minute, second, fractionToMs(frac)) - offsetMs;
  if (Math.abs(ms) > MAX_EPOCH_MS) throw new InvalidDateError(`${label} "${input}" is outside the range of a JavaScript Date`);
  return ms;
}

function parseOffset(offset: string, input: string, label: string): number {
  if (offset === 'Z' || offset === 'z') return 0;
  const m = /^([+-])(\d{2}):?(\d{2})?$/.exec(offset);
  if (!m) throw new InvalidDateError(`${label} "${input}" has an invalid offset`);
  const hours = Number(m[2]);
  const minutes = m[3] ? Number(m[3]) : 0;
  if (hours > 23 || minutes > 59) throw new InvalidDateError(`${label} "${input}" has an out-of-range offset ${offset}`);
  const sign = m[1] === '-' ? -1 : 1;
  return sign * (hours * 60 + minutes) * 60_000;
}

/** Format epoch milliseconds as an ISO 8601 UTC string (`2026-11-30T23:59:00.000Z`). */
export function formatInstant(ms: number): string {
  return new Date(ms).toISOString();
}
