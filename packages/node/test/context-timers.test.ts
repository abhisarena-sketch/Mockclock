import * as FakeTimers from '@sinonjs/fake-timers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockClock, type ClockLike } from '@workfonic/mockclock';
import {
  ambientClock,
  createDateFactory,
  createNowFunction,
  currentClock,
  hasAmbientClock,
  installFakeTimers,
  linkTestFrameworkTimers,
  linkTimers,
  runWithClock,
  setupMockClock,
} from '@workfonic/mockclock-node';

const NativeDate = globalThis.Date;
const nativeSetTimeout = globalThis.setTimeout;

describe('dependency injection helpers', () => {
  it('createNowFunction and createDateFactory read the injected clock', () => {
    const clock = new MockClock({ now: '2026-01-01T00:00:00Z', frozen: true });
    const now = createNowFunction(clock);
    const makeDate = createDateFactory(clock);
    expect(now()).toBe(Date.parse('2026-01-01T00:00:00Z'));
    clock.advance({ hours: 1 });
    expect(makeDate().toISOString()).toBe('2026-01-01T01:00:00.000Z');
    expect(makeDate(0).toISOString()).toBe('1970-01-01T00:00:00.000Z');
    expect(() => createNowFunction(null as never)).toThrow(TypeError);
  });

  it('a service using ClockLike can be tested without any global patching', () => {
    class TokenService {
      constructor(private readonly clock: ClockLike) {}
      isExpired(expMs: number) {
        return this.clock.nowMs() >= expMs;
      }
    }
    const clock = new MockClock({ now: '2026-01-01T00:00:00Z', frozen: true });
    const svc = new TokenService(clock);
    const exp = Date.parse('2026-01-01T01:00:00Z');
    expect(svc.isExpired(exp)).toBe(false);
    clock.advance({ hours: 1 });
    expect(svc.isExpired(exp)).toBe(true);
  });
});

describe('runWithClock (AsyncLocalStorage)', () => {
  it('falls back to the system clock outside a context', () => {
    expect(hasAmbientClock()).toBe(false);
    expect(Math.abs(currentClock().nowMs() - Date.now())).toBeLessThan(1000);
  });

  it('propagates through await and timers, and isolates concurrent contexts', async () => {
    const read = async () => {
      await new Promise((r) => setTimeout(r, Math.random() * 5));
      await Promise.resolve();
      return ambientClock.now().toISOString();
    };
    const a = new MockClock({ now: '2026-01-01T00:00:00Z', frozen: true });
    const b = new MockClock({ now: '2030-06-15T12:00:00Z', frozen: true });
    const results = await Promise.all([
      runWithClock(a, read),
      runWithClock(b, read),
      runWithClock(a, read),
      runWithClock(b, read),
    ]);
    expect(results).toEqual([
      '2026-01-01T00:00:00.000Z',
      '2030-06-15T12:00:00.000Z',
      '2026-01-01T00:00:00.000Z',
      '2030-06-15T12:00:00.000Z',
    ]);
    expect(hasAmbientClock()).toBe(false);
  });

  it('restores the outer context after an exception', () => {
    const outer = new MockClock({ now: 0, frozen: true });
    runWithClock(outer, () => {
      expect(() =>
        runWithClock(new MockClock({ now: 1000, frozen: true }), () => {
          throw new Error('inner');
        }),
      ).toThrow('inner');
      expect(currentClock().nowMs()).toBe(0);
    });
  });
});

describe('installFakeTimers (@sinonjs/fake-timers)', () => {
  it('fires setTimeout and setInterval callbacks when the MockClock advances', () => {
    const clock = new MockClock({ now: '2026-01-01T00:00:00Z', frozen: true });
    const handle = installFakeTimers(clock, { implementation: FakeTimers });
    try {
      const fired: string[] = [];
      setTimeout(() => fired.push(`timeout@${new Date().toISOString()}`), 30_000);
      const id = setInterval(() => fired.push(`interval@${Date.now()}`), 20_000);
      clock.advance({ seconds: 10 });
      expect(fired).toEqual([]);
      clock.advance({ seconds: 25 });
      expect(fired).toEqual([
        `interval@${Date.parse('2026-01-01T00:00:20Z')}`,
        'timeout@2026-01-01T00:00:30.000Z',
      ]);
      clearInterval(id);
      clock.advance({ minutes: 5 });
      expect(fired).toHaveLength(2);
      expect(new Date().toISOString()).toBe(clock.toISOString());
    } finally {
      handle.uninstall();
    }
    expect(globalThis.Date).toBe(NativeDate);
    expect(globalThis.setTimeout).toBe(nativeSetTimeout);
  });

  it('rewinding moves fake time back without firing timers', () => {
    const clock = new MockClock({ now: '2026-01-01T00:00:00Z', frozen: true });
    const handle = installFakeTimers(clock, { implementation: FakeTimers });
    try {
      const cb = vi.fn();
      setTimeout(cb, 60_000);
      clock.rewind({ hours: 1 });
      expect(cb).not.toHaveBeenCalled();
      expect(Date.now()).toBe(clock.nowMs());
      clock.advance({ hours: 1, minutes: 1 });
      expect(cb).toHaveBeenCalledOnce();
    } finally {
      handle.uninstall();
    }
  });

  it('handles timer callbacks that move the clock again', () => {
    const clock = new MockClock({ now: 0, frozen: true });
    const handle = installFakeTimers(clock, { implementation: FakeTimers });
    try {
      const fired: number[] = [];
      setTimeout(() => {
        fired.push(Date.now());
        clock.advance({ seconds: 5 });
        setTimeout(() => fired.push(Date.now()), 1000);
      }, 1000);
      clock.advance({ seconds: 2 });
      expect(fired[0]).toBe(1000);
      expect(clock.nowMs()).toBe(7000);
      expect(fired).toHaveLength(2);
    } finally {
      handle.uninstall();
    }
  });

  it('requires a frozen clock and the implementation module', () => {
    expect(() => installFakeTimers(new MockClock(), { implementation: FakeTimers })).toThrow(/frozen/);
    expect(() => installFakeTimers(new MockClock({ frozen: true }), {} as never)).toThrow(/implementation/);
    expect(globalThis.setTimeout).toBe(nativeSetTimeout);
  });

  it('uninstall stops syncing and is idempotent', () => {
    const clock = new MockClock({ now: 0, frozen: true });
    const handle = installFakeTimers(clock, { implementation: FakeTimers });
    handle.uninstall();
    handle.uninstall();
    expect(() => clock.advance({ seconds: 1 })).not.toThrow();
    expect(globalThis.Date).toBe(NativeDate);
  });
});

describe('linkTestFrameworkTimers (Vitest vi)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('drives vi fake timers from the MockClock', () => {
    vi.useFakeTimers();
    const clock = new MockClock({ now: '2026-11-30T23:59:00Z', frozen: true });
    const link = linkTestFrameworkTimers(clock, vi);
    const cb = vi.fn(() => new Date().toISOString());
    setTimeout(cb, 60_000);
    clock.advance({ seconds: 59 });
    expect(cb).not.toHaveBeenCalled();
    clock.advance({ seconds: 1 });
    expect(cb).toHaveReturnedWith('2026-12-01T00:00:00.000Z');
    link.unlink();
    expect(link.linked).toBe(false);
  });

  it('linkTimers drives any driver and rejects running clocks', () => {
    const calls: string[] = [];
    const clock = new MockClock({ now: 0, frozen: true });
    const link = linkTimers(clock, {
      tick: (ms) => calls.push(`tick ${ms}`),
      setSystemTime: (ms) => calls.push(`set ${ms}`),
    });
    clock.advance({ seconds: 1 });
    clock.rewind({ milliseconds: 500 });
    link.unlink();
    clock.advance({ seconds: 1 });
    expect(calls).toEqual(['set 0', 'tick 1000', 'set 500']);
    expect(() => linkTimers(new MockClock(), { tick() {}, setSystemTime() {} })).toThrow(/frozen/);
    expect(() => linkTestFrameworkTimers(new MockClock({ frozen: true }), {} as never)).toThrow(TypeError);
  });
});

describe('setupMockClock', () => {
  describe('with global Date patching', () => {
    const ctx = setupMockClock({ beforeEach, afterEach }, { now: '2026-11-30T23:59:00Z', frozen: true, patchGlobalDate: true });

    it('gives each test a fresh clock and patched Date', () => {
      expect(new Date().toISOString()).toBe('2026-11-30T23:59:00.000Z');
      ctx.clock.advance({ days: 3 });
      expect(new Date().toISOString()).toBe('2026-12-03T23:59:00.000Z');
    });

    it('does not leak state from the previous test', () => {
      expect(ctx.clock.toISOString()).toBe('2026-11-30T23:59:00.000Z');
    });
  });

  describe('without patching', () => {
    const ctx = setupMockClock({ beforeEach, afterEach }, { now: '2026-01-01T00:00:00Z', frozen: true });
    it('leaves Date alone', () => {
      expect(globalThis.Date).toBe(NativeDate);
      expect(ctx.clock.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    });
  });

  it('restores Date after the patched suite', () => {
    expect(globalThis.Date).toBe(NativeDate);
  });

  it('validates hooks', () => {
    expect(() => setupMockClock({} as never)).toThrow(TypeError);
  });
});
