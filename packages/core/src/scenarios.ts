/**
 * The scenario registry. Every scenario, its parameters and its default values
 * are defined once, in {@link SCENARIOS}, and nowhere else. The CLI, the
 * playground and the documentation all read from this registry.
 */
import {
  addBusinessDays,
  addDays,
  addMonths,
  addYears,
  daysInMonth,
  endOfMonth,
  formatPlainDate,
  isBusinessDay,
  isLeapYear,
  lastBusinessDayOfMonth,
  parsePlainDate,
  parsePlainTime,
  plainDate,
  plainDateTime,
  type IsoDayOfWeek,
  type PlainDate,
} from './calendar.js';
import { InvalidScenarioParameterError, UnknownScenarioError } from './errors.js';
import { formatInstant, parseInstant } from './instant.js';
import {
  addDuration,
  assertTimeZone,
  formatInTimeZone,
  fromLocal,
  isValidTimeZone,
  startOfLocalDay,
  transitionsInYear,
} from './timezone.js';

export type ScenarioCategory = 'calendar' | 'billing' | 'finance' | 'payroll' | 'hr' | 'security' | 'time-zone';

export type ScenarioParamType =
  | 'integer'
  | 'string'
  | 'date'
  | 'time'
  | 'instant'
  | 'timeZone'
  | 'enum'
  | 'integer[]'
  | 'date[]';

export type ScenarioParamValue = string | number | readonly string[] | readonly number[];

export interface ScenarioParamSpec {
  readonly type: ScenarioParamType;
  readonly default: ScenarioParamValue;
  readonly description: string;
  readonly min?: number;
  readonly max?: number;
  readonly values?: readonly string[];
}

/** Parameter overrides. Values may be typed or strings (as passed from the CLI). */
export type ScenarioParams = Readonly<Record<string, ScenarioParamValue | undefined>>;

export interface ScenarioEvent {
  readonly id: string;
  readonly label: string;
  readonly atMs: number;
  /** UTC ISO string. */
  readonly at: string;
  /** Local ISO string with offset in the scenario's time zone. */
  readonly local: string;
  readonly description?: string;
}

export interface ResolvedScenario {
  readonly id: ScenarioId;
  readonly title: string;
  readonly description: string;
  readonly category: ScenarioCategory;
  readonly timeZone: string;
  /** Where the clock starts (frozen), epoch ms. */
  readonly startMs: number;
  readonly start: string;
  readonly startLocal: string;
  /** Key instants, sorted ascending. Use `clock.advanceTo(event.atMs)` to walk through them. */
  readonly events: readonly ScenarioEvent[];
  /** The fully-resolved parameters (defaults merged with overrides). */
  readonly params: Readonly<Record<string, ScenarioParamValue>>;
  readonly notes: readonly string[];
}

export interface ScenarioSummary {
  readonly id: ScenarioId;
  readonly title: string;
  readonly description: string;
  readonly category: ScenarioCategory;
  readonly params: Readonly<Record<string, ScenarioParamSpec>>;
}

type Values = Record<string, ScenarioParamValue>;

interface ScenarioDefinition {
  readonly title: string;
  readonly description: string;
  readonly category: ScenarioCategory;
  readonly params: Readonly<Record<string, ScenarioParamSpec>>;
  readonly resolve: (p: Values) => { start: number; timeZone: string; events: EventSpec[]; notes?: string[] };
}

interface EventSpec {
  id: string;
  label: string;
  atMs: number;
  description?: string;
}

// Shared parameter specs. Default values live here and only here.
const tz = (def: string, description = 'IANA time zone the scenario is evaluated in.'): ScenarioParamSpec => ({
  type: 'timeZone',
  default: def,
  description,
});
const lead = (def: number, what: string): ScenarioParamSpec => ({
  type: 'integer',
  default: def,
  min: 0,
  max: 31 * 86_400,
  description: `Seconds before ${what} at which the clock starts.`,
});
const weekend: ScenarioParamSpec = {
  type: 'integer[]',
  default: [6, 7],
  min: 1,
  max: 7,
  description: 'ISO weekdays treated as the weekend (1 = Monday ... 7 = Sunday).',
};

const num = (p: Values, k: string) => p[k] as number;
const str = (p: Values, k: string) => p[k] as string;
const dateOf = (p: Values, k: string) => parsePlainDate(p[k] as string);
const midnight = (d: PlainDate, zone: string) => startOfLocalDay(d, zone);
const localAt = (d: PlainDate, time: string, zone: string) =>
  fromLocal(plainDateTime(d, parsePlainTime(time)), zone, 'compatible');

function nextMonthStart(year: number, month: number): PlainDate {
  return addMonths(plainDate(year, month, 1), 1);
}

export const SCENARIOS = {
  'month-end': {
    title: 'Month-end',
    description: 'The last seconds of a month, rolling over into the first day of the next month.',
    category: 'calendar',
    params: {
      year: { type: 'integer', default: 2026, min: 1970, max: 9998, description: 'Calendar year.' },
      month: { type: 'integer', default: 11, min: 1, max: 12, description: 'Month (1-12) whose end is simulated.' },
      timeZone: tz('UTC'),
      leadSeconds: lead(60, 'local midnight of the next month'),
    },
    resolve: (p) => {
      const zone = str(p, 'timeZone');
      const last = endOfMonth(plainDate(num(p, 'year'), num(p, 'month'), 1));
      const next = nextMonthStart(num(p, 'year'), num(p, 'month'));
      const rollover = midnight(next, zone);
      return {
        timeZone: zone,
        start: rollover - num(p, 'leadSeconds') * 1000,
        events: [
          { id: 'last-day', label: `Last day of month (${formatPlainDate(last)})`, atMs: midnight(last, zone) },
          { id: 'next-month', label: `First day of next month (${formatPlainDate(next)})`, atMs: rollover },
        ],
        notes: [`The month has ${daysInMonth(last.year, last.month)} days.`],
      };
    },
  },

  'year-end': {
    title: 'Year-end',
    description: 'New Year rollover: December 31 into January 1.',
    category: 'calendar',
    params: {
      year: { type: 'integer', default: 2026, min: 1970, max: 9998, description: 'The year that is ending.' },
      timeZone: tz('UTC'),
      leadSeconds: lead(60, 'local midnight on January 1'),
    },
    resolve: (p) => {
      const zone = str(p, 'timeZone');
      const newYear = midnight(plainDate(num(p, 'year') + 1, 1, 1), zone);
      return {
        timeZone: zone,
        start: newYear - num(p, 'leadSeconds') * 1000,
        events: [
          { id: 'last-day', label: 'December 31', atMs: midnight(plainDate(num(p, 'year'), 12, 31), zone) },
          { id: 'new-year', label: `January 1, ${num(p, 'year') + 1}`, atMs: newYear },
        ],
      };
    },
  },

  'leap-day': {
    title: 'Leap day',
    description: 'February 28 into February 29 and on to March 1 in a leap year.',
    category: 'calendar',
    params: {
      year: { type: 'integer', default: 2028, min: 1972, max: 9996, description: 'A leap year.' },
      timeZone: tz('UTC'),
      leadSeconds: lead(60, 'local midnight on February 29'),
    },
    resolve: (p) => {
      const year = num(p, 'year');
      if (!isLeapYear(year)) {
        throw new InvalidScenarioParameterError(`leap-day: ${year} is not a leap year`);
      }
      const zone = str(p, 'timeZone');
      const leap = midnight(plainDate(year, 2, 29), zone);
      return {
        timeZone: zone,
        start: leap - num(p, 'leadSeconds') * 1000,
        events: [
          { id: 'leap-day', label: `February 29, ${year}`, atMs: leap },
          { id: 'march-1', label: `March 1, ${year}`, atMs: midnight(plainDate(year, 3, 1), zone) },
          {
            id: 'anniversary',
            label: 'One year later (Feb 29 + 1 year)',
            atMs: addDuration(leap, { years: 1 }, { timeZone: zone }),
            description: 'Constrained to February 28 because the next year has no February 29.',
          },
        ],
      };
    },
  },

  'trial-expiry': {
    title: 'Subscription trial expiry',
    description: 'A free trial ending a fixed number of calendar days after sign-up.',
    category: 'billing',
    params: {
      signupAt: { type: 'instant', default: '2026-11-01T10:00:00Z', description: 'When the user signed up.' },
      trialDays: { type: 'integer', default: 14, min: 1, max: 366, description: 'Trial length in calendar days.' },
      timeZone: tz('UTC', 'Time zone whose calendar days count toward the trial.'),
      leadSeconds: lead(3600, 'the trial ends'),
    },
    resolve: (p) => {
      const zone = str(p, 'timeZone');
      const signup = parseInstant(str(p, 'signupAt'), 'signupAt');
      const end = addDuration(signup, { days: num(p, 'trialDays') }, { timeZone: zone });
      return {
        timeZone: zone,
        start: end - num(p, 'leadSeconds') * 1000,
        events: [
          { id: 'signup', label: 'User signs up', atMs: signup },
          { id: 'trial-ends', label: `Trial ends (${num(p, 'trialDays')} days later)`, atMs: end },
        ],
      };
    },
  },

  'subscription-renewal': {
    title: 'Subscription renewal',
    description: 'Monthly or yearly renewals anchored to a start date, including short months.',
    category: 'billing',
    params: {
      anchorDate: { type: 'date', default: '2026-01-31', description: 'Billing anchor (first charge) date.' },
      time: { type: 'time', default: '09:00', description: 'Local time of day renewals run.' },
      interval: { type: 'enum', default: 'monthly', values: ['monthly', 'yearly'], description: 'Renewal interval.' },
      periods: { type: 'integer', default: 4, min: 1, max: 120, description: 'Number of renewals to generate.' },
      timeZone: tz('UTC'),
      leadSeconds: lead(60, 'the first renewal'),
    },
    resolve: (p) => {
      const zone = str(p, 'timeZone');
      const anchor = dateOf(p, 'anchorDate');
      const yearly = str(p, 'interval') === 'yearly';
      const events: EventSpec[] = [
        { id: 'anchor', label: `Subscription starts (${formatPlainDate(anchor)})`, atMs: localAt(anchor, str(p, 'time'), zone) },
      ];
      for (let i = 1; i <= num(p, 'periods'); i++) {
        // Always computed from the anchor, never chained, so Jan 31 -> Feb 28 -> Mar 31.
        const d = yearly ? addYears(anchor, i) : addMonths(anchor, i);
        events.push({
          id: `renewal-${i}`,
          label: `Renewal ${i} (${formatPlainDate(d)})`,
          atMs: localAt(d, str(p, 'time'), zone),
          ...(d.day !== anchor.day ? { description: `Day ${anchor.day} does not exist; clamped to the last day of the month.` } : {}),
        });
      }
      return {
        timeZone: zone,
        start: events[1]!.atMs - num(p, 'leadSeconds') * 1000,
        events,
        notes: [
          'Renewal dates are computed from the anchor date (anchor + n months), not from the previous renewal, so a Jan 31 anchor renews on Feb 28 and then Mar 31.',
        ],
      };
    },
  },

  payroll: {
    title: 'Payroll processing date',
    description: 'Payroll cut-off a few business days before pay day, with pay day on the last business day of the month.',
    category: 'payroll',
    params: {
      year: { type: 'integer', default: 2026, min: 1970, max: 9998, description: 'Calendar year.' },
      month: { type: 'integer', default: 11, min: 1, max: 12, description: 'Payroll month (1-12).' },
      cutoffBusinessDays: {
        type: 'integer',
        default: 3,
        min: 0,
        max: 15,
        description: 'Business days before pay day that inputs lock.',
      },
      cutoffTime: { type: 'time', default: '17:00', description: 'Local time the cut-off happens.' },
      weekendDays: weekend,
      holidays: { type: 'date[]', default: [], description: 'Non-working dates (YYYY-MM-DD). No holiday data is bundled.' },
      timeZone: tz('UTC'),
      leadSeconds: lead(60, 'the cut-off'),
    },
    resolve: (p) => {
      const zone = str(p, 'timeZone');
      const biz = { weekendDays: p.weekendDays as IsoDayOfWeek[], holidays: p.holidays as string[] };
      const payDay = lastBusinessDayOfMonth(plainDate(num(p, 'year'), num(p, 'month'), 1), biz);
      const cutoffDay = addBusinessDays(payDay, -num(p, 'cutoffBusinessDays'), biz);
      const cutoff = localAt(cutoffDay, str(p, 'cutoffTime'), zone);
      return {
        timeZone: zone,
        start: cutoff - num(p, 'leadSeconds') * 1000,
        events: [
          { id: 'cutoff', label: `Payroll cut-off (${formatPlainDate(cutoffDay)} ${str(p, 'cutoffTime')})`, atMs: cutoff },
          { id: 'pay-day', label: `Pay day (${formatPlainDate(payDay)})`, atMs: midnight(payDay, zone) },
        ],
        notes: ['Pay day is the last business day of the month; weekends and listed holidays move it earlier.'],
      };
    },
  },

  'invoice-due': {
    title: 'Invoice due date',
    description: 'An invoice with net payment terms becoming overdue at the end of its due date.',
    category: 'billing',
    params: {
      issueDate: { type: 'date', default: '2026-11-02', description: 'Invoice date.' },
      netDays: { type: 'integer', default: 30, min: 0, max: 366, description: 'Payment terms in calendar days (net 30).' },
      timeZone: tz('UTC', 'Time zone of the business issuing the invoice.'),
      leadSeconds: lead(60, 'the invoice becomes overdue'),
    },
    resolve: (p) => {
      const zone = str(p, 'timeZone');
      const issue = dateOf(p, 'issueDate');
      const due = addDays(issue, num(p, 'netDays'));
      const overdue = midnight(addDays(due, 1), zone);
      return {
        timeZone: zone,
        start: overdue - num(p, 'leadSeconds') * 1000,
        events: [
          { id: 'issued', label: `Invoice issued (${formatPlainDate(issue)})`, atMs: midnight(issue, zone) },
          { id: 'due', label: `Due date (${formatPlainDate(due)})`, atMs: midnight(due, zone) },
          { id: 'overdue', label: 'Invoice overdue', atMs: overdue, description: 'Payment is late from the start of the day after the due date.' },
        ],
      };
    },
  },

  'quarter-close': {
    title: 'Quarterly financial close',
    description: 'The end of a fiscal quarter, with configurable fiscal-year start month.',
    category: 'finance',
    params: {
      year: { type: 'integer', default: 2026, min: 1970, max: 9998, description: 'Calendar year in which the fiscal year starts.' },
      quarter: { type: 'integer', default: 4, min: 1, max: 4, description: 'Fiscal quarter (1-4).' },
      fiscalYearStartMonth: { type: 'integer', default: 1, min: 1, max: 12, description: 'Month the fiscal year starts (4 = April).' },
      timeZone: tz('UTC'),
      leadSeconds: lead(60, 'the quarter closes'),
    },
    resolve: (p) => {
      const zone = str(p, 'timeZone');
      const fyStart = plainDate(num(p, 'year'), num(p, 'fiscalYearStartMonth'), 1);
      const qStart = addMonths(fyStart, (num(p, 'quarter') - 1) * 3);
      const qEnd = addMonths(qStart, 3);
      const close = midnight(qEnd, zone);
      return {
        timeZone: zone,
        start: close - num(p, 'leadSeconds') * 1000,
        events: [
          { id: 'quarter-start', label: `Q${num(p, 'quarter')} starts (${formatPlainDate(qStart)})`, atMs: midnight(qStart, zone) },
          { id: 'last-day', label: `Last day of quarter (${formatPlainDate(addDays(qEnd, -1))})`, atMs: midnight(addDays(qEnd, -1), zone) },
          { id: 'quarter-closed', label: `Quarter closed (${formatPlainDate(qEnd)})`, atMs: close },
        ],
      };
    },
  },

  'midnight-rollover': {
    title: 'Midnight rollover',
    description: 'The final second of a local day, rolling over to the next date.',
    category: 'calendar',
    params: {
      date: { type: 'date', default: '2026-11-30', description: 'The local date that is ending.' },
      timeZone: tz('Asia/Kolkata'),
      leadSeconds: lead(1, 'local midnight'),
    },
    resolve: (p) => {
      const zone = str(p, 'timeZone');
      const day = dateOf(p, 'date');
      const next = midnight(addDays(day, 1), zone);
      return {
        timeZone: zone,
        start: next - num(p, 'leadSeconds') * 1000,
        events: [{ id: 'midnight', label: `Midnight, ${formatPlainDate(addDays(day, 1))}`, atMs: next }],
        notes: ['UTC date and local date differ for part of the day in any zone that is not UTC.'],
      };
    },
  },

  'dst-transition': {
    title: 'Daylight saving transition',
    description: 'Just before clocks spring forward (gap) or fall back (overlap) in a DST time zone.',
    category: 'time-zone',
    params: {
      year: { type: 'integer', default: 2026, min: 1970, max: 2100, description: 'Calendar year.' },
      timeZone: tz('America/New_York', 'A time zone that observes daylight saving time.'),
      direction: {
        type: 'enum',
        default: 'forward',
        values: ['forward', 'backward'],
        description: '"forward" = spring-forward gap, "backward" = fall-back overlap.',
      },
      leadSeconds: lead(60, 'the transition'),
    },
    resolve: (p) => {
      const zone = str(p, 'timeZone');
      const kind = str(p, 'direction') === 'forward' ? 'gap' : 'overlap';
      const t = transitionsInYear(zone, num(p, 'year')).find((x) => x.kind === kind);
      if (!t) {
        throw new InvalidScenarioParameterError(
          `dst-transition: ${zone} has no ${str(p, 'direction')} transition in ${num(p, 'year')}`,
        );
      }
      const shiftMin = Math.abs(t.offsetAfterMs - t.offsetBeforeMs) / 60_000;
      return {
        timeZone: zone,
        start: t.epochMs - num(p, 'leadSeconds') * 1000,
        events: [
          {
            id: 'transition',
            label: kind === 'gap' ? `Clocks spring forward ${shiftMin} min` : `Clocks fall back ${shiftMin} min`,
            atMs: t.epochMs,
            description: `${t.localBefore} (${t.offsetBefore}) is followed by ${t.localAfter} (${t.offsetAfter}).`,
          },
          {
            id: 'one-hour-later',
            label: 'One elapsed hour after the transition',
            atMs: t.epochMs + 3_600_000,
          },
        ],
        notes: [
          kind === 'gap'
            ? 'Local times inside the gap do not exist. MockClock resolves them per the disambiguation option (default: shift forward).'
            : 'Local times inside the overlap occur twice. MockClock resolves them per the disambiguation option (default: the earlier one).',
        ],
      };
    },
  },

  'holiday-boundary': {
    title: 'Weekend and public holiday boundary',
    description: 'The end of the last business day before a holiday and weekend, through to the next business day.',
    category: 'calendar',
    params: {
      lastBusinessDay: { type: 'date', default: '2026-12-24', description: 'Last working date before the break.' },
      holidays: {
        type: 'date[]',
        default: ['2026-12-25'],
        description: 'Holiday dates (YYYY-MM-DD). This is example data, not an authoritative calendar.',
      },
      weekendDays: weekend,
      timeZone: tz('UTC'),
      leadSeconds: lead(60, 'the end of the last business day'),
    },
    resolve: (p) => {
      const zone = str(p, 'timeZone');
      const biz = { weekendDays: p.weekendDays as IsoDayOfWeek[], holidays: p.holidays as string[] };
      const last = dateOf(p, 'lastBusinessDay');
      const events: EventSpec[] = [];
      let d = addDays(last, 1);
      let guard = 0;
      while (!isBusinessDay(d, biz)) {
        const isHoliday = (p.holidays as string[]).includes(formatPlainDate(d));
        events.push({ id: `off-${formatPlainDate(d)}`, label: `${isHoliday ? 'Holiday' : 'Weekend'}: ${formatPlainDate(d)}`, atMs: midnight(d, zone) });
        d = addDays(d, 1);
        if (++guard > 366) throw new InvalidScenarioParameterError('holiday-boundary: no business day found within a year');
      }
      events.push({ id: 'next-business-day', label: `Next business day (${formatPlainDate(d)})`, atMs: midnight(d, zone) });
      const end = midnight(addDays(last, 1), zone);
      return { timeZone: zone, start: end - num(p, 'leadSeconds') * 1000, events };
    },
  },

  'leave-accrual': {
    title: 'Annual leave accrual',
    description: 'Monthly accrual of annual leave from an employment start date.',
    category: 'hr',
    params: {
      startDate: { type: 'date', default: '2026-01-31', description: 'Employment start date; accrual runs on the monthly anniversary.' },
      annualDays: { type: 'integer', default: 24, min: 1, max: 365, description: 'Leave days earned per year.' },
      months: { type: 'integer', default: 12, min: 1, max: 60, description: 'Number of monthly accruals to generate.' },
      timeZone: tz('UTC'),
      leadSeconds: lead(60, 'the first accrual'),
    },
    resolve: (p) => {
      const zone = str(p, 'timeZone');
      const start = dateOf(p, 'startDate');
      const perMonth = num(p, 'annualDays') / 12;
      const events: EventSpec[] = [{ id: 'employment-start', label: `Employment starts (${formatPlainDate(start)})`, atMs: midnight(start, zone) }];
      for (let i = 1; i <= num(p, 'months'); i++) {
        const d = addMonths(start, i);
        events.push({
          id: `accrual-${i}`,
          label: `Accrual ${i}: ${(perMonth * i).toFixed(2)} days (${formatPlainDate(d)})`,
          atMs: midnight(d, zone),
        });
      }
      return {
        timeZone: zone,
        start: events[1]!.atMs - num(p, 'leadSeconds') * 1000,
        events,
        notes: [`${perMonth.toFixed(4)} days accrue per month. Anniversaries on the 29th-31st clamp to the month's last day.`],
      };
    },
  },

  'token-expiry': {
    title: 'Token expiry',
    description: 'An access token reaching its expiry time, with an optional clock-skew allowance.',
    category: 'security',
    params: {
      issuedAt: { type: 'instant', default: '2026-11-25T12:00:00Z', description: 'Token issue time (iat).' },
      ttlSeconds: { type: 'integer', default: 3600, min: 1, max: 366 * 86_400, description: 'Lifetime in seconds.' },
      clockSkewSeconds: { type: 'integer', default: 30, min: 0, max: 3600, description: 'Leeway a verifier allows after exp.' },
      leadSeconds: lead(1, 'the token expires'),
    },
    resolve: (p) => {
      const issued = parseInstant(str(p, 'issuedAt'), 'issuedAt');
      const exp = issued + num(p, 'ttlSeconds') * 1000;
      return {
        timeZone: 'UTC',
        start: exp - num(p, 'leadSeconds') * 1000,
        events: [
          { id: 'issued', label: 'Token issued (iat)', atMs: issued },
          { id: 'expires', label: 'Token expires (exp)', atMs: exp },
          { id: 'skew-limit', label: `Leeway ends (+${num(p, 'clockSkewSeconds')}s)`, atMs: exp + num(p, 'clockSkewSeconds') * 1000 },
        ],
        notes: ['Token lifetimes are exact elapsed time, so they are unaffected by time zones and DST.'],
      };
    },
  },

  'coupon-expiry': {
    title: 'Coupon expiration',
    description: 'A coupon valid "through" a date, expiring at local midnight at the end of that day.',
    category: 'billing',
    params: {
      validThrough: { type: 'date', default: '2026-12-31', description: 'Last local date the coupon can be used.' },
      timeZone: tz('America/New_York', 'Time zone the expiry date is defined in.'),
      leadSeconds: lead(60, 'the coupon expires'),
    },
    resolve: (p) => {
      const zone = str(p, 'timeZone');
      const through = dateOf(p, 'validThrough');
      const expires = midnight(addDays(through, 1), zone);
      return {
        timeZone: zone,
        start: expires - num(p, 'leadSeconds') * 1000,
        events: [
          { id: 'last-valid-day', label: `Last valid day (${formatPlainDate(through)})`, atMs: midnight(through, zone) },
          { id: 'expired', label: 'Coupon expired', atMs: expires, description: `Expires at ${formatInTimeZone(expires, zone)}, which is ${formatInstant(expires)}.` },
        ],
      };
    },
  },

  'billing-retry': {
    title: 'Billing retry window',
    description: 'A failed payment retried on a schedule, then the subscription cancelled.',
    category: 'billing',
    params: {
      failedAt: { type: 'instant', default: '2026-11-30T09:00:00Z', description: 'When the first charge failed.' },
      retryDays: { type: 'integer[]', default: [1, 3, 7], min: 1, max: 60, description: 'Days after the failure on which to retry.' },
      cancelAfterDays: { type: 'integer', default: 10, min: 1, max: 90, description: 'Days after the failure the subscription is cancelled.' },
      timeZone: tz('UTC'),
      leadSeconds: lead(60, 'the first retry'),
    },
    resolve: (p) => {
      const zone = str(p, 'timeZone');
      const failed = parseInstant(str(p, 'failedAt'), 'failedAt');
      const retries = [...(p.retryDays as number[])].sort((a, b) => a - b);
      if (retries.length === 0) throw new InvalidScenarioParameterError('billing-retry: retryDays must not be empty');
      const cancelAfter = num(p, 'cancelAfterDays');
      if (cancelAfter <= retries[retries.length - 1]!) {
        throw new InvalidScenarioParameterError('billing-retry: cancelAfterDays must be later than the last retry');
      }
      const events: EventSpec[] = [{ id: 'charge-failed', label: 'Charge failed', atMs: failed }];
      retries.forEach((d, i) =>
        events.push({ id: `retry-${i + 1}`, label: `Retry ${i + 1} (day ${d})`, atMs: addDuration(failed, { days: d }, { timeZone: zone }) }),
      );
      events.push({ id: 'cancelled', label: `Subscription cancelled (day ${cancelAfter})`, atMs: addDuration(failed, { days: cancelAfter }, { timeZone: zone }) });
      return { timeZone: zone, start: events[1]!.atMs - num(p, 'leadSeconds') * 1000, events };
    },
  },
} as const satisfies Record<string, ScenarioDefinition>;

export type ScenarioId = keyof typeof SCENARIOS;

export const SCENARIO_IDS = Object.keys(SCENARIOS) as ScenarioId[];

export function isScenarioId(id: unknown): id is ScenarioId {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(SCENARIOS, id);
}

function getDefinition(id: string): ScenarioDefinition {
  if (!isScenarioId(id)) {
    throw new UnknownScenarioError(`Unknown scenario "${id}". Available: ${SCENARIO_IDS.join(', ')}`);
  }
  return SCENARIOS[id] as ScenarioDefinition;
}

export function listScenarios(): ScenarioSummary[] {
  return SCENARIO_IDS.map((id) => describeScenario(id));
}

export function describeScenario(id: ScenarioId | (string & {})): ScenarioSummary {
  const def = getDefinition(id);
  return { id: id as ScenarioId, title: def.title, description: def.description, category: def.category, params: def.params };
}

function coerceParam(scenario: string, key: string, spec: ScenarioParamSpec, raw: ScenarioParamValue): ScenarioParamValue {
  const fail = (why: string): never => {
    throw new InvalidScenarioParameterError(`${scenario}: parameter "${key}" ${why}`);
  };
  const toInt = (v: unknown): number => {
    const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
    if (typeof n !== 'number' || !Number.isInteger(n)) return fail(`must be an integer, received ${JSON.stringify(v)}`);
    if (spec.min !== undefined && n < spec.min) fail(`must be at least ${spec.min}, received ${n}`);
    if (spec.max !== undefined && n > spec.max) fail(`must be at most ${spec.max}, received ${n}`);
    return n;
  };
  const toList = (v: unknown): unknown[] => {
    if (Array.isArray(v)) return v;
    if (typeof v === 'string') return v.trim() === '' ? [] : v.split(',').map((s) => s.trim());
    return fail('must be a list (array or comma-separated string)');
  };
  const wrap = <T>(fn: () => T): T => {
    try {
      return fn();
    } catch (e) {
      if (e instanceof InvalidScenarioParameterError) throw e;
      return fail(`is invalid: ${(e as Error).message}`);
    }
  };
  switch (spec.type) {
    case 'integer':
      return toInt(raw);
    case 'integer[]':
      return toList(raw).map(toInt);
    case 'string':
      if (typeof raw !== 'string') fail('must be a string');
      return raw;
    case 'enum':
      if (typeof raw !== 'string' || !spec.values?.includes(raw)) fail(`must be one of ${spec.values?.join(', ')}`);
      return raw;
    case 'date':
      if (typeof raw !== 'string') fail('must be a YYYY-MM-DD string');
      return wrap(() => formatPlainDate(parsePlainDate(raw as string)));
    case 'date[]':
      return toList(raw).map((v) => {
        if (typeof v !== 'string') fail('must contain YYYY-MM-DD strings');
        return wrap(() => formatPlainDate(parsePlainDate(v as string)));
      });
    case 'time':
      if (typeof raw !== 'string') fail('must be an HH:mm string');
      wrap(() => parsePlainTime(raw as string));
      return raw;
    case 'instant':
      if (typeof raw !== 'string') fail('must be an ISO 8601 instant string');
      return formatInstant(wrap(() => parseInstant(raw as string, key)));
    case 'timeZone':
      if (!isValidTimeZone(raw)) fail(`must be an IANA time zone, received ${JSON.stringify(raw)}`);
      return assertTimeZone(raw);
  }
}

/** Merge parameters with defaults, validate them and compute the scenario's start and events. */
export function resolveScenario(id: ScenarioId | (string & {}), params: ScenarioParams = {}): ResolvedScenario {
  const def = getDefinition(id);
  for (const key of Object.keys(params)) {
    if (!Object.prototype.hasOwnProperty.call(def.params, key)) {
      throw new InvalidScenarioParameterError(
        `${id}: unknown parameter "${key}". Accepted: ${Object.keys(def.params).join(', ')}`,
      );
    }
  }
  const values: Values = {};
  for (const [key, spec] of Object.entries(def.params)) {
    const raw = params[key] ?? spec.default;
    values[key] = coerceParam(id, key, spec, raw);
  }
  const r = def.resolve(values);
  const events = r.events
    .map(
      (e): ScenarioEvent =>
        Object.freeze({
          id: e.id,
          label: e.label,
          atMs: e.atMs,
          at: formatInstant(e.atMs),
          local: formatInTimeZone(e.atMs, r.timeZone),
          ...(e.description ? { description: e.description } : {}),
        }),
    )
    .sort((a, b) => a.atMs - b.atMs);
  return Object.freeze({
    id: id as ScenarioId,
    title: def.title,
    description: def.description,
    category: def.category,
    timeZone: r.timeZone,
    startMs: r.start,
    start: formatInstant(r.start),
    startLocal: formatInTimeZone(r.start, r.timeZone),
    events: Object.freeze(events),
    params: Object.freeze(values),
    notes: Object.freeze(r.notes ?? []),
  });
}
