import { describe, expect, it, vi } from 'vitest';
import {
  AmbiguousDateInputError,
  CalendarOverflowError,
  InvalidClockOperationError,
  InvalidDurationError,
  InvalidSnapshotError,
  MockClock,
  NonexistentLocalTimeError,
  systemClock,
  type ClockChangeEvent,
} from '@workfonic/mockclock';

/** A controllable real-time source so running clocks are deterministic. */
function fakeReal(start = Date.UTC(2030, 0, 1)) {
  let t = start;
  return {
    now: () => t,
    pass: (ms: number) => {
      t += ms;
    },
  };
}

const iso = (c: MockClock) => c.now().toISOString();

describe('MockClock: reading time', () => {
  it('starts in real mode and reads the real-time source', () => {
    const real = fakeReal();
    const clock = new MockClock({ realTime: real.now });
    expect(clock.mode).toBe('real');
    expect(clock.isSimulated()).toBe(false);
    expect(clock.isRunning()).toBe(true);
    expect(clock.nowMs()).toBe(real.now());
    real.pass(5000);
    expect(clock.nowMs()).toBe(real.now());
  });

  it('uses the native clock by default and stays close to Date.now()', () => {
    const clock = new MockClock();
    expect(Math.abs(clock.nowMs() - Date.now())).toBeLessThan(1000);
    expect(Math.abs(systemClock.nowMs() - Date.now())).toBeLessThan(1000);
  });

  it('returns a new Date each call so callers cannot mutate clock state', () => {
    const clock = new MockClock({ now: '2026-01-01T00:00:00Z', frozen: true });
    const d = clock.now();
    d.setUTCFullYear(1999);
    expect(iso(clock)).toBe('2026-01-01T00:00:00.000Z');
  });

  it('reports zoned time and today() in the clock time zone, not the machine time zone', () => {
    const clock = new MockClock({ now: '2026-11-30T20:00:00Z', frozen: true, timeZone: 'Asia/Kolkata' });
    expect(clock.zoned().iso).toBe('2026-12-01T01:30:00+05:30');
    expect(clock.today()).toEqual({ year: 2026, month: 12, day: 1 });
    expect(clock.today('UTC')).toEqual({ year: 2026, month: 11, day: 30 });
  });
});

describe('MockClock: freeze, resume and reset', () => {
  it('freezes at a specific instant and stays there while real time passes', () => {
    const real = fakeReal();
    const clock = new MockClock({ realTime: real.now });
    clock.freeze('2026-11-30T23:59:00Z');
    real.pass(60_000);
    expect(iso(clock)).toBe('2026-11-30T23:59:00.000Z');
    expect(clock.isFrozen()).toBe(true);
    expect(clock.mode).toBe('frozen');
  });

  it('freeze() without an argument freezes the current simulated time', () => {
    const real = fakeReal();
    const clock = new MockClock({ realTime: real.now, now: '2026-06-01T00:00:00Z' });
    real.pass(10_000);
    clock.freeze();
    real.pass(10_000);
    expect(iso(clock)).toBe('2026-06-01T00:00:10.000Z');
  });

  it('resume() continues from the frozen instant, not from where real time would have been', () => {
    const real = fakeReal();
    const clock = new MockClock({ realTime: real.now });
    clock.freeze('2026-01-01T00:00:00Z');
    real.pass(3_600_000);
    clock.resume();
    expect(clock.mode).toBe('running');
    real.pass(1500);
    expect(iso(clock)).toBe('2026-01-01T00:00:01.500Z');
  });

  it('a running simulation moves with real time', () => {
    const real = fakeReal();
    const clock = new MockClock({ realTime: real.now, now: '2026-01-01T00:00:00Z' });
    expect(clock.mode).toBe('running');
    real.pass(2000);
    expect(iso(clock)).toBe('2026-01-01T00:00:02.000Z');
  });

  it('reset() returns to real time and unfreezes', () => {
    const real = fakeReal();
    const clock = new MockClock({ realTime: real.now });
    clock.freeze('2001-01-01T00:00:00Z');
    clock.reset();
    expect(clock.mode).toBe('real');
    expect(clock.isFrozen()).toBe(false);
    expect(clock.nowMs()).toBe(real.now());
  });

  it('frozen: true with no start freezes at the real time', () => {
    const real = fakeReal();
    const clock = new MockClock({ realTime: real.now, frozen: true });
    real.pass(999);
    expect(clock.nowMs()).toBe(real.now() - 999);
  });
});

describe('MockClock: moving through time', () => {
  it('runs the README example exactly', () => {
    const clock = new MockClock();
    clock.freeze('2026-11-30T23:59:00Z');
    clock.advance({ days: 2, hours: 3, minutes: 30 });
    expect(iso(clock)).toBe('2026-12-03T03:29:00.000Z');
    clock.rewind({ days: 1 });
    expect(iso(clock)).toBe('2026-12-02T03:29:00.000Z');
    clock.set('2027-01-01T00:00:00Z');
    expect(iso(clock)).toBe('2027-01-01T00:00:00.000Z');
    clock.reset();
    expect(clock.isSimulated()).toBe(false);
  });

  it('supports every unit', () => {
    const clock = new MockClock({ now: '2026-01-01T00:00:00Z', frozen: true });
    clock.advance({ milliseconds: 5 });
    clock.advance({ seconds: 5 });
    clock.advance({ minutes: 5 });
    clock.advance({ hours: 5 });
    clock.advance({ days: 5 });
    clock.advance({ weeks: 1 });
    clock.advance({ months: 1 });
    clock.advance({ years: 1 });
    expect(iso(clock)).toBe('2027-02-13T05:05:05.005Z');
  });

  it('set() preserves running/frozen state', () => {
    const real = fakeReal();
    const clock = new MockClock({ realTime: real.now, now: '2026-01-01T00:00:00Z' });
    clock.set('2027-01-01T00:00:00Z');
    real.pass(1000);
    expect(iso(clock)).toBe('2027-01-01T00:00:01.000Z');
    clock.freeze().set('2028-01-01T00:00:00Z');
    real.pass(1000);
    expect(iso(clock)).toBe('2028-01-01T00:00:00.000Z');
  });

  it('travel() accepts a local wall-clock target in a named zone', () => {
    const clock = new MockClock({ frozen: true });
    clock.travel({ local: '2027-01-01T09:00', timeZone: 'Asia/Tokyo' });
    expect(iso(clock)).toBe('2027-01-01T00:00:00.000Z');
  });

  it('travel() rejects offset-less strings instead of assuming UTC', () => {
    const clock = new MockClock({ frozen: true });
    expect(() => clock.travel('2027-01-01T09:00')).toThrow(AmbiguousDateInputError);
    expect(() => clock.travel('2027-01-01')).toThrow(/no UTC offset/);
  });

  it('travel() with disambiguation reject throws for nonexistent local times', () => {
    const clock = new MockClock({ frozen: true, timeZone: 'America/New_York' });
    expect(() => clock.travel({ local: '2026-03-08T02:30', disambiguation: 'reject' })).toThrow(NonexistentLocalTimeError);
  });

  it('travelBy() accepts signed durations', () => {
    const clock = new MockClock({ now: '2026-03-15T12:00:00Z', frozen: true });
    clock.travelBy({ days: -3, hours: -1 });
    expect(iso(clock)).toBe('2026-03-12T11:00:00.000Z');
    clock.travelBy({ months: 1 });
    expect(iso(clock)).toBe('2026-04-12T11:00:00.000Z');
  });

  it('advance() and rewind() reject negative and mixed-sign durations', () => {
    const clock = new MockClock({ frozen: true });
    expect(() => clock.advance({ days: -1 })).toThrow(InvalidDurationError);
    expect(() => clock.rewind({ days: -1 })).toThrow(InvalidDurationError);
    expect(() => clock.travelBy({ days: 1, hours: -1 })).toThrow(/same sign/);
  });

  it('catches unit typos with a suggestion', () => {
    const clock = new MockClock({ frozen: true });
    expect(() => clock.advance({ day: 1 } as never)).toThrow(/Did you mean "days"/);
  });

  it('advanceTo() and rewindTo() refuse to go the wrong way', () => {
    const clock = new MockClock({ now: '2026-01-01T00:00:00Z', frozen: true });
    expect(() => clock.advanceTo('2025-01-01T00:00:00Z')).toThrow(InvalidClockOperationError);
    expect(() => clock.rewindTo('2027-01-01T00:00:00Z')).toThrow(InvalidClockOperationError);
    clock.advanceTo('2026-06-01T00:00:00Z');
    expect(iso(clock)).toBe('2026-06-01T00:00:00.000Z');
  });

  it('peek() computes without moving', () => {
    const clock = new MockClock({ now: '2026-01-31T00:00:00Z', frozen: true });
    expect(clock.peek({ months: 1 }).toISOString()).toBe('2026-02-28T00:00:00.000Z');
    expect(iso(clock)).toBe('2026-01-31T00:00:00.000Z');
  });

  it('uses the configured overflow policy', () => {
    const strict = new MockClock({ now: '2026-01-31T00:00:00Z', frozen: true, overflow: 'reject' });
    expect(() => strict.advance({ months: 1 })).toThrow(CalendarOverflowError);
    expect(iso(strict)).toBe('2026-01-31T00:00:00.000Z');
  });

  it('works in simulated time even when starting from real mode', () => {
    const real = fakeReal(Date.UTC(2030, 0, 31));
    const clock = new MockClock({ realTime: real.now });
    clock.advance({ months: 1 });
    expect(iso(clock)).toBe('2030-02-28T00:00:00.000Z');
    expect(clock.mode).toBe('running');
  });
});

describe('MockClock: calendar units follow the clock time zone', () => {
  it('adding one day across a spring-forward elapses 23 hours but keeps wall time', () => {
    const clock = new MockClock({ timeZone: 'America/New_York', frozen: true });
    clock.travel({ local: '2026-03-07T12:00' });
    const before = clock.nowMs();
    clock.advance({ days: 1 });
    expect(clock.zoned().iso).toBe('2026-03-08T12:00:00-04:00');
    expect((clock.nowMs() - before) / 3_600_000).toBe(23);
  });

  it('adding 24 hours across a spring-forward changes the wall time', () => {
    const clock = new MockClock({ timeZone: 'America/New_York', frozen: true });
    clock.travel({ local: '2026-03-07T12:00' });
    clock.advance({ hours: 24 });
    expect(clock.zoned().iso).toBe('2026-03-08T13:00:00-04:00');
  });

  it('a calendar day in Asia/Kolkata starts at 18:30 UTC', () => {
    const clock = new MockClock({ timeZone: 'Asia/Kolkata', frozen: true });
    clock.travel({ local: '2026-11-30T23:59:59' });
    expect(iso(clock)).toBe('2026-11-30T18:29:59.000Z');
    clock.advance({ seconds: 1 });
    expect(clock.today()).toEqual({ year: 2026, month: 12, day: 1 });
  });

  it('setTimeZone changes calendar arithmetic without moving time', () => {
    const clock = new MockClock({ now: '2026-01-31T20:00:00Z', frozen: true });
    clock.setTimeZone('Asia/Tokyo'); // 2026-02-01 05:00 in Tokyo
    expect(iso(clock)).toBe('2026-01-31T20:00:00.000Z');
    clock.advance({ months: 1 });
    expect(clock.zoned().iso).toBe('2026-03-01T05:00:00+09:00');
  });
});

describe('MockClock: isolation', () => {
  it('instances do not share state', () => {
    const a = new MockClock({ now: '2026-01-01T00:00:00Z', frozen: true });
    const b = new MockClock({ now: '2030-01-01T00:00:00Z', frozen: true });
    a.advance({ days: 1 });
    b.rewind({ years: 1 });
    expect(iso(a)).toBe('2026-01-02T00:00:00.000Z');
    expect(iso(b)).toBe('2029-01-01T00:00:00.000Z');
    a.reset();
    expect(b.isFrozen()).toBe(true);
  });

  it('many concurrent async tasks with their own clocks stay independent', async () => {
    const results = await Promise.all(
      Array.from({ length: 50 }, async (_, i) => {
        const clock = new MockClock({ now: Date.UTC(2026, 0, 1), frozen: true });
        for (let step = 0; step < 10; step++) {
          await new Promise((r) => setTimeout(r, Math.random() * 2));
          clock.advance({ days: i });
        }
        return clock.today();
      }),
    );
    results.forEach((d, i) => {
      const expected = new Date(Date.UTC(2026, 0, 1 + i * 10));
      expect(d).toEqual({ year: expected.getUTCFullYear(), month: expected.getUTCMonth() + 1, day: expected.getUTCDate() });
    });
  });

  it('never modifies the global Date', () => {
    const before = Date.now;
    const clock = new MockClock();
    clock.freeze('1999-12-31T23:59:59Z');
    expect(Date.now).toBe(before);
    expect(Math.abs(Date.now() - new Date().getTime())).toBeLessThan(1000);
    expect(new Date().getUTCFullYear()).not.toBe(1999);
  });
});

describe('MockClock: events and history', () => {
  it('emits change events with deltas and labels', () => {
    const clock = new MockClock({ now: '2026-01-01T00:00:00Z', frozen: true });
    const events: ClockChangeEvent[] = [];
    const off = clock.subscribe((e) => events.push(e));
    clock.advance({ hours: 1 }, 'first');
    clock.rewind({ minutes: 30 });
    off();
    clock.advance({ hours: 5 });
    expect(events.map((e) => [e.action, e.deltaMs, e.label])).toEqual([
      ['advance', 3_600_000, 'first'],
      ['rewind', -1_800_000, undefined],
    ]);
    expect(clock.history.map((h) => h.action)).toEqual(['advance', 'rewind', 'advance']);
  });

  it('bounds history and can disable it', () => {
    const clock = new MockClock({ frozen: true, historyLimit: 2 });
    clock.tick(1).tick(2).tick(3);
    expect(clock.history.map((h) => h.deltaMs)).toEqual([2, 3]);
    const none = new MockClock({ frozen: true, historyLimit: 0 });
    none.tick(1);
    expect(none.history).toHaveLength(0);
  });

  it('a throwing listener does not block other listeners or roll back state', () => {
    const clock = new MockClock({ now: 0, frozen: true });
    const good = vi.fn();
    clock.subscribe(() => {
      throw new Error('boom');
    });
    clock.subscribe(good);
    expect(() => clock.tick(10)).toThrow('boom');
    expect(good).toHaveBeenCalledOnce();
    expect(clock.nowMs()).toBe(10);
  });
});

describe('MockClock: snapshots', () => {
  it('round-trips a frozen clock', () => {
    const clock = new MockClock({ now: '2026-05-05T05:05:05Z', frozen: true, timeZone: 'Europe/London' });
    const json = JSON.parse(JSON.stringify(clock));
    const restored = MockClock.fromSnapshot(json);
    expect(iso(restored)).toBe('2026-05-05T05:05:05.000Z');
    expect(restored.timeZone).toBe('Europe/London');
    expect(restored.isFrozen()).toBe(true);
  });

  it('a running snapshot keeps running relative to real time', () => {
    const real = fakeReal();
    const clock = new MockClock({ realTime: real.now, now: '2026-01-01T00:00:00Z' });
    const snap = clock.toJSON();
    real.pass(5000);
    const restored = MockClock.fromSnapshot(snap, { realTime: real.now });
    expect(iso(restored)).toBe('2026-01-01T00:00:05.000Z');
  });

  it('rejects malformed snapshots', () => {
    expect(() => MockClock.fromSnapshot(null)).toThrow(InvalidSnapshotError);
    expect(() => MockClock.fromSnapshot({ version: 2 })).toThrow(/version/);
    expect(() =>
      MockClock.fromSnapshot({ version: 1, mode: 'frozen', timeZone: 'UTC', simulatedMs: 'x', realAnchorMs: 0 }),
    ).toThrow(/simulatedMs/);
    expect(() =>
      MockClock.fromSnapshot({ version: 1, mode: 'frozen', timeZone: 'Mars/Olympus', simulatedMs: 0, realAnchorMs: 0 }),
    ).toThrow(/Unknown time zone/);
  });
});

describe('MockClock: validation', () => {
  it('rejects invalid options and inputs', () => {
    expect(() => new MockClock({ timeZone: 'Not/AZone' })).toThrow(/Unknown time zone/);
    expect(() => new MockClock({ now: new Date('nope') })).toThrow(/invalid Date/);
    expect(() => new MockClock({ now: Number.NaN })).toThrow(/finite/);
    expect(() => new MockClock({ historyLimit: -1 })).toThrow(/historyLimit/);
    expect(() => new MockClock({ overflow: 'wrap' as never })).toThrow(/overflow/);
    const clock = new MockClock({ frozen: true });
    expect(() => clock.set('2026-02-30T00:00:00Z')).toThrow(/has 28 days/);
    expect(() => clock.set({} as never)).toThrow(/expected a Date/);
  });
});
