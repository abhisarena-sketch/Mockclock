import { describe, expect, it } from 'vitest';
import {
  AmbiguousDateInputError,
  InvalidDateError,
  InvalidDurationError,
  MockClockError,
  describeDuration,
  formatIsoDuration,
  normalizeDuration,
  parseInstant,
  parseIsoDuration,
  toEpochMs,
} from '@workfonic/mockclock';

describe('instant parsing', () => {
  it('parses Z and explicit offsets, including half-hour offsets', () => {
    expect(parseInstant('2026-11-30T23:59:00Z')).toBe(Date.UTC(2026, 10, 30, 23, 59));
    expect(parseInstant('2026-12-01T05:29:00+05:30')).toBe(Date.UTC(2026, 10, 30, 23, 59));
    expect(parseInstant('2026-12-01T05:44:00+0545')).toBe(Date.UTC(2026, 10, 30, 23, 59));
    expect(parseInstant('2026-11-30T18:59:00-05')).toBe(Date.UTC(2026, 10, 30, 23, 59));
    expect(parseInstant('2026-11-30T23:59:00.123456Z')).toBe(Date.UTC(2026, 10, 30, 23, 59, 0, 123));
  });

  it('refuses to guess a time zone for offset-less input', () => {
    expect(() => parseInstant('2026-11-30T23:59:00')).toThrow(AmbiguousDateInputError);
    expect(() => parseInstant('2026-11-30')).toThrow(AmbiguousDateInputError);
    try {
      parseInstant('2026-11-30');
    } catch (e) {
      expect((e as MockClockError).code).toBe('AMBIGUOUS_DATE_INPUT');
      expect((e as Error).message).toContain('2026-11-30T00:00:00Z');
    }
  });

  it('rejects invalid values instead of rolling them over like Date does', () => {
    expect(() => parseInstant('2026-02-30T00:00:00Z')).toThrow(/28 days/);
    expect(() => parseInstant('2026-13-01T00:00:00Z')).toThrow(/month/);
    expect(() => parseInstant('2026-01-01T24:00:00Z')).toThrow(/hour/);
    expect(() => parseInstant('2026-01-01T12:60:00Z')).toThrow(/minute/);
    expect(() => parseInstant('2026-01-01T12:00:60Z')).toThrow(/leap seconds/);
    expect(() => parseInstant('2026-01-01T12:00:00+24:00')).toThrow(/offset/);
    expect(() => parseInstant('yesterday')).toThrow(InvalidDateError);
    expect(() => parseInstant('Tue, 01 Dec 2026 00:00:00 GMT')).toThrow(InvalidDateError);
  });

  it('validates Date and number inputs', () => {
    expect(toEpochMs(new Date(5))).toBe(5);
    expect(() => toEpochMs(new Date('x'))).toThrow(/invalid Date/);
    expect(() => toEpochMs(1.5)).toThrow(/whole number/);
    expect(() => toEpochMs(Infinity)).toThrow(/finite/);
    expect(() => toEpochMs(9e15)).toThrow(/range/);
    expect(() => toEpochMs({} as never)).toThrow(/must be a Date/);
  });
});

describe('durations', () => {
  it('normalizes and validates', () => {
    expect(normalizeDuration({ days: 2, hours: 4 })).toMatchObject({ days: 2, hours: 4, months: 0 });
    expect(() => normalizeDuration({ hours: 1.5 })).toThrow(/whole number/);
    expect(() => normalizeDuration({ hours: Number.NaN })).toThrow(/finite/);
    expect(() => normalizeDuration({ fortnights: 1 } as never)).toThrow(/Unknown duration unit/);
    expect(() => normalizeDuration([] as never)).toThrow(InvalidDurationError);
  });

  it('parses and formats ISO 8601 durations', () => {
    expect(parseIsoDuration('P1Y2M3W4DT5H6M7.5S')).toEqual({
      years: 1,
      months: 2,
      weeks: 3,
      days: 4,
      hours: 5,
      minutes: 6,
      seconds: 7,
      milliseconds: 500,
    });
    expect(parseIsoDuration('-P1D').days).toBe(-1);
    expect(formatIsoDuration({ days: 2, hours: 4 })).toBe('P2DT4H');
    expect(formatIsoDuration({ seconds: 1, milliseconds: 250 })).toBe('PT1.25S');
    expect(formatIsoDuration({})).toBe('PT0S');
    expect(formatIsoDuration({ months: -1 })).toBe('-P1M');
    for (const bad of ['P', 'PT', '1D', 'P1.5D', 'PT1H2']) expect(() => parseIsoDuration(bad)).toThrow(InvalidDurationError);
  });

  it('describes durations for humans', () => {
    expect(describeDuration({ days: 1, hours: 2 })).toBe('1 day, 2 hours');
    expect(describeDuration({ weeks: -2 })).toBe('minus 2 weeks');
  });
});
