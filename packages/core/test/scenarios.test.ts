import { describe, expect, it } from 'vitest';
import {
  InvalidScenarioParameterError,
  MockClock,
  SCENARIO_IDS,
  UnknownScenarioError,
  describeScenario,
  listScenarios,
  resolveScenario,
} from '@workfonic/mockclock';

describe('scenario registry', () => {
  it('contains the 15 documented scenarios', () => {
    expect(SCENARIO_IDS).toEqual([
      'month-end',
      'year-end',
      'leap-day',
      'trial-expiry',
      'subscription-renewal',
      'payroll',
      'invoice-due',
      'quarter-close',
      'midnight-rollover',
      'dst-transition',
      'holiday-boundary',
      'leave-accrual',
      'token-expiry',
      'coupon-expiry',
      'billing-retry',
    ]);
    expect(listScenarios()).toHaveLength(15);
  });

  it.each(SCENARIO_IDS.map((id) => [id]))('%s resolves with defaults; events sorted; starts before its first future event', (id) => {
    const s = resolveScenario(id);
    expect(s.events.length).toBeGreaterThan(0);
    const times = s.events.map((e) => e.atMs);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(s.events.some((e) => e.atMs > s.startMs)).toBe(true);
    const clock = MockClock.scenario(id);
    expect(clock.isFrozen()).toBe(true);
    expect(clock.nowMs()).toBe(s.startMs);
    expect(clock.timeZone).toBe(s.timeZone);
    expect(clock.scenario?.id).toBe(id);
    // every param has a description and a default
    for (const spec of Object.values(describeScenario(id).params)) {
      expect(spec.description.length).toBeGreaterThan(5);
      expect(spec.default).toBeDefined();
    }
  });

  it('rejects unknown scenarios and parameters', () => {
    expect(() => resolveScenario('month-start')).toThrow(UnknownScenarioError);
    expect(() => resolveScenario('month-end', { mnth: 2 })).toThrow(/unknown parameter "mnth"/);
    expect(() => resolveScenario('month-end', { month: 13 })).toThrow(/at most 12/);
    expect(() => resolveScenario('month-end', { month: 'two' })).toThrow(InvalidScenarioParameterError);
    expect(() => resolveScenario('month-end', { timeZone: 'Nowhere/Land' })).toThrow(/IANA/);
    expect(() => resolveScenario('subscription-renewal', { interval: 'weekly' })).toThrow(/monthly, yearly/);
    expect(() => resolveScenario('invoice-due', { issueDate: '2026-02-30' })).toThrow(/issueDate/);
    expect(() => resolveScenario('token-expiry', { issuedAt: '2026-01-01T00:00' })).toThrow(/no UTC offset/);
  });

  it('accepts CLI-style string parameters', () => {
    const s = resolveScenario('month-end', { year: '2027', month: '2' });
    expect(s.params).toMatchObject({ year: 2027, month: 2 });
    expect(s.events.find((e) => e.id === 'next-month')?.at).toBe('2027-03-01T00:00:00.000Z');
    const r = resolveScenario('billing-retry', { retryDays: '2,5' });
    expect(r.events.map((e) => e.id)).toEqual(['charge-failed', 'retry-1', 'retry-2', 'cancelled']);
  });
});

describe('scenario behaviour', () => {
  it('month-end: advancing past the lead rolls into the next month', () => {
    const clock = MockClock.scenario('month-end', { year: 2027, month: 2 });
    expect(clock.today()).toEqual({ year: 2027, month: 2, day: 28 });
    clock.advance({ minutes: 1 });
    expect(clock.today()).toEqual({ year: 2027, month: 3, day: 1 });
  });

  it('month-end honours the scenario time zone', () => {
    const clock = MockClock.scenario('month-end', { timeZone: 'Asia/Kolkata' });
    expect(clock.zoned().iso).toBe('2026-11-30T23:59:00+05:30');
    expect(clock.now().toISOString()).toBe('2026-11-30T18:29:00.000Z');
  });

  it('year-end lands on January 1', () => {
    const clock = MockClock.scenario('year-end', { year: 2030 });
    clock.advance({ seconds: 60 });
    expect(clock.today()).toEqual({ year: 2031, month: 1, day: 1 });
  });

  it('leap-day rejects non-leap years and constrains the anniversary', () => {
    expect(() => resolveScenario('leap-day', { year: 2027 })).toThrow(/not a leap year/);
    const s = resolveScenario('leap-day', { year: 2032 });
    expect(s.events.find((e) => e.id === 'anniversary')?.at).toBe('2033-02-28T00:00:00.000Z');
  });

  it('subscription-renewal anchors to the original day of month', () => {
    const s = resolveScenario('subscription-renewal');
    expect(s.events.filter((e) => e.id.startsWith('renewal')).map((e) => e.at.slice(0, 10))).toEqual([
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
    ]);
    const yearly = resolveScenario('subscription-renewal', { anchorDate: '2028-02-29', interval: 'yearly', periods: 4 });
    expect(yearly.events.filter((e) => e.id.startsWith('renewal')).map((e) => e.at.slice(0, 10))).toEqual([
      '2029-02-28',
      '2030-02-28',
      '2031-02-28',
      '2032-02-29',
    ]);
  });

  it('walks through scenario events with advanceTo', () => {
    const clock = MockClock.scenario('billing-retry');
    const seen: string[] = [];
    for (const e of clock.scenario!.events) {
      if (e.atMs < clock.nowMs()) continue;
      clock.advanceTo(e.atMs, e.id);
      seen.push(clock.toISOString());
    }
    expect(seen).toEqual([
      '2026-12-01T09:00:00.000Z',
      '2026-12-03T09:00:00.000Z',
      '2026-12-07T09:00:00.000Z',
      '2026-12-10T09:00:00.000Z',
    ]);
    expect(clock.history.map((h) => h.label)).toEqual(['retry-1', 'retry-2', 'retry-3', 'cancelled']);
  });

  it('payroll moves pay day before weekends and holidays', () => {
    // January 2026 ends on a Saturday, so pay day is Friday the 30th.
    const s = resolveScenario('payroll', { year: 2026, month: 1 });
    expect(s.events.find((e) => e.id === 'pay-day')?.at.slice(0, 10)).toBe('2026-01-30');
    expect(s.events.find((e) => e.id === 'cutoff')?.at).toBe('2026-01-27T17:00:00.000Z');
    const h = resolveScenario('payroll', { year: 2026, month: 1, holidays: ['2026-01-30'] });
    expect(h.events.find((e) => e.id === 'pay-day')?.at.slice(0, 10)).toBe('2026-01-29');
  });

  it('invoice-due becomes overdue at the start of the day after the due date', () => {
    const s = resolveScenario('invoice-due', { issueDate: '2026-01-31', netDays: 30, timeZone: 'Europe/London' });
    expect(s.events.find((e) => e.id === 'due')?.local).toBe('2026-03-02T00:00:00+00:00');
    expect(s.events.find((e) => e.id === 'overdue')?.local).toBe('2026-03-03T00:00:00+00:00');
  });

  it('quarter-close supports April fiscal years', () => {
    const s = resolveScenario('quarter-close', { year: 2026, quarter: 4, fiscalYearStartMonth: 4 });
    expect(s.events.find((e) => e.id === 'quarter-closed')?.at).toBe('2027-04-01T00:00:00.000Z');
  });

  it('dst-transition finds spring and fall transitions and rejects non-DST zones', () => {
    const fwd = MockClock.scenario('dst-transition');
    expect(fwd.zoned().iso).toBe('2026-03-08T01:59:00-05:00');
    fwd.advance({ minutes: 1 });
    expect(fwd.zoned().iso).toBe('2026-03-08T03:00:00-04:00');
    const back = MockClock.scenario('dst-transition', { direction: 'backward', timeZone: 'Europe/London' });
    expect(back.zoned().iso).toBe('2026-10-25T01:59:00+01:00');
    back.advance({ minutes: 1 });
    expect(back.zoned().iso).toBe('2026-10-25T01:00:00+00:00');
    expect(() => resolveScenario('dst-transition', { timeZone: 'Asia/Kolkata' })).toThrow(/no forward transition/);
  });

  it('holiday-boundary lists every non-working day until the next business day', () => {
    const s = resolveScenario('holiday-boundary');
    expect(s.events.map((e) => e.label)).toEqual([
      'Holiday: 2026-12-25',
      'Weekend: 2026-12-26',
      'Weekend: 2026-12-27',
      'Next business day (2026-12-28)',
    ]);
  });

  it('token-expiry is exact elapsed time', () => {
    const clock = MockClock.scenario('token-expiry', { ttlSeconds: 900 });
    expect(clock.toISOString()).toBe('2026-11-25T12:14:59.000Z');
    clock.tick(1000);
    expect(clock.nowMs()).toBe(clock.scenario!.events.find((e) => e.id === 'expires')!.atMs);
  });

  it('coupon-expiry expires at local midnight in its zone', () => {
    const s = resolveScenario('coupon-expiry');
    expect(s.events.find((e) => e.id === 'expired')?.at).toBe('2027-01-01T05:00:00.000Z');
  });

  it('leave-accrual accrues monthly with clamped anniversaries', () => {
    const s = resolveScenario('leave-accrual', { months: 3 });
    expect(s.events.map((e) => e.label)).toEqual([
      'Employment starts (2026-01-31)',
      'Accrual 1: 2.00 days (2026-02-28)',
      'Accrual 2: 4.00 days (2026-03-31)',
      'Accrual 3: 6.00 days (2026-04-30)',
    ]);
  });

  it('trial-expiry counts calendar days in the scenario zone across DST', () => {
    const s = resolveScenario('trial-expiry', { signupAt: '2026-03-01T15:00:00Z', trialDays: 14, timeZone: 'America/New_York' });
    // 10:00 EST on Mar 1 -> 10:00 EDT on Mar 15 (13 days 23 hours later)
    expect(s.events.find((e) => e.id === 'trial-ends')?.local).toBe('2026-03-15T10:00:00-04:00');
  });

  it('scenario clocks accept extra options and stay independent', () => {
    const a = MockClock.scenario('month-end');
    const b = MockClock.scenario('month-end', {}, { overflow: 'reject' });
    a.advance({ days: 1 });
    expect(b.toISOString()).toBe('2026-11-30T23:59:00.000Z');
    expect(b.overflow).toBe('reject');
  });
});
