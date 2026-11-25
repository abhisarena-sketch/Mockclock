import { afterEach, describe, expect, it } from 'vitest';
import { MockClock } from '@workfonic/mockclock';
import {
  GlobalPatchConflictError,
  installGlobalDate,
  isGlobalDateInstalled,
  restoreGlobalDate,
  withGlobalDate,
} from '@workfonic/mockclock-node';

const NativeDate = globalThis.Date;
const nativeNow = Date.now;

afterEach(() => {
  // Safety net so one failing test cannot leak a patch into the next.
  restoreGlobalDate();
  expect(globalThis.Date).toBe(NativeDate);
});

const frozen = (iso = '2026-11-30T23:59:00Z') => new MockClock({ now: iso, frozen: true });

describe('importing has no side effects', () => {
  it('does not patch Date on import', () => {
    expect(globalThis.Date).toBe(NativeDate);
    expect(Date.now).toBe(nativeNow);
    expect(isGlobalDateInstalled()).toBe(false);
  });
});

describe('installGlobalDate', () => {
  it('makes Date.now(), new Date() and Date() read the clock', () => {
    const clock = frozen();
    const handle = installGlobalDate(clock);
    try {
      expect(Date.now()).toBe(Date.parse('2026-11-30T23:59:00Z'));
      expect(new Date().toISOString()).toBe('2026-11-30T23:59:00.000Z');
      expect(Date()).toBe(new NativeDate('2026-11-30T23:59:00Z').toString());
      clock.advance({ days: 1 });
      expect(new Date().toISOString()).toBe('2026-12-01T23:59:00.000Z');
    } finally {
      handle.uninstall();
    }
  });

  it('keeps every other Date behaviour native', () => {
    const handle = installGlobalDate(frozen());
    try {
      expect(new Date(0).toISOString()).toBe('1970-01-01T00:00:00.000Z');
      expect(new Date(2020, 0, 1).getFullYear()).toBe(2020);
      expect(new Date('2020-05-05T00:00:00Z').getTime()).toBe(1588636800000);
      expect(Date.UTC(2020, 0, 1)).toBe(1577836800000);
      expect(Date.parse('2020-01-01T00:00:00Z')).toBe(1577836800000);
      expect(new Date() instanceof Date).toBe(true);
      expect(new NativeDate() instanceof Date).toBe(true);
      expect(new Date() instanceof NativeDate).toBe(true);
      expect(Object.prototype.toString.call(new Date())).toBe('[object Date]');
      expect(Date.prototype).toBe(NativeDate.prototype);
      expect(Date.name).toBe('Date');
      class Sub extends Date {
        label() {
          return 'sub';
        }
      }
      const s = new Sub();
      expect(s.label()).toBe('sub');
      expect(s.toISOString()).toBe('2026-11-30T23:59:00.000Z');
      expect(s instanceof Date).toBe(true);
    } finally {
      handle.uninstall();
    }
  });

  it('restores the exact original constructor and Date.now', () => {
    const handle = installGlobalDate(frozen());
    expect(globalThis.Date).not.toBe(NativeDate);
    handle.uninstall();
    expect(globalThis.Date).toBe(NativeDate);
    expect(Date.now).toBe(nativeNow);
    expect(handle.active).toBe(false);
    expect(() => handle.uninstall()).not.toThrow();
    expect(new Date().getUTCFullYear()).toBeGreaterThanOrEqual(2024);
  });

  it('prevents conflicting simultaneous installations', () => {
    const a = installGlobalDate(frozen());
    try {
      expect(() => installGlobalDate(frozen('2000-01-01T00:00:00Z'))).toThrow(GlobalPatchConflictError);
      // The first clock still owns Date.
      expect(new Date().toISOString()).toBe('2026-11-30T23:59:00.000Z');
    } finally {
      a.uninstall();
    }
    const b = installGlobalDate(frozen('2000-01-01T00:00:00Z'));
    expect(new Date().toISOString()).toBe('2000-01-01T00:00:00.000Z');
    b.uninstall();
  });

  it('refuses to clobber a patch installed on top of it', () => {
    const handle = installGlobalDate(frozen());
    const ours = globalThis.Date;
    const someoneElse = function FakeDate() {} as unknown as DateConstructor;
    globalThis.Date = someoneElse;
    expect(() => handle.uninstall()).toThrow(/replaced by other code/);
    globalThis.Date = ours;
    handle.uninstall();
    expect(globalThis.Date).toBe(NativeDate);
  });

  it('can patch an isolated target object', () => {
    const target = { Date: NativeDate } as unknown as typeof globalThis;
    const handle = installGlobalDate(frozen(), { target });
    expect(new target.Date().toISOString()).toBe('2026-11-30T23:59:00.000Z');
    expect(globalThis.Date).toBe(NativeDate);
    handle.uninstall();
    expect(target.Date).toBe(NativeDate);
  });

  it('validates its arguments', () => {
    expect(() => installGlobalDate({} as never)).toThrow(TypeError);
  });

  it('does not affect the MockClock real-time source (no feedback loop)', () => {
    const clock = new MockClock(); // real mode
    const handle = installGlobalDate(clock);
    try {
      const a = Date.now();
      expect(Math.abs(a - clock.realNowMs())).toBeLessThan(1000);
      expect(new Date().getUTCFullYear()).toBeGreaterThanOrEqual(2024);
    } finally {
      handle.uninstall();
    }
  });
});

describe('withGlobalDate', () => {
  it('restores after a synchronous return', () => {
    const value = withGlobalDate(frozen(), () => new Date().toISOString());
    expect(value).toBe('2026-11-30T23:59:00.000Z');
    expect(globalThis.Date).toBe(NativeDate);
  });

  it('restores after a synchronous throw', () => {
    expect(() =>
      withGlobalDate(frozen(), () => {
        throw new Error('sync failure');
      }),
    ).toThrow('sync failure');
    expect(globalThis.Date).toBe(NativeDate);
    expect(isGlobalDateInstalled()).toBe(false);
  });

  it('restores after an async resolve', async () => {
    const value = await withGlobalDate(frozen(), async () => {
      await new Promise((r) => setTimeout(r, 1));
      return new Date().toISOString();
    });
    expect(value).toBe('2026-11-30T23:59:00.000Z');
    expect(globalThis.Date).toBe(NativeDate);
  });

  it('restores after an async rejection', async () => {
    await expect(
      withGlobalDate(frozen(), async () => {
        await Promise.resolve();
        throw new Error('async failure');
      }),
    ).rejects.toThrow('async failure');
    expect(globalThis.Date).toBe(NativeDate);
  });

  it('rejects concurrent use instead of interleaving clocks', async () => {
    const first = withGlobalDate(frozen(), () => new Promise((r) => setTimeout(r, 5)));
    expect(() => withGlobalDate(frozen(), () => 1)).toThrow(GlobalPatchConflictError);
    await first;
    expect(globalThis.Date).toBe(NativeDate);
  });
});
