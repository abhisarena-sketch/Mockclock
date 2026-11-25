import { describe, expect, it } from 'vitest';
import {
  CalendarOverflowError,
  InvalidDateError,
  addBusinessDays,
  addDays,
  addDuration,
  addMonths,
  addYears,
  daysBetween,
  daysInMonth,
  isBusinessDay,
  isLeapYear,
  isoDayOfWeek,
  lastBusinessDayOfMonth,
  parsePlainDate,
  parsePlainDateTime,
  parsePlainTime,
  plainDate,
  quarterOf,
} from '@workfonic/mockclock';

const d = (s: string) => parsePlainDate(s);
const at = (s: string) => Date.parse(s);
const isoOf = (ms: number) => new Date(ms).toISOString();

describe('leap years', () => {
  it.each([
    [2024, true],
    [2025, false],
    [2028, true],
    [1900, false],
    [2000, true],
    [2100, false],
    [2400, true],
  ])('%i leap = %s', (year, leap) => {
    expect(isLeapYear(year)).toBe(leap);
    expect(daysInMonth(year, 2)).toBe(leap ? 29 : 28);
  });
});

describe('plain dates', () => {
  it('rejects impossible dates', () => {
    expect(() => d('2026-02-29')).toThrow(InvalidDateError);
    expect(() => d('2026-04-31')).toThrow(/30 days/);
    expect(() => d('2026-13-01')).toThrow(/month/);
    expect(() => d('2026-1-1')).toThrow(/YYYY-MM-DD/);
    expect(() => plainDate(2026, 1, 1.5)).toThrow(/integer/);
    expect(d('2024-02-29')).toEqual({ year: 2024, month: 2, day: 29 });
  });

  it('parses times strictly', () => {
    expect(parsePlainTime('09:30')).toEqual({ hour: 9, minute: 30, second: 0, millisecond: 0 });
    expect(parsePlainTime('23:59:59.9999')).toEqual({ hour: 23, minute: 59, second: 59, millisecond: 999 });
    expect(() => parsePlainTime('24:00')).toThrow(/hour/);
    expect(() => parsePlainTime('12:00:60')).toThrow(/leap seconds/);
  });

  it('refuses local date-time strings that carry an offset', () => {
    expect(() => parsePlainDateTime('2026-01-01T00:00:00Z')).toThrow(/absolute instant/);
    expect(parsePlainDateTime('2026-01-01')).toMatchObject({ year: 2026, hour: 0 });
  });

  it('computes ISO weekdays and day differences', () => {
    expect(isoDayOfWeek(d('2026-11-30'))).toBe(1); // Monday
    expect(isoDayOfWeek(d('2026-11-29'))).toBe(7); // Sunday
    expect(daysBetween(d('2024-02-28'), d('2024-03-01'))).toBe(2);
    expect(daysBetween(d('2026-02-28'), d('2026-03-01'))).toBe(1);
    expect(addDays(d('2026-12-31'), 1)).toEqual(d('2027-01-01'));
  });
});

describe('end-of-month policy (constrain by default)', () => {
  it.each([
    ['2026-01-31', 1, '2026-02-28'],
    ['2024-01-31', 1, '2024-02-29'],
    ['2026-01-31', 2, '2026-03-31'],
    ['2026-03-31', 1, '2026-04-30'],
    ['2026-03-31', -1, '2026-02-28'],
    ['2026-01-30', 1, '2026-02-28'],
    ['2026-12-15', 1, '2027-01-15'],
    ['2026-01-15', -1, '2025-12-15'],
    ['2026-01-31', 13, '2027-02-28'],
  ])('%s + %i month(s) = %s', (start, months, expected) => {
    expect(addMonths(d(start), months)).toEqual(d(expected));
  });

  it('is not associative: chaining months differs from adding them at once', () => {
    const chained = addMonths(addMonths(d('2026-01-31'), 1), 1);
    expect(chained).toEqual(d('2026-03-28'));
    expect(addMonths(d('2026-01-31'), 2)).toEqual(d('2026-03-31'));
  });

  it('reject policy throws a descriptive error', () => {
    expect(() => addMonths(d('2026-01-31'), 1, 'reject')).toThrow(CalendarOverflowError);
    expect(() => addMonths(d('2026-01-31'), 1, 'reject')).toThrow(/2026-02-31.*28 days/);
    expect(addMonths(d('2026-01-15'), 1, 'reject')).toEqual(d('2026-02-15'));
  });

  it('leap day + 1 year constrains to February 28, + 4 years keeps February 29', () => {
    expect(addYears(d('2024-02-29'), 1)).toEqual(d('2025-02-28'));
    expect(addYears(d('2024-02-29'), 4)).toEqual(d('2028-02-29'));
    expect(addYears(d('2024-02-29'), -4)).toEqual(d('2020-02-29'));
    expect(() => addYears(d('2024-02-29'), 1, 'reject')).toThrow(CalendarOverflowError);
    expect(addYears(d('2000-02-29'), 100)).toEqual(d('2100-02-28'));
  });
});

describe('addDuration on instants', () => {
  it('applies years, then months, then days', () => {
    // 2024-01-31 + 1 year = 2025-01-31; + 1 month = 2025-02-28; + 1 day = 2025-03-01
    expect(isoOf(addDuration(at('2024-01-31T10:00:00Z'), { years: 1, months: 1, days: 1 }))).toBe(
      '2025-03-01T10:00:00.000Z',
    );
  });

  it('never approximates a month as 30 days', () => {
    expect(isoOf(addDuration(at('2026-02-01T00:00:00Z'), { months: 1 }))).toBe('2026-03-01T00:00:00.000Z');
    expect(isoOf(addDuration(at('2026-03-01T00:00:00Z'), { months: 1 }))).toBe('2026-04-01T00:00:00.000Z');
  });

  it('rewinds a month from March 31 to the last day of February', () => {
    expect(isoOf(addDuration(at('2026-03-31T12:00:00Z'), { months: -1 }))).toBe('2026-02-28T12:00:00.000Z');
    expect(isoOf(addDuration(at('2028-03-31T12:00:00Z'), { months: -1 }))).toBe('2028-02-29T12:00:00.000Z');
  });

  it('crosses a leap day correctly with day arithmetic', () => {
    expect(isoOf(addDuration(at('2028-02-28T23:00:00Z'), { days: 1 }))).toBe('2028-02-29T23:00:00.000Z');
    expect(isoOf(addDuration(at('2028-02-28T23:00:00Z'), { days: 2 }))).toBe('2028-03-01T23:00:00.000Z');
    expect(isoOf(addDuration(at('2028-02-28T23:00:00Z'), { hours: 1 }))).toBe('2028-02-29T00:00:00.000Z');
  });

  it('applies calendar months in the given time zone', () => {
    // 2026-01-31 20:00 UTC is already Feb 1 in Tokyo, so +1 month is Mar 1 in Tokyo.
    expect(isoOf(addDuration(at('2026-01-31T20:00:00Z'), { months: 1 }, { timeZone: 'Asia/Tokyo' }))).toBe(
      '2026-02-28T20:00:00.000Z',
    );
    expect(isoOf(addDuration(at('2026-01-31T20:00:00Z'), { months: 1 }))).toBe('2026-02-28T20:00:00.000Z');
    // 2026-01-30 20:00 UTC is Jan 31 05:00 in Tokyo; +1 month clamps to Feb 28 05:00 Tokyo.
    expect(isoOf(addDuration(at('2026-01-30T20:00:00Z'), { months: 1 }, { timeZone: 'Asia/Tokyo' }))).toBe(
      '2026-02-27T20:00:00.000Z',
    );
  });
});

describe('business days', () => {
  const holidays = ['2026-12-25', '2027-01-01'];

  it('skips weekends and holidays', () => {
    expect(isBusinessDay(d('2026-12-25'), { holidays })).toBe(false);
    expect(isBusinessDay(d('2026-12-26'))).toBe(false);
    expect(addBusinessDays(d('2026-12-24'), 1, { holidays })).toEqual(d('2026-12-28'));
    expect(addBusinessDays(d('2026-12-28'), -1, { holidays })).toEqual(d('2026-12-24'));
    expect(addBusinessDays(d('2026-12-26'), 0)).toEqual(d('2026-12-28'));
  });

  it('supports non Saturday/Sunday weekends', () => {
    // Friday-Saturday weekend
    expect(addBusinessDays(d('2026-11-26'), 1, { weekendDays: [5, 6] })).toEqual(d('2026-11-29'));
  });

  it('finds the last business day of a month', () => {
    expect(lastBusinessDayOfMonth(d('2026-01-10'))).toEqual(d('2026-01-30')); // Jan 31 2026 is Saturday
    expect(lastBusinessDayOfMonth(d('2026-11-01'))).toEqual(d('2026-11-30'));
    expect(lastBusinessDayOfMonth(d('2026-11-01'), { holidays: ['2026-11-30'] })).toEqual(d('2026-11-27'));
  });

  it('computes fiscal quarters', () => {
    expect(quarterOf(d('2026-04-01'))).toBe(2);
    expect(quarterOf(d('2026-04-01'), 4)).toBe(1);
    expect(quarterOf(d('2026-03-31'), 4)).toBe(4);
  });
});
