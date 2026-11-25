import { describe, expect, it } from 'vitest';
import {
  AmbiguousLocalTimeError,
  InvalidTimeZoneError,
  NonexistentLocalTimeError,
  addDuration,
  assertTimeZone,
  compareAcrossTimeZones,
  convertLocal,
  findTransitions,
  formatOffset,
  fromLocal,
  getOffsetMs,
  hoursInLocalDay,
  isDaylightSavingTime,
  isSameLocalDate,
  isValidTimeZone,
  nextTransition,
  previousTransition,
  resolveLocal,
  startOfLocalDay,
  toZonedDateTime,
  transitionsInYear,
} from '@workfonic/mockclock';

const iso = (ms: number) => new Date(ms).toISOString();
const H = 3_600_000;

describe('time zone validation', () => {
  it('accepts IANA identifiers and rejects junk', () => {
    for (const tz of ['UTC', 'Asia/Kolkata', 'America/New_York', 'Europe/London', 'Asia/Tokyo', 'Australia/Sydney']) {
      expect(isValidTimeZone(tz)).toBe(true);
      expect(assertTimeZone(tz)).toBe(tz);
    }
    expect(isValidTimeZone('Mars/Olympus_Mons')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone(42)).toBe(false);
    expect(() => assertTimeZone('EST5EDTX')).toThrow(InvalidTimeZoneError);
  });
});

describe('offsets come from Intl, including non-whole-hour zones', () => {
  it.each([
    ['Asia/Kolkata', '2026-01-15T00:00:00Z', '+05:30'],
    ['Asia/Kathmandu', '2026-01-15T00:00:00Z', '+05:45'],
    ['Australia/Adelaide', '2026-01-15T00:00:00Z', '+10:30'],
    ['Australia/Adelaide', '2026-07-15T00:00:00Z', '+09:30'],
    ['Pacific/Chatham', '2026-07-15T00:00:00Z', '+12:45'],
    ['America/St_Johns', '2026-01-15T00:00:00Z', '-03:30'],
    ['America/New_York', '2026-01-15T00:00:00Z', '-05:00'],
    ['America/New_York', '2026-07-15T00:00:00Z', '-04:00'],
    ['Europe/London', '2026-01-15T00:00:00Z', '+00:00'],
    ['Europe/London', '2026-07-15T00:00:00Z', '+01:00'],
    ['Asia/Tokyo', '2026-07-15T00:00:00Z', '+09:00'],
    ['Australia/Sydney', '2026-01-15T00:00:00Z', '+11:00'],
    ['Australia/Sydney', '2026-07-15T00:00:00Z', '+10:00'],
  ])('%s at %s is %s', (tz, at, offset) => {
    expect(formatOffset(getOffsetMs(at, tz))).toBe(offset);
    expect(toZonedDateTime(at, tz).offset).toBe(offset);
  });

  it('formats historical offsets with seconds when present', () => {
    expect(formatOffset(-(4 * H + 56 * 60_000 + 2_000))).toBe('-04:56:02');
  });
});

describe('conversion', () => {
  it('converts the same instant across zones', () => {
    const rows = compareAcrossTimeZones('2026-11-30T23:59:00Z', ['Asia/Kolkata', 'America/New_York', 'Europe/London', 'Asia/Tokyo', 'Australia/Sydney']);
    expect(rows.map((r) => r.iso)).toEqual([
      '2026-12-01T05:29:00+05:30',
      '2026-11-30T18:59:00-05:00',
      '2026-11-30T23:59:00+00:00',
      '2026-12-01T08:59:00+09:00',
      '2026-12-01T10:59:00+11:00',
    ]);
    expect(new Set(rows.map((r) => r.epochMs)).size).toBe(1);
  });

  it('converts a local time from one zone to another', () => {
    expect(convertLocal('2026-01-15T09:00', 'Asia/Kolkata', 'Europe/London').iso).toBe('2026-01-15T03:30:00+00:00');
    expect(convertLocal('2026-07-15T09:00', 'Asia/Kolkata', 'Europe/London').iso).toBe('2026-07-15T04:30:00+01:00');
  });

  it('detects local date changes and midnight boundaries', () => {
    expect(isSameLocalDate('2026-11-30T18:29:59Z', '2026-11-30T18:30:00Z', 'UTC')).toBe(true);
    expect(isSameLocalDate('2026-11-30T18:29:59Z', '2026-11-30T18:30:00Z', 'Asia/Kolkata')).toBe(false);
    expect(iso(startOfLocalDay('2026-12-01', 'Asia/Kolkata'))).toBe('2026-11-30T18:30:00.000Z');
    expect(iso(startOfLocalDay('2026-12-01', 'America/New_York'))).toBe('2026-12-01T05:00:00.000Z');
  });
});

describe('DST transitions', () => {
  it('finds both 2026 transitions in America/New_York', () => {
    const [spring, fall] = transitionsInYear('America/New_York', 2026);
    expect(spring).toMatchObject({ iso: '2026-03-08T07:00:00.000Z', kind: 'gap', offsetBefore: '-05:00', offsetAfter: '-04:00' });
    expect(fall).toMatchObject({ iso: '2026-11-01T06:00:00.000Z', kind: 'overlap', offsetBefore: '-04:00', offsetAfter: '-05:00' });
  });

  it('finds southern-hemisphere transitions (Australia/Sydney)', () => {
    const list = transitionsInYear('Australia/Sydney', 2026);
    expect(list.map((t) => [t.iso, t.kind])).toEqual([
      ['2026-04-04T16:00:00.000Z', 'overlap'],
      ['2026-10-03T16:00:00.000Z', 'gap'],
    ]);
  });

  it('finds 30-minute DST shifts (Australia/Lord_Howe)', () => {
    const list = transitionsInYear('Australia/Lord_Howe', 2026);
    expect(list).toHaveLength(2);
    expect(list.every((t) => Math.abs(t.offsetAfterMs - t.offsetBeforeMs) === 30 * 60_000)).toBe(true);
  });

  it('reports no transitions for zones without DST', () => {
    expect(transitionsInYear('Asia/Kolkata', 2026)).toEqual([]);
    expect(transitionsInYear('Asia/Tokyo', 2026)).toEqual([]);
    expect(transitionsInYear('UTC', 2026)).toEqual([]);
  });

  it('next/previous transition', () => {
    expect(nextTransition('Europe/London', '2026-01-01T00:00:00Z')?.iso).toBe('2026-03-29T01:00:00.000Z');
    expect(previousTransition('Europe/London', '2026-01-01T00:00:00Z')?.iso).toBe('2025-10-26T01:00:00.000Z');
    expect(nextTransition('Asia/Kolkata', '2026-01-01T00:00:00Z')).toBeUndefined();
  });

  it('day lengths are 23 and 25 hours on transition days', () => {
    expect(hoursInLocalDay('2026-03-08', 'America/New_York')).toBe(23);
    expect(hoursInLocalDay('2026-11-01', 'America/New_York')).toBe(25);
    expect(hoursInLocalDay('2026-03-29', 'Europe/London')).toBe(23);
    expect(hoursInLocalDay('2026-10-04', 'Australia/Lord_Howe')).toBe(23.5);
    expect(hoursInLocalDay('2026-03-09', 'America/New_York')).toBe(24);
  });

  it('isDaylightSavingTime works in both hemispheres', () => {
    expect(isDaylightSavingTime('2026-07-01T00:00:00Z', 'America/New_York')).toBe(true);
    expect(isDaylightSavingTime('2026-01-01T00:00:00Z', 'America/New_York')).toBe(false);
    expect(isDaylightSavingTime('2026-01-01T00:00:00Z', 'Australia/Sydney')).toBe(true);
    expect(isDaylightSavingTime('2026-07-01T00:00:00Z', 'Asia/Kolkata')).toBe(false);
  });

  it('rejects inverted ranges', () => {
    expect(() => findTransitions('UTC', 10, 0)).toThrow(/end/);
  });
});

describe('spring-forward gap (America/New_York, 2026-03-08 02:00 -> 03:00)', () => {
  const tz = 'America/New_York';
  const local = '2026-03-08T02:30';

  it('is reported as a gap', () => {
    const r = resolveLocal(local, tz);
    expect(r.kind).toBe('gap');
    if (r.kind === 'gap') expect(r.gapMs).toBe(H);
  });

  it('compatible and later shift forward; earlier shifts back', () => {
    expect(toZonedDateTime(fromLocal(local, tz), tz).iso).toBe('2026-03-08T03:30:00-04:00');
    expect(toZonedDateTime(fromLocal(local, tz, 'later'), tz).iso).toBe('2026-03-08T03:30:00-04:00');
    expect(toZonedDateTime(fromLocal(local, tz, 'earlier'), tz).iso).toBe('2026-03-08T01:30:00-05:00');
  });

  it('reject throws NonexistentLocalTimeError', () => {
    expect(() => fromLocal(local, tz, 'reject')).toThrow(NonexistentLocalTimeError);
    expect(() => fromLocal(local, tz, 'reject')).toThrow(/does not exist/);
  });

  it('times next to the gap are unique', () => {
    expect(resolveLocal('2026-03-08T01:59:59', tz).kind).toBe('unique');
    expect(resolveLocal('2026-03-08T03:00', tz).kind).toBe('unique');
  });
});

describe('fall-back overlap (America/New_York, 2026-11-01 02:00 -> 01:00)', () => {
  const tz = 'America/New_York';
  const local = '2026-11-01T01:30';

  it('is reported as ambiguous with two instants one hour apart', () => {
    const r = resolveLocal(local, tz);
    expect(r.kind).toBe('ambiguous');
    expect(r.instants.map(iso)).toEqual(['2026-11-01T05:30:00.000Z', '2026-11-01T06:30:00.000Z']);
  });

  it('compatible/earlier pick EDT; later picks EST', () => {
    expect(toZonedDateTime(fromLocal(local, tz), tz).offset).toBe('-04:00');
    expect(toZonedDateTime(fromLocal(local, tz, 'earlier'), tz).offset).toBe('-04:00');
    expect(toZonedDateTime(fromLocal(local, tz, 'later'), tz).offset).toBe('-05:00');
  });

  it('reject throws AmbiguousLocalTimeError', () => {
    expect(() => fromLocal(local, tz, 'reject')).toThrow(AmbiguousLocalTimeError);
  });
});

describe('midnight that does not exist (America/Santiago, 2026-09-06)', () => {
  it('start of day is 01:00 local because 00:00 is skipped', () => {
    const tz = 'America/Santiago';
    const t = transitionsInYear(tz, 2026).find((x) => x.kind === 'gap');
    expect(t?.localAfter.startsWith('2026-09-06T01:00')).toBe(true);
    expect(toZonedDateTime(startOfLocalDay('2026-09-06', tz), tz).iso).toBe('2026-09-06T01:00:00-03:00');
  });
});

describe('duration arithmetic across DST', () => {
  it('Europe/London: one calendar day across spring-forward is 23 elapsed hours', () => {
    const start = fromLocal('2026-03-28T09:00', 'Europe/London');
    const end = addDuration(start, { days: 1 }, { timeZone: 'Europe/London' });
    expect(toZonedDateTime(end, 'Europe/London').iso).toBe('2026-03-29T09:00:00+01:00');
    expect((end - start) / H).toBe(23);
  });

  it('a calendar day landing in a gap resolves with the disambiguation option', () => {
    const start = fromLocal('2026-03-07T02:30', 'America/New_York');
    const compat = addDuration(start, { days: 1 }, { timeZone: 'America/New_York' });
    expect(toZonedDateTime(compat, 'America/New_York').iso).toBe('2026-03-08T03:30:00-04:00');
    expect(() => addDuration(start, { days: 1 }, { timeZone: 'America/New_York', disambiguation: 'reject' })).toThrow(
      NonexistentLocalTimeError,
    );
  });
});
