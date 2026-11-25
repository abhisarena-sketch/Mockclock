import { CalendarOverflowError, InvalidDateError } from './errors.js';

/** A calendar date with no time and no time zone (ISO 8601 proleptic Gregorian calendar). */
export interface PlainDate {
  /** Full year, 1 to 9999. */
  readonly year: number;
  /** Month of year, 1 (January) to 12 (December). */
  readonly month: number;
  /** Day of month, 1 to 31. */
  readonly day: number;
}

/** A wall-clock time with no date and no time zone. */
export interface PlainTime {
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  readonly millisecond: number;
}

/** A local date and wall-clock time with no time zone. It is not an instant. */
export interface PlainDateTime extends PlainDate, PlainTime {}

/**
 * What to do when calendar arithmetic lands on a day that does not exist in the
 * target month (for example January 31 + 1 month).
 *
 * - `constrain` (default): clamp to the last day of the month (February 28 or 29).
 * - `reject`: throw a {@link CalendarOverflowError}.
 */
export type OverflowPolicy = 'constrain' | 'reject';

/** ISO day of week: 1 = Monday ... 7 = Sunday. */
export type IsoDayOfWeek = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const MS_PER_SECOND = 1_000;
export const MS_PER_MINUTE = 60_000;
export const MS_PER_HOUR = 3_600_000;
export const MS_PER_DAY = 86_400_000;

/** Largest instant representable by a JavaScript Date (±100,000,000 days from the epoch). */
export const MAX_EPOCH_MS = 8.64e15;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?$/;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  assertInteger(month, 'month');
  if (month < 1 || month > 12) throw new InvalidDateError(`month must be between 1 and 12, received ${month}`);
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

export function daysInYear(year: number): number {
  return isLeapYear(year) ? 366 : 365;
}

function assertInteger(value: unknown, name: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new InvalidDateError(`${name} must be an integer, received ${String(value)}`);
  }
}

/** Validate and return a frozen copy of a plain date. Rejects impossible dates such as 2026-02-30. */
export function plainDate(year: number, month: number, day: number): PlainDate {
  assertInteger(year, 'year');
  assertInteger(month, 'month');
  assertInteger(day, 'day');
  if (year < 1 || year > 9999) throw new InvalidDateError(`year must be between 1 and 9999, received ${year}`);
  const dim = daysInMonth(year, month);
  if (day < 1 || day > dim) {
    throw new InvalidDateError(
      `${pad(year, 4)}-${pad(month, 2)} has ${dim} days; day ${day} does not exist`,
    );
  }
  return Object.freeze({ year, month, day });
}

export function plainTime(hour = 0, minute = 0, second = 0, millisecond = 0): PlainTime {
  assertInteger(hour, 'hour');
  assertInteger(minute, 'minute');
  assertInteger(second, 'second');
  assertInteger(millisecond, 'millisecond');
  if (hour < 0 || hour > 23) throw new InvalidDateError(`hour must be between 0 and 23, received ${hour}`);
  if (minute < 0 || minute > 59) throw new InvalidDateError(`minute must be between 0 and 59, received ${minute}`);
  if (second < 0 || second > 59) {
    throw new InvalidDateError(`second must be between 0 and 59, received ${second} (leap seconds are not supported)`);
  }
  if (millisecond < 0 || millisecond > 999) {
    throw new InvalidDateError(`millisecond must be between 0 and 999, received ${millisecond}`);
  }
  return Object.freeze({ hour, minute, second, millisecond });
}

export function plainDateTime(date: PlainDate, time: Partial<PlainTime> = {}): PlainDateTime {
  const d = plainDate(date.year, date.month, date.day);
  const t = plainTime(time.hour ?? 0, time.minute ?? 0, time.second ?? 0, time.millisecond ?? 0);
  return Object.freeze({ ...d, ...t });
}

/** Parse a strict `YYYY-MM-DD` string. */
export function parsePlainDate(input: string): PlainDate {
  if (typeof input !== 'string') throw new InvalidDateError(`Expected a YYYY-MM-DD string, received ${typeof input}`);
  const m = DATE_RE.exec(input.trim());
  if (!m) throw new InvalidDateError(`Invalid date "${input}": expected YYYY-MM-DD`);
  return plainDate(Number(m[1]), Number(m[2]), Number(m[3]));
}

/** Parse a strict `HH:mm[:ss[.SSS]]` string. Sub-millisecond digits are truncated. */
export function parsePlainTime(input: string): PlainTime {
  if (typeof input !== 'string') throw new InvalidDateError(`Expected an HH:mm string, received ${typeof input}`);
  const m = TIME_RE.exec(input.trim());
  if (!m) throw new InvalidDateError(`Invalid time "${input}": expected HH:mm, HH:mm:ss or HH:mm:ss.SSS`);
  return plainTime(Number(m[1]), Number(m[2]), m[3] ? Number(m[3]) : 0, fractionToMs(m[4]));
}

/**
 * Parse a local date-time string without an offset, such as `2026-03-08T02:30` or
 * `2026-03-08T02:30:00.000`. A bare date (`2026-03-08`) means local midnight.
 * Strings that carry an offset or `Z` are rejected: they are instants, not local times.
 */
export function parsePlainDateTime(input: string): PlainDateTime {
  if (typeof input !== 'string') {
    throw new InvalidDateError(`Expected a local date-time string, received ${typeof input}`);
  }
  const trimmed = input.trim();
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed) && trimmed.includes('T')) {
    throw new InvalidDateError(
      `"${input}" includes a UTC offset, so it is an absolute instant, not a local date-time. Remove the offset or pass it as an instant.`,
    );
  }
  const sep = trimmed.search(/[T ]/);
  if (sep === -1) return plainDateTime(parsePlainDate(trimmed));
  const date = parsePlainDate(trimmed.slice(0, sep));
  const time = parsePlainTime(trimmed.slice(sep + 1));
  return plainDateTime(date, time);
}

export function fractionToMs(fraction: string | undefined): number {
  if (!fraction) return 0;
  return Number(fraction.slice(0, 3).padEnd(3, '0'));
}

/** Milliseconds since the epoch for a date-time interpreted in UTC. Works for years 1-99 too. */
export function utcEpochMs(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  millisecond = 0,
): number {
  const d = new Date(0);
  d.setUTCFullYear(year, month - 1, day);
  d.setUTCHours(hour, minute, second, millisecond);
  return d.getTime();
}

/** Days since 1970-01-01 for a plain date. */
export function toEpochDay(date: PlainDate): number {
  return Math.round(utcEpochMs(date.year, date.month, date.day) / MS_PER_DAY);
}

export function fromEpochDay(epochDay: number): PlainDate {
  const d = new Date(epochDay * MS_PER_DAY);
  return plainDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function isoDayOfWeek(date: PlainDate): IsoDayOfWeek {
  const js = new Date(utcEpochMs(date.year, date.month, date.day)).getUTCDay();
  return (js === 0 ? 7 : js) as IsoDayOfWeek;
}

export function compareDates(a: PlainDate, b: PlainDate): -1 | 0 | 1 {
  const x = toEpochDay(a);
  const y = toEpochDay(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

export function isSameDate(a: PlainDate, b: PlainDate): boolean {
  return compareDates(a, b) === 0;
}

export function addDays(date: PlainDate, days: number): PlainDate {
  assertInteger(days, 'days');
  return fromEpochDay(toEpochDay(date) + days);
}

/** Signed number of calendar days from `a` to `b`. */
export function daysBetween(a: PlainDate, b: PlainDate): number {
  return toEpochDay(b) - toEpochDay(a);
}

/**
 * Add calendar months. The day of month is kept; if it does not exist in the
 * target month the {@link OverflowPolicy} decides what happens.
 *
 * `addMonths(2026-01-31, 1)` is `2026-02-28` with `constrain`.
 * `addMonths(2024-01-31, 1)` is `2024-02-29` with `constrain`.
 */
export function addMonths(date: PlainDate, months: number, overflow: OverflowPolicy = 'constrain'): PlainDate {
  assertInteger(months, 'months');
  const zeroBased = date.year * 12 + (date.month - 1) + months;
  const year = Math.floor(zeroBased / 12);
  const month = zeroBased - year * 12 + 1;
  return withDayInMonth(year, month, date.day, overflow, date, `${months} month(s)`);
}

/**
 * Add calendar years. February 29 + 1 year is February 28 with `constrain`.
 */
export function addYears(date: PlainDate, years: number, overflow: OverflowPolicy = 'constrain'): PlainDate {
  assertInteger(years, 'years');
  return withDayInMonth(date.year + years, date.month, date.day, overflow, date, `${years} year(s)`);
}

function withDayInMonth(
  year: number,
  month: number,
  day: number,
  overflow: OverflowPolicy,
  original: PlainDate,
  what: string,
): PlainDate {
  if (year < 1 || year > 9999) throw new InvalidDateError(`Calendar arithmetic left the supported range (years 1-9999)`);
  const dim = daysInMonth(year, month);
  if (day <= dim) return plainDate(year, month, day);
  if (overflow === 'reject') {
    throw new CalendarOverflowError(
      `Adding ${what} to ${formatPlainDate(original)} lands on ${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}, ` +
        `which does not exist (the month has ${dim} days). Use overflow: 'constrain' to clamp to the last day of the month.`,
    );
  }
  return plainDate(year, month, dim);
}

export function startOfMonth(date: PlainDate): PlainDate {
  return plainDate(date.year, date.month, 1);
}

export function endOfMonth(date: PlainDate): PlainDate {
  return plainDate(date.year, date.month, daysInMonth(date.year, date.month));
}

export function isLastDayOfMonth(date: PlainDate): boolean {
  return date.day === daysInMonth(date.year, date.month);
}

/** Calendar quarter (1-4) of a date, optionally for a fiscal year that starts in `fiscalYearStartMonth`. */
export function quarterOf(date: PlainDate, fiscalYearStartMonth = 1): 1 | 2 | 3 | 4 {
  const offset = (date.month - fiscalYearStartMonth + 12) % 12;
  return (Math.floor(offset / 3) + 1) as 1 | 2 | 3 | 4;
}

export interface BusinessDayOptions {
  /** ISO weekdays treated as the weekend. Default `[6, 7]` (Saturday, Sunday). */
  readonly weekendDays?: readonly IsoDayOfWeek[];
  /** Non-working dates (`YYYY-MM-DD` strings or plain dates). MockClock ships no holiday data. */
  readonly holidays?: readonly (PlainDate | string)[];
}

function holidaySet(options: BusinessDayOptions): Set<number> {
  return new Set(
    (options.holidays ?? []).map((h) => toEpochDay(typeof h === 'string' ? parsePlainDate(h) : h)),
  );
}

export function isWeekend(date: PlainDate, weekendDays: readonly IsoDayOfWeek[] = [6, 7]): boolean {
  return weekendDays.includes(isoDayOfWeek(date));
}

export function isBusinessDay(date: PlainDate, options: BusinessDayOptions = {}): boolean {
  if (isWeekend(date, options.weekendDays)) return false;
  return !holidaySet(options).has(toEpochDay(date));
}

/**
 * Move by `count` business days (negative moves backwards). `count = 0` returns the
 * date itself if it is a business day, otherwise the next business day.
 */
export function addBusinessDays(date: PlainDate, count: number, options: BusinessDayOptions = {}): PlainDate {
  assertInteger(count, 'count');
  const holidays = holidaySet(options);
  const weekend = options.weekendDays ?? [6, 7];
  if (weekend.length >= 7) throw new InvalidDateError('weekendDays cannot contain every day of the week');
  const isBiz = (d: PlainDate) => !weekend.includes(isoDayOfWeek(d)) && !holidays.has(toEpochDay(d));
  let current = date;
  if (count === 0) {
    while (!isBiz(current)) current = addDays(current, 1);
    return current;
  }
  const step = count > 0 ? 1 : -1;
  let remaining = Math.abs(count);
  let guard = 0;
  while (remaining > 0) {
    current = addDays(current, step);
    if (isBiz(current)) remaining -= 1;
    if (++guard > 100_000) throw new InvalidDateError('Could not find enough business days; check the holiday list');
  }
  return current;
}

export function nextBusinessDay(date: PlainDate, options: BusinessDayOptions = {}): PlainDate {
  return addBusinessDays(date, 1, options);
}

export function previousBusinessDay(date: PlainDate, options: BusinessDayOptions = {}): PlainDate {
  return addBusinessDays(date, -1, options);
}

/** The last business day on or before the end of the month containing `date`. */
export function lastBusinessDayOfMonth(date: PlainDate, options: BusinessDayOptions = {}): PlainDate {
  const end = endOfMonth(date);
  return isBusinessDay(end, options) ? end : previousBusinessDay(end, options);
}

export function pad(value: number, width: number): string {
  const sign = value < 0 ? '-' : '';
  return sign + String(Math.abs(value)).padStart(width, '0');
}

export function formatPlainDate(date: PlainDate): string {
  return `${pad(date.year, 4)}-${pad(date.month, 2)}-${pad(date.day, 2)}`;
}

export function formatPlainTime(time: PlainTime): string {
  const base = `${pad(time.hour, 2)}:${pad(time.minute, 2)}:${pad(time.second, 2)}`;
  return time.millisecond ? `${base}.${pad(time.millisecond, 3)}` : base;
}

export function formatPlainDateTime(dt: PlainDateTime): string {
  return `${formatPlainDate(dt)}T${formatPlainTime(dt)}`;
}
