import {
  MS_PER_DAY,
  MS_PER_HOUR,
  addDays,
  addMonths,
  addYears,
  formatPlainDateTime,
  pad,
  parsePlainDateTime,
  plainDate,
  plainDateTime,
  utcEpochMs,
  type IsoDayOfWeek,
  type OverflowPolicy,
  type PlainDate,
  type PlainDateTime,
} from './calendar.js';
import { normalizeDuration, type DurationLike } from './duration.js';
import {
  AmbiguousLocalTimeError,
  InvalidDateError,
  InvalidTimeZoneError,
  NonexistentLocalTimeError,
} from './errors.js';
import { formatInstant, toEpochMs, type DateInput } from './instant.js';

/**
 * How to turn a local wall-clock time into an instant when the local time is
 * ambiguous (it happens twice, at a fall-back transition) or nonexistent (it is
 * skipped, at a spring-forward transition). Same semantics as Temporal:
 *
 * | value        | overlap (time occurs twice) | gap (time skipped)                                  |
 * |--------------|-----------------------------|-----------------------------------------------------|
 * | `compatible` | earlier instant             | shifted forward by the gap length (02:30 -> 03:30)  |
 * | `earlier`    | earlier instant             | shifted backward by the gap length (02:30 -> 01:30) |
 * | `later`      | later instant               | shifted forward by the gap length (02:30 -> 03:30)  |
 * | `reject`     | throws                      | throws                                              |
 */
export type Disambiguation = 'compatible' | 'earlier' | 'later' | 'reject';

/** A wall-clock reading of an instant in a specific IANA time zone. */
export interface ZonedDateTime extends PlainDateTime {
  /** The instant, in epoch milliseconds. */
  readonly epochMs: number;
  readonly timeZone: string;
  /** UTC offset in milliseconds (positive east of Greenwich). */
  readonly offsetMs: number;
  /** UTC offset as `+05:30`, `-04:00`, `+05:45`, or `+00:00`. */
  readonly offset: string;
  /** ISO day of week, 1 = Monday. */
  readonly dayOfWeek: IsoDayOfWeek;
  /** `2026-11-30T23:59:00+05:30` */
  readonly iso: string;
  /** `2026-11-30T18:29:00.000Z` */
  readonly utc: string;
  /** Local calendar date. */
  readonly date: PlainDate;
}

/** Result of looking up a local wall-clock time in a time zone. */
export type LocalTimeResolution =
  | { readonly kind: 'unique'; readonly local: PlainDateTime; readonly timeZone: string; readonly instants: readonly [number] }
  | {
      readonly kind: 'ambiguous';
      readonly local: PlainDateTime;
      readonly timeZone: string;
      /** Both instants, earlier first. */
      readonly instants: readonly [number, number];
    }
  | {
      readonly kind: 'gap';
      readonly local: PlainDateTime;
      readonly timeZone: string;
      readonly instants: readonly [];
      /** Offsets either side of the skipped period, in ms. */
      readonly offsetBeforeMs: number;
      readonly offsetAfterMs: number;
      readonly gapMs: number;
    };

/** An offset change in a time zone (DST start or end, or a permanent rule change). */
export interface TimeZoneTransition {
  /** First instant at which the new offset applies. */
  readonly epochMs: number;
  readonly iso: string;
  readonly timeZone: string;
  readonly offsetBeforeMs: number;
  readonly offsetAfterMs: number;
  readonly offsetBefore: string;
  readonly offsetAfter: string;
  /**
   * `gap`: clocks jumped forward, local times in between do not exist.
   * `overlap`: clocks went back, local times in between happen twice.
   */
  readonly kind: 'gap' | 'overlap';
  /** Local wall-clock time just before the transition, in the old offset. */
  readonly localBefore: string;
  /** Local wall-clock time at the transition, in the new offset. */
  readonly localAfter: string;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();
const validatedZones = new Set<string>(['UTC']);

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      era: 'short',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

/** Whether `timeZone` is an identifier supported by this runtime's `Intl` implementation. */
export function isValidTimeZone(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== 'string' || timeZone.length === 0 || timeZone.length > 64) return false;
  if (validatedZones.has(timeZone)) return true;
  try {
    formatterFor(timeZone);
    validatedZones.add(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** Throw an {@link InvalidTimeZoneError} unless `timeZone` is supported. Returns it unchanged. */
export function assertTimeZone(timeZone: unknown): string {
  if (!isValidTimeZone(timeZone)) {
    throw new InvalidTimeZoneError(
      `Unknown time zone ${JSON.stringify(timeZone)}. Use an IANA identifier such as "Asia/Kolkata", "America/New_York" or "UTC".`,
    );
  }
  return timeZone;
}

/** IANA time zones known to the runtime (empty if `Intl.supportedValuesOf` is unavailable). */
export function listTimeZones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  return intl.supportedValuesOf ? intl.supportedValuesOf('timeZone') : [];
}

/** The time zone of the current runtime environment. */
export function systemTimeZone(): string {
  return new Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

interface WallParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function wallParts(epochMs: number, timeZone: string): WallParts {
  if (timeZone === 'UTC') {
    const d = new Date(epochMs);
    return {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      day: d.getUTCDate(),
      hour: d.getUTCHours(),
      minute: d.getUTCMinutes(),
      second: d.getUTCSeconds(),
    };
  }
  const parts = formatterFor(timeZone).formatToParts(new Date(epochMs));
  const out: WallParts = { year: 0, month: 0, day: 0, hour: 0, minute: 0, second: 0 };
  let bc = false;
  for (const p of parts) {
    switch (p.type) {
      case 'year':
        out.year = Number(p.value);
        break;
      case 'month':
        out.month = Number(p.value);
        break;
      case 'day':
        out.day = Number(p.value);
        break;
      case 'hour':
        // Some older ICU builds report midnight as 24 even with h23.
        out.hour = Number(p.value) % 24;
        break;
      case 'minute':
        out.minute = Number(p.value);
        break;
      case 'second':
        out.second = Number(p.value);
        break;
      case 'era':
        bc = /^b/i.test(p.value);
        break;
      default:
        break;
    }
  }
  if (bc) out.year = 1 - out.year;
  return out;
}

/** UTC offset of `timeZone` at the given instant, in milliseconds. Never invented: read from Intl. */
export function getOffsetMs(instant: DateInput, timeZone: string): number {
  const ms = toEpochMs(instant, 'instant');
  assertTimeZone(timeZone);
  if (timeZone === 'UTC') return 0;
  const w = wallParts(ms, timeZone);
  const msPart = ((ms % 1000) + 1000) % 1000;
  return utcEpochMs(w.year, w.month, w.day, w.hour, w.minute, w.second, msPart) - ms;
}

/** Format an offset in milliseconds as `+05:30`. Seconds are included only if non-zero (historical LMT offsets). */
export function formatOffset(offsetMs: number): string {
  const sign = offsetMs < 0 ? '-' : '+';
  const abs = Math.abs(offsetMs);
  const h = Math.floor(abs / MS_PER_HOUR);
  const m = Math.floor((abs % MS_PER_HOUR) / 60_000);
  const s = Math.floor((abs % 60_000) / 1000);
  return `${sign}${pad(h, 2)}:${pad(m, 2)}${s ? `:${pad(s, 2)}` : ''}`;
}

/** Read an instant as local wall-clock time in `timeZone`. */
export function toZonedDateTime(instant: DateInput, timeZone: string): ZonedDateTime {
  const epochMs = toEpochMs(instant, 'instant');
  assertTimeZone(timeZone);
  const offsetMs = getOffsetMs(epochMs, timeZone);
  const local = new Date(epochMs + offsetMs);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth() + 1;
  const day = local.getUTCDate();
  const js = local.getUTCDay();
  const fields = {
    year,
    month,
    day,
    hour: local.getUTCHours(),
    minute: local.getUTCMinutes(),
    second: local.getUTCSeconds(),
    millisecond: local.getUTCMilliseconds(),
  };
  const offset = formatOffset(offsetMs);
  return Object.freeze({
    ...fields,
    epochMs,
    timeZone,
    offsetMs,
    offset,
    dayOfWeek: (js === 0 ? 7 : js) as IsoDayOfWeek,
    iso: `${formatPlainDateTime(fields)}${offset}`,
    utc: formatInstant(epochMs),
    date: Object.freeze({ year, month, day }),
  });
}

/** The local calendar date of an instant in a time zone. */
export function localDate(instant: DateInput, timeZone: string): PlainDate {
  return toZonedDateTime(instant, timeZone).date;
}

function toPlainDateTime(local: PlainDateTime | string): PlainDateTime {
  if (typeof local === 'string') return parsePlainDateTime(local);
  return plainDateTime(local, local);
}

/**
 * Look up a local wall-clock time in a time zone and report whether it maps to
 * one instant, two instants (overlap) or none (gap).
 *
 * Offsets are sampled one day either side of the target, so this assumes at
 * most one offset transition within ±24 hours of the local time, which holds
 * for every rule in the current IANA database.
 */
export function resolveLocal(local: PlainDateTime | string, timeZone: string): LocalTimeResolution {
  const dt = toPlainDateTime(local);
  assertTimeZone(timeZone);
  const wallMs = utcEpochMs(dt.year, dt.month, dt.day, dt.hour, dt.minute, dt.second, dt.millisecond);
  if (timeZone === 'UTC') return { kind: 'unique', local: dt, timeZone, instants: [wallMs] };

  const offsetBefore = getOffsetMs(wallMs - MS_PER_DAY, timeZone);
  const offsetAfter = getOffsetMs(wallMs + MS_PER_DAY, timeZone);
  const candidateOffsets = new Set([offsetBefore, offsetAfter, getOffsetMs(wallMs, timeZone)]);
  const instants = [...candidateOffsets]
    .map((off) => wallMs - off)
    .filter((t) => getOffsetMs(t, timeZone) === wallMs - t)
    .sort((a, b) => a - b);
  const unique = [...new Set(instants)];

  if (unique.length === 1) return { kind: 'unique', local: dt, timeZone, instants: [unique[0]!] };
  if (unique.length >= 2) {
    return { kind: 'ambiguous', local: dt, timeZone, instants: [unique[0]!, unique[unique.length - 1]!] };
  }
  return {
    kind: 'gap',
    local: dt,
    timeZone,
    instants: [],
    offsetBeforeMs: offsetBefore,
    offsetAfterMs: offsetAfter,
    gapMs: offsetAfter - offsetBefore,
  };
}

/**
 * Convert a local wall-clock time in a time zone to an instant (epoch ms).
 * See {@link Disambiguation} for how gaps and overlaps are handled.
 */
export function fromLocal(
  local: PlainDateTime | string,
  timeZone: string,
  disambiguation: Disambiguation = 'compatible',
): number {
  const r = resolveLocal(local, timeZone);
  const text = `${formatPlainDateTime(r.local)} in ${timeZone}`;
  switch (r.kind) {
    case 'unique':
      return r.instants[0];
    case 'ambiguous':
      if (disambiguation === 'reject') {
        throw new AmbiguousLocalTimeError(
          `${text} is ambiguous: it occurs twice (at ${formatInstant(r.instants[0])} and ${formatInstant(r.instants[1])}) ` +
            `because clocks go back. Pass disambiguation "earlier" or "later".`,
        );
      }
      return disambiguation === 'later' ? r.instants[1] : r.instants[0];
    case 'gap': {
      if (disambiguation === 'reject') {
        throw new NonexistentLocalTimeError(
          `${text} does not exist: clocks skip forward from ${formatOffset(r.offsetBeforeMs)} to ${formatOffset(r.offsetAfterMs)} ` +
            `at that time. Pass disambiguation "compatible", "earlier" or "later" to shift it.`,
        );
      }
      const wallMs = utcEpochMs(
        r.local.year,
        r.local.month,
        r.local.day,
        r.local.hour,
        r.local.minute,
        r.local.second,
        r.local.millisecond,
      );
      // 'earlier' reads the wall time with the new offset (lands before the gap);
      // 'later'/'compatible' read it with the old offset (lands after the gap).
      return disambiguation === 'earlier' ? wallMs - r.offsetAfterMs : wallMs - r.offsetBeforeMs;
    }
  }
}

/** Convenience: format an instant as an ISO string with the zone's offset. */
export function formatInTimeZone(instant: DateInput, timeZone: string): string {
  return toZonedDateTime(instant, timeZone).iso;
}

/**
 * Convert a local wall-clock time in one zone to the wall-clock time in another.
 * Example: 09:00 in Asia/Kolkata is 03:30 in Europe/London (in winter).
 */
export function convertLocal(
  local: PlainDateTime | string,
  fromTimeZone: string,
  toTimeZone: string,
  disambiguation: Disambiguation = 'compatible',
): ZonedDateTime {
  return toZonedDateTime(fromLocal(local, fromTimeZone, disambiguation), toTimeZone);
}

/** Show one instant in several time zones. */
export function compareAcrossTimeZones(instant: DateInput, timeZones: readonly string[]): ZonedDateTime[] {
  const ms = toEpochMs(instant, 'instant');
  return timeZones.map((tz) => toZonedDateTime(ms, tz));
}

/** Whether two instants fall on the same local calendar date in `timeZone`. */
export function isSameLocalDate(a: DateInput, b: DateInput, timeZone: string): boolean {
  const x = localDate(a, timeZone);
  const y = localDate(b, timeZone);
  return x.year === y.year && x.month === y.month && x.day === y.day;
}

/**
 * First instant of a local calendar day. Usually local midnight; in zones where
 * midnight is skipped by a transition it is the first existing time after it.
 */
export function startOfLocalDay(date: PlainDate | string, timeZone: string): number {
  const d = typeof date === 'string' ? parsePlainDateTime(date) : date;
  return fromLocal(plainDateTime(plainDate(d.year, d.month, d.day)), timeZone, 'compatible');
}

/** Length of a local calendar day in hours: normally 24, 23 or 25 on DST days, other values in rare cases. */
export function hoursInLocalDay(date: PlainDate | string, timeZone: string): number {
  const d = typeof date === 'string' ? parsePlainDateTime(date) : date;
  const start = startOfLocalDay(d, timeZone);
  const end = startOfLocalDay(addDays(plainDate(d.year, d.month, d.day), 1), timeZone);
  return (end - start) / MS_PER_HOUR;
}

/**
 * Whether daylight saving time is in effect. Heuristic: the offset is greater than the
 * smaller of the January 1 and July 1 offsets of that year. Correct for typical
 * northern- and southern-hemisphere DST rules; zones that changed their standard
 * offset mid-year may be misreported.
 */
export function isDaylightSavingTime(instant: DateInput, timeZone: string): boolean {
  const ms = toEpochMs(instant, 'instant');
  const year = localDate(ms, timeZone).year;
  const jan = getOffsetMs(utcEpochMs(year, 1, 1), timeZone);
  const jul = getOffsetMs(utcEpochMs(year, 7, 1), timeZone);
  if (jan === jul) return false;
  return getOffsetMs(ms, timeZone) > Math.min(jan, jul);
}

/** Short zone abbreviation reported by Intl, such as `EST`, `GMT+5:30` or `BST`. Locale-dependent. */
export function timeZoneAbbreviation(instant: DateInput, timeZone: string, locale = 'en-US'): string {
  assertTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: 'short' }).formatToParts(
    new Date(toEpochMs(instant, 'instant')),
  );
  return parts.find((p) => p.type === 'timeZoneName')?.value ?? timeZone;
}

const SCAN_STEP_MS = 6 * MS_PER_HOUR;

function buildTransition(timeZone: string, epochMs: number, before: number, after: number): TimeZoneTransition {
  return Object.freeze({
    epochMs,
    iso: formatInstant(epochMs),
    timeZone,
    offsetBeforeMs: before,
    offsetAfterMs: after,
    offsetBefore: formatOffset(before),
    offsetAfter: formatOffset(after),
    kind: after > before ? 'gap' : 'overlap',
    localBefore: formatPlainDateTime(wallFrom(epochMs - 1, before)),
    localAfter: formatPlainDateTime(wallFrom(epochMs, after)),
  });
}

function wallFrom(epochMs: number, offsetMs: number): PlainDateTime {
  const d = new Date(epochMs + offsetMs);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
    millisecond: d.getUTCMilliseconds(),
  };
}

/**
 * Find every UTC-offset transition in `[start, end)`. The range is scanned in
 * 6-hour steps and each change is located to the second by binary search.
 * Two transitions less than 6 hours apart would be missed (none exist in the
 * current IANA rules).
 */
export function findTransitions(timeZone: string, start: DateInput, end: DateInput): TimeZoneTransition[] {
  assertTimeZone(timeZone);
  const from = toEpochMs(start, 'start');
  const to = toEpochMs(end, 'end');
  if (to < from) throw new InvalidDateError('findTransitions: end must not be before start');
  if (to - from > 200 * 366 * MS_PER_DAY) throw new InvalidDateError('findTransitions: range is limited to 200 years');
  const out: TimeZoneTransition[] = [];
  if (timeZone === 'UTC') return out;
  let prevT = from;
  let prevOff = getOffsetMs(from, timeZone);
  while (prevT < to) {
    const t = Math.min(prevT + SCAN_STEP_MS, to);
    const off = getOffsetMs(t, timeZone);
    if (off !== prevOff) {
      // Binary search on whole seconds for the first instant with the new offset.
      let lo = Math.floor(prevT / 1000);
      let hi = Math.ceil(t / 1000);
      while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2);
        if (getOffsetMs(mid * 1000, timeZone) === prevOff) lo = mid;
        else hi = mid;
      }
      const at = hi * 1000;
      if (at >= from && at < to) out.push(buildTransition(timeZone, at, prevOff, getOffsetMs(at, timeZone)));
      prevOff = off;
    }
    prevT = t;
  }
  return out;
}

/** The next transition strictly after `from`, searching up to `limitDays` ahead (default 731). */
export function nextTransition(timeZone: string, from: DateInput, limitDays = 731): TimeZoneTransition | undefined {
  const start = toEpochMs(from, 'from') + 1;
  return findTransitions(timeZone, start, start + limitDays * MS_PER_DAY)[0];
}

/** The most recent transition at or before `from`, searching up to `limitDays` back (default 731). */
export function previousTransition(timeZone: string, from: DateInput, limitDays = 731): TimeZoneTransition | undefined {
  const end = toEpochMs(from, 'from') + 1;
  const list = findTransitions(timeZone, end - limitDays * MS_PER_DAY, end);
  return list[list.length - 1];
}

/** All transitions during a calendar year (local year boundaries in that zone). */
export function transitionsInYear(timeZone: string, year: number): TimeZoneTransition[] {
  const start = startOfLocalDay(plainDate(year, 1, 1), timeZone);
  const end = startOfLocalDay(plainDate(year + 1, 1, 1), timeZone);
  return findTransitions(timeZone, start, end);
}

export interface AddDurationOptions {
  /** Time zone whose calendar the calendar units are applied in. Default `UTC`. */
  readonly timeZone?: string;
  readonly overflow?: OverflowPolicy;
  /** How to resolve a resulting wall-clock time that lands in a gap or overlap. Default `compatible`. */
  readonly disambiguation?: Disambiguation;
}

/**
 * Add a (possibly negative) duration to an instant.
 *
 * 1. Calendar units are applied to the local date in `timeZone`, in the order
 *    years, months, then weeks and days, keeping the local wall-clock time.
 *    Month/year overflow follows `overflow` (default `constrain`, so Jan 31 + 1
 *    month is Feb 28/29).
 * 2. The resulting local date-time is converted back to an instant using
 *    `disambiguation` (default `compatible`).
 * 3. Hours, minutes, seconds and milliseconds are added as exact elapsed time.
 *
 * This matches `Temporal.ZonedDateTime.prototype.add`. A consequence: adding
 * `{ days: 1 }` across a spring-forward transition elapses 23 hours, while
 * `{ hours: 24 }` always elapses exactly 24 hours.
 */
export function addDuration(instant: DateInput, duration: DurationLike, options: AddDurationOptions = {}): number {
  const ms = toEpochMs(instant, 'instant');
  const d = normalizeDuration(duration, { allowNegative: true });
  const timeZone = assertTimeZone(options.timeZone ?? 'UTC');
  const overflow = options.overflow ?? 'constrain';
  let result = ms;
  if (d.years || d.months || d.weeks || d.days) {
    const z = toZonedDateTime(ms, timeZone);
    let date: PlainDate = z.date;
    if (d.years) date = addYears(date, d.years, overflow);
    if (d.months) date = addMonths(date, d.months, overflow);
    if (d.weeks || d.days) date = addDays(date, d.weeks * 7 + d.days);
    result = fromLocal(plainDateTime(date, z), timeZone, options.disambiguation ?? 'compatible');
  }
  result += d.hours * MS_PER_HOUR + d.minutes * 60_000 + d.seconds * 1000 + d.milliseconds;
  return toEpochMs(result, 'result');
}

