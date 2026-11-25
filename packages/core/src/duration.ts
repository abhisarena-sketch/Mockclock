import { InvalidDurationError } from './errors.js';

/** Units accepted in a duration, from largest to smallest. */
export const DURATION_UNITS = [
  'years',
  'months',
  'weeks',
  'days',
  'hours',
  'minutes',
  'seconds',
  'milliseconds',
] as const;

export type DurationUnit = (typeof DURATION_UNITS)[number];

/**
 * A duration expressed in calendar units (`years`, `months`, `weeks`, `days`) and
 * exact units (`hours`, `minutes`, `seconds`, `milliseconds`).
 *
 * Calendar units are applied to the local calendar date in the clock's time zone;
 * they are never converted to a fixed number of milliseconds. See
 * `docs/calendar-arithmetic.md`.
 */
export type DurationLike = Partial<Record<DurationUnit, number>>;

/** A validated duration with every unit present. */
export type Duration = Readonly<Record<DurationUnit, number>>;

const SINGULAR_HINTS: Record<string, DurationUnit> = {
  year: 'years',
  y: 'years',
  month: 'months',
  mo: 'months',
  week: 'weeks',
  w: 'weeks',
  day: 'days',
  d: 'days',
  hour: 'hours',
  h: 'hours',
  minute: 'minutes',
  min: 'minutes',
  m: 'minutes',
  second: 'seconds',
  sec: 'seconds',
  s: 'seconds',
  millisecond: 'milliseconds',
  ms: 'milliseconds',
};

export interface NormalizeDurationOptions {
  /** Allow negative components. All non-zero components must still share one sign. Default `false`. */
  readonly allowNegative?: boolean;
}

/** Validate a {@link DurationLike} and return a complete {@link Duration}. */
export function normalizeDuration(input: DurationLike, options: NormalizeDurationOptions = {}): Duration {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new InvalidDurationError('A duration must be an object such as { days: 1, hours: 2 }');
  }
  const out: Record<DurationUnit, number> = {
    years: 0,
    months: 0,
    weeks: 0,
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    milliseconds: 0,
  };
  for (const [key, value] of Object.entries(input)) {
    if (!(DURATION_UNITS as readonly string[]).includes(key)) {
      const hint = SINGULAR_HINTS[key];
      throw new InvalidDurationError(
        `Unknown duration unit "${key}".${hint ? ` Did you mean "${hint}"?` : ''} Valid units: ${DURATION_UNITS.join(', ')}`,
      );
    }
    if (value === undefined) continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new InvalidDurationError(`Duration ${key} must be a finite number, received ${String(value)}`);
    }
    if (!Number.isInteger(value)) {
      throw new InvalidDurationError(
        `Duration ${key} must be a whole number, received ${value}. Express fractions in a smaller unit (for example { minutes: 90 } instead of { hours: 1.5 }).`,
      );
    }
    if (!Number.isSafeInteger(value)) throw new InvalidDurationError(`Duration ${key} is too large`);
    out[key as DurationUnit] = value === 0 ? 0 : value; // normalise -0
  }
  const signs = new Set(Object.values(out).filter((v) => v !== 0).map(Math.sign));
  if (signs.size > 1) {
    throw new InvalidDurationError('Duration components must all have the same sign (mixed positive and negative values)');
  }
  if (!options.allowNegative && signs.has(-1)) {
    throw new InvalidDurationError(
      'Duration components must be non-negative here. Use rewind() to move backwards, or travelBy() for signed durations.',
    );
  }
  return Object.freeze(out);
}

export function isZeroDuration(d: DurationLike): boolean {
  return DURATION_UNITS.every((u) => (d[u] ?? 0) === 0);
}

export function negateDuration(d: DurationLike): Duration {
  const n = normalizeDuration(d, { allowNegative: true });
  const out = {} as Record<DurationUnit, number>;
  for (const u of DURATION_UNITS) out[u] = n[u] === 0 ? 0 : -n[u];
  return Object.freeze(out);
}

/** Whether the duration contains calendar units (years, months, weeks or days). */
export function hasCalendarUnits(d: DurationLike): boolean {
  return Boolean(d.years || d.months || d.weeks || d.days);
}

/** Exact milliseconds of the time portion (hours and smaller). Calendar units are ignored. */
export function exactTimeMs(d: DurationLike): number {
  return (
    (d.hours ?? 0) * 3_600_000 + (d.minutes ?? 0) * 60_000 + (d.seconds ?? 0) * 1_000 + (d.milliseconds ?? 0)
  );
}

const ISO_DURATION_RE =
  /^([+-])?P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)(?:[.,](\d{1,3}))?S)?)?$/i;

/**
 * Parse an ISO 8601 duration such as `P1M`, `P2DT3H30M`, `PT90S`, `PT0.5S` or `-P1D`.
 * Fractional values are only allowed on seconds (up to millisecond precision).
 */
export function parseIsoDuration(text: string): Duration {
  const m = ISO_DURATION_RE.exec(text.trim());
  if (!m || /T$/i.test(text.trim()) || text.trim().replace(/^[+-]/, '').toUpperCase() === 'P') {
    throw new InvalidDurationError(`"${text}" is not a valid ISO 8601 duration (examples: P1D, PT2H30M, P1Y2M)`);
  }
  const sign = m[1] === '-' ? -1 : 1;
  const n = (v: string | undefined) => (v ? sign * Number(v) : 0);
  return normalizeDuration(
    {
      years: n(m[2]),
      months: n(m[3]),
      weeks: n(m[4]),
      days: n(m[5]),
      hours: n(m[6]),
      minutes: n(m[7]),
      seconds: n(m[8]),
      milliseconds: m[9] ? sign * Number(m[9].padEnd(3, '0')) : 0,
    },
    { allowNegative: true },
  );
}

/** Format a duration as ISO 8601 (`P1Y2M3DT4H5M6.007S`). */
export function formatIsoDuration(d: DurationLike): string {
  const n = normalizeDuration(d, { allowNegative: true });
  const negative = DURATION_UNITS.some((u) => n[u] < 0);
  const a = (u: DurationUnit) => Math.abs(n[u]);
  let date = '';
  if (a('years')) date += `${a('years')}Y`;
  if (a('months')) date += `${a('months')}M`;
  if (a('weeks')) date += `${a('weeks')}W`;
  if (a('days')) date += `${a('days')}D`;
  let time = '';
  if (a('hours')) time += `${a('hours')}H`;
  if (a('minutes')) time += `${a('minutes')}M`;
  const totalMs = a('seconds') * 1000 + a('milliseconds');
  if (totalMs) {
    const secs = Math.floor(totalMs / 1000);
    const ms = totalMs % 1000;
    time += ms ? `${secs}.${String(ms).padStart(3, '0').replace(/0+$/, '')}S` : `${secs}S`;
  }
  if (!date && !time) return 'PT0S';
  return `${negative ? '-' : ''}P${date}${time ? `T${time}` : ''}`;
}

/** Human-readable description, for logs and UIs: `2 days, 3 hours`. */
export function describeDuration(d: DurationLike): string {
  const n = normalizeDuration(d, { allowNegative: true });
  const parts: string[] = [];
  for (const u of DURATION_UNITS) {
    const v = Math.abs(n[u]);
    if (v) parts.push(`${v} ${v === 1 ? u.slice(0, -1) : u}`);
  }
  if (parts.length === 0) return '0 milliseconds';
  const negative = DURATION_UNITS.some((u) => n[u] < 0);
  return `${negative ? 'minus ' : ''}${parts.join(', ')}`;
}
