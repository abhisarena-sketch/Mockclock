import { type OverflowPolicy, type PlainDate, type PlainDateTime } from './calendar.js';
import { normalizeDuration, negateDuration, type DurationLike } from './duration.js';
import { InvalidClockOperationError, InvalidSnapshotError } from './errors.js';
import { formatInstant, toEpochMs, type DateInput } from './instant.js';
import {
  addDuration,
  assertTimeZone,
  fromLocal,
  toZonedDateTime,
  type Disambiguation,
  type ZonedDateTime,
} from './timezone.js';
import { resolveScenario, type ResolvedScenario, type ScenarioId, type ScenarioParams } from './scenarios.js';

/**
 * The real-time source captured when this module is first evaluated, so that a
 * later global `Date` patch (by MockClock's Node adapter or any fake-timer
 * library) cannot make a MockClock read its own simulated time as "real" time.
 */
const nativeDateNow: () => number = Date.now.bind(Date);

/** Minimal interface for code that only needs to read the time. Accept this in your services. */
export interface ClockLike {
  /** Current time as a new `Date`. */
  now(): Date;
  /** Current time in epoch milliseconds. */
  nowMs(): number;
}

/** A {@link ClockLike} backed by the real system time. */
export const systemClock: ClockLike = Object.freeze({
  now: () => new Date(nativeDateNow()),
  nowMs: () => nativeDateNow(),
});

/**
 * - `real`: not simulated; reads the real time.
 * - `running`: simulated, and moving forward in step with real time.
 * - `frozen`: simulated, and standing still until changed.
 */
export type ClockMode = 'real' | 'running' | 'frozen';

export type ClockAction =
  | 'freeze'
  | 'resume'
  | 'set'
  | 'advance'
  | 'rewind'
  | 'travel'
  | 'reset';

/** Emitted after every state change. */
export interface ClockChangeEvent {
  readonly action: ClockAction;
  /** Simulated time before the change (epoch ms). */
  readonly fromMs: number;
  /** Simulated time after the change (epoch ms). */
  readonly toMs: number;
  /** `toMs - fromMs`. Negative when time moved backwards. */
  readonly deltaMs: number;
  readonly mode: ClockMode;
  /** Optional label passed to the operation, for timelines and logs. */
  readonly label?: string;
  /** Monotonic sequence number within this clock. */
  readonly sequence: number;
}

export type ClockListener = (event: ClockChangeEvent) => void;

/** Serializable clock state, used by the CLI session file and by `fromSnapshot`. */
export interface ClockSnapshot {
  readonly version: 1;
  readonly mode: ClockMode;
  readonly timeZone: string;
  /** Simulated instant at `realAnchorMs` (or the frozen instant). `null` in `real` mode. */
  readonly simulatedMs: number | null;
  /** Real time at which `simulatedMs` was recorded. Used to keep a running clock running. */
  readonly realAnchorMs: number;
}

/** A read-only summary of a clock. */
export interface ClockState {
  readonly mode: ClockMode;
  readonly frozen: boolean;
  readonly simulated: boolean;
  readonly nowMs: number;
  readonly now: string;
  readonly realNowMs: number;
  readonly realNow: string;
  /** Simulated minus real time. 0 in `real` mode. */
  readonly offsetFromRealMs: number;
  readonly timeZone: string;
  readonly zoned: ZonedDateTime;
}

/** A local wall-clock target: `{ local: '2027-01-01T09:00', timeZone: 'Asia/Tokyo' }`. */
export interface LocalTarget {
  readonly local: string | PlainDateTime;
  /** Defaults to the clock's time zone. */
  readonly timeZone?: string;
  /** Defaults to the clock's disambiguation (`compatible`). */
  readonly disambiguation?: Disambiguation;
}

export type TravelTarget = DateInput | LocalTarget;

export interface MockClockOptions {
  /**
   * IANA time zone used for calendar arithmetic (days, weeks, months, years),
   * `today()` and `zoned()`. Default `UTC`. Never inferred from the machine, so
   * tests behave the same on every computer.
   */
  readonly timeZone?: string;
  /** Start simulating at this instant. If omitted the clock starts in `real` mode. */
  readonly now?: TravelTarget;
  /** Start frozen. With no `now`, freezes at the current real time. Default `false`. */
  readonly frozen?: boolean;
  /** End-of-month policy for month/year arithmetic. Default `constrain`. */
  readonly overflow?: OverflowPolicy;
  /** How local times in DST gaps/overlaps resolve. Default `compatible`. */
  readonly disambiguation?: Disambiguation;
  /** Real-time source. Defaults to the native `Date.now` captured at load time. Useful for testing MockClock itself. */
  readonly realTime?: () => number;
  /** Maximum number of change events kept in `history`. Default 500. Use 0 to disable. */
  readonly historyLimit?: number;
  /** Attach a resolved scenario (set by `MockClock.scenario`). */
  readonly scenario?: ResolvedScenario;
}

/**
 * An isolated, controllable clock. Instances never share state and never touch
 * the global `Date` or the operating-system clock.
 *
 * ```ts
 * const clock = new MockClock({ timeZone: 'Europe/London' });
 * clock.freeze('2026-11-30T23:59:00Z');
 * clock.advance({ days: 2, hours: 3, minutes: 30 });
 * clock.now(); // 2026-12-03T03:29:00.000Z
 * ```
 */
export class MockClock implements ClockLike {
  #timeZone: string;
  #overflow: OverflowPolicy;
  #disambiguation: Disambiguation;
  readonly #realTime: () => number;
  /** Simulated instant at #realAnchor, or the frozen instant. `null` = real mode. */
  #anchor: number | null = null;
  #realAnchor = 0;
  #frozen = false;
  #sequence = 0;
  readonly #listeners = new Set<ClockListener>();
  readonly #history: ClockChangeEvent[] = [];
  readonly #historyLimit: number;
  /** Scenario this clock was created from, if any. */
  readonly scenario: ResolvedScenario | undefined;

  constructor(options: MockClockOptions = {}) {
    this.#timeZone = assertTimeZone(options.timeZone ?? 'UTC');
    this.#overflow = options.overflow ?? 'constrain';
    if (this.#overflow !== 'constrain' && this.#overflow !== 'reject') {
      throw new InvalidClockOperationError(`overflow must be "constrain" or "reject"`);
    }
    this.#disambiguation = options.disambiguation ?? 'compatible';
    this.#realTime = options.realTime ?? nativeDateNow;
    const limit = options.historyLimit ?? 500;
    if (!Number.isInteger(limit) || limit < 0) throw new InvalidClockOperationError('historyLimit must be a non-negative integer');
    this.#historyLimit = limit;
    this.scenario = options.scenario;
    const real = this.#realTime();
    this.#realAnchor = real;
    if (options.now !== undefined) {
      this.#anchor = this.#resolveTarget(options.now, 'now');
      this.#frozen = options.frozen ?? false;
    } else if (options.frozen) {
      this.#anchor = real;
      this.#frozen = true;
    }
  }

  // ---------------------------------------------------------------- reading

  /** Current simulated time in epoch milliseconds. */
  nowMs(): number {
    if (this.#anchor === null) return this.#realTime();
    if (this.#frozen) return this.#anchor;
    return this.#anchor + (this.#realTime() - this.#realAnchor);
  }

  /** Current simulated time as a new `Date`. */
  now(): Date {
    return new Date(this.nowMs());
  }

  /** Current simulated time as an ISO 8601 UTC string. */
  toISOString(): string {
    return formatInstant(this.nowMs());
  }

  /** The current simulated time read as wall-clock time in `timeZone` (default: the clock's zone). */
  zoned(timeZone: string = this.#timeZone): ZonedDateTime {
    return toZonedDateTime(this.nowMs(), timeZone);
  }

  /** Today's local calendar date in `timeZone` (default: the clock's zone). */
  today(timeZone: string = this.#timeZone): PlainDate {
    return this.zoned(timeZone).date;
  }

  /** Real (not simulated) time in epoch ms, from the clock's real-time source. */
  realNowMs(): number {
    return this.#realTime();
  }

  get timeZone(): string {
    return this.#timeZone;
  }

  get overflow(): OverflowPolicy {
    return this.#overflow;
  }

  get mode(): ClockMode {
    if (this.#anchor === null) return 'real';
    return this.#frozen ? 'frozen' : 'running';
  }

  isFrozen(): boolean {
    return this.#frozen;
  }

  /** True when time is moving (either real or a running simulation). */
  isRunning(): boolean {
    return !this.#frozen;
  }

  /** True when the clock is not reading real time. */
  isSimulated(): boolean {
    return this.#anchor !== null;
  }

  state(): ClockState {
    const nowMs = this.nowMs();
    const realNowMs = this.#realTime();
    return Object.freeze({
      mode: this.mode,
      frozen: this.#frozen,
      simulated: this.isSimulated(),
      nowMs,
      now: formatInstant(nowMs),
      realNowMs,
      realNow: formatInstant(realNowMs),
      offsetFromRealMs: this.#anchor === null ? 0 : nowMs - realNowMs,
      timeZone: this.#timeZone,
      zoned: toZonedDateTime(nowMs, this.#timeZone),
    });
  }

  /** Change events, oldest first (bounded by `historyLimit`). */
  get history(): readonly ClockChangeEvent[] {
    return [...this.#history];
  }

  // ---------------------------------------------------------------- control

  /** Stop time. With an argument, jump to that instant first. */
  freeze(at?: TravelTarget, label?: string): this {
    const from = this.nowMs();
    const to = at === undefined ? from : this.#resolveTarget(at, 'freeze');
    this.#anchor = to;
    this.#realAnchor = this.#realTime();
    this.#frozen = true;
    return this.#emit('freeze', from, to, label);
  }

  /** Let a frozen simulated clock run again from where it stopped. No-op if already running. */
  resume(label?: string): this {
    if (!this.#frozen) return this;
    const from = this.nowMs();
    this.#anchor = from;
    this.#realAnchor = this.#realTime();
    this.#frozen = false;
    return this.#emit('resume', from, from, label);
  }

  /** Set the simulated instant. Keeps the current frozen/running state. */
  set(at: TravelTarget, label?: string): this {
    return this.#moveTo(this.#resolveTarget(at, 'set'), 'set', label);
  }

  /**
   * Travel to an instant or a local wall-clock time. Same as {@link set}, but also
   * reads naturally for local targets:
   * `clock.travel({ local: '2027-01-01T09:00', timeZone: 'Asia/Tokyo' })`.
   */
  travel(to: TravelTarget, label?: string): this {
    return this.#moveTo(this.#resolveTarget(to, 'travel'), 'travel', label);
  }

  /** Travel by a signed duration: `travelBy({ days: -3 })` goes back three days. */
  travelBy(duration: DurationLike, label?: string): this {
    normalizeDuration(duration, { allowNegative: true });
    return this.#moveTo(this.#add(duration), 'travel', label);
  }

  /** Move forward by a non-negative duration. Calendar units follow the clock's time zone. */
  advance(duration: DurationLike, label?: string): this {
    normalizeDuration(duration);
    return this.#moveTo(this.#add(duration), 'advance', label);
  }

  /** Move backward by a non-negative duration. `rewind({ months: 1 })` from Mar 31 lands on Feb 28/29. */
  rewind(duration: DurationLike, label?: string): this {
    normalizeDuration(duration);
    return this.#moveTo(this.#add(negateDuration(duration)), 'rewind', label);
  }

  /** Shorthand for `advance({ milliseconds })`. */
  tick(milliseconds: number, label?: string): this {
    return this.advance({ milliseconds }, label);
  }

  /** Move forward to a target that must not be in the simulated past. */
  advanceTo(target: TravelTarget, label?: string): this {
    const to = this.#resolveTarget(target, 'advanceTo');
    const from = this.nowMs();
    if (to < from) {
      throw new InvalidClockOperationError(
        `advanceTo: ${formatInstant(to)} is before the current simulated time ${formatInstant(from)}. Use rewindTo() or travel().`,
      );
    }
    return this.#moveTo(to, 'advance', label);
  }

  /** Move backward to a target that must not be in the simulated future. */
  rewindTo(target: TravelTarget, label?: string): this {
    const to = this.#resolveTarget(target, 'rewindTo');
    const from = this.nowMs();
    if (to > from) {
      throw new InvalidClockOperationError(
        `rewindTo: ${formatInstant(to)} is after the current simulated time ${formatInstant(from)}. Use advanceTo() or travel().`,
      );
    }
    return this.#moveTo(to, 'rewind', label);
  }

  /** Return to real time, running. Listeners and history are kept. */
  reset(label?: string): this {
    const from = this.nowMs();
    this.#anchor = null;
    this.#frozen = false;
    this.#realAnchor = this.#realTime();
    return this.#emit('reset', from, this.nowMs(), label);
  }

  /** Change the time zone used for calendar arithmetic and `today()`. Does not move time. */
  setTimeZone(timeZone: string): this {
    this.#timeZone = assertTimeZone(timeZone);
    return this;
  }

  /** Compute `now + duration` without moving the clock. */
  peek(duration: DurationLike): Date {
    return new Date(this.#add(duration));
  }

  // ---------------------------------------------------------------- events

  /** Subscribe to change events. Returns an unsubscribe function. */
  subscribe(listener: ClockListener): () => void {
    if (typeof listener !== 'function') throw new InvalidClockOperationError('listener must be a function');
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  clearHistory(): void {
    this.#history.length = 0;
  }

  // ---------------------------------------------------------------- serialization

  toJSON(): ClockSnapshot {
    return {
      version: 1,
      mode: this.mode,
      timeZone: this.#timeZone,
      simulatedMs: this.#anchor,
      realAnchorMs: this.#realAnchor,
    };
  }

  /** Restore a clock from {@link MockClock.toJSON} output. A running clock keeps running from the snapshot. */
  static fromSnapshot(snapshot: unknown, options: Omit<MockClockOptions, 'now' | 'frozen' | 'timeZone'> = {}): MockClock {
    const s = validateSnapshot(snapshot);
    const clock = new MockClock({ ...options, timeZone: s.timeZone });
    if (s.mode === 'real' || s.simulatedMs === null) return clock;
    clock.#anchor = s.simulatedMs;
    clock.#realAnchor = s.realAnchorMs;
    clock.#frozen = s.mode === 'frozen';
    return clock;
  }

  /**
   * Create a frozen clock positioned at a scenario's start, in the scenario's
   * time zone. The resolved scenario (with its events) is available as
   * `clock.scenario`.
   *
   * ```ts
   * const clock = MockClock.scenario('month-end', { year: 2027, month: 2 });
   * ```
   */
  static scenario(
    id: ScenarioId | (string & {}),
    params: ScenarioParams = {},
    options: Omit<MockClockOptions, 'now' | 'scenario' | 'timeZone'> = {},
  ): MockClock {
    const resolved = resolveScenario(id, params);
    return new MockClock({
      frozen: true,
      ...options,
      timeZone: resolved.timeZone,
      now: resolved.startMs,
      scenario: resolved,
    });
  }

  // ---------------------------------------------------------------- internals

  #add(duration: DurationLike): number {
    return addDuration(this.nowMs(), duration, {
      timeZone: this.#timeZone,
      overflow: this.#overflow,
      disambiguation: this.#disambiguation,
    });
  }

  #resolveTarget(target: TravelTarget, label: string): number {
    if (target !== null && typeof target === 'object' && !(target instanceof Date)) {
      if (!('local' in target)) {
        throw new InvalidClockOperationError(`${label}: expected a Date, epoch ms, ISO string or { local, timeZone }`);
      }
      return fromLocal(target.local, target.timeZone ?? this.#timeZone, target.disambiguation ?? this.#disambiguation);
    }
    return toEpochMs(target, label);
  }

  #moveTo(to: number, action: ClockAction, label?: string): this {
    const from = this.nowMs();
    this.#anchor = to;
    this.#realAnchor = this.#realTime();
    return this.#emit(action, from, to, label);
  }

  #emit(action: ClockAction, fromMs: number, toMs: number, label?: string): this {
    const event: ClockChangeEvent = Object.freeze({
      action,
      fromMs,
      toMs,
      deltaMs: toMs - fromMs,
      mode: this.mode,
      sequence: ++this.#sequence,
      ...(label !== undefined ? { label } : {}),
    });
    if (this.#historyLimit > 0) {
      this.#history.push(event);
      if (this.#history.length > this.#historyLimit) this.#history.splice(0, this.#history.length - this.#historyLimit);
    }
    const errors: unknown[] = [];
    for (const listener of [...this.#listeners]) {
      try {
        listener(event);
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, `${errors.length} clock listeners threw`);
    return this;
  }
}

function validateSnapshot(value: unknown): ClockSnapshot {
  if (value === null || typeof value !== 'object') throw new InvalidSnapshotError('Snapshot must be an object');
  const s = value as Record<string, unknown>;
  if (s.version !== 1) throw new InvalidSnapshotError(`Unsupported snapshot version ${String(s.version)}`);
  if (s.mode !== 'real' && s.mode !== 'running' && s.mode !== 'frozen') {
    throw new InvalidSnapshotError(`Invalid snapshot mode ${JSON.stringify(s.mode)}`);
  }
  if (typeof s.timeZone !== 'string') throw new InvalidSnapshotError('Snapshot timeZone must be a string');
  assertTimeZone(s.timeZone);
  if (s.mode !== 'real') {
    if (typeof s.simulatedMs !== 'number' || !Number.isSafeInteger(s.simulatedMs)) {
      throw new InvalidSnapshotError('Snapshot simulatedMs must be an integer');
    }
  }
  if (typeof s.realAnchorMs !== 'number' || !Number.isSafeInteger(s.realAnchorMs)) {
    throw new InvalidSnapshotError('Snapshot realAnchorMs must be an integer');
  }
  return {
    version: 1,
    mode: s.mode,
    timeZone: s.timeZone,
    simulatedMs: s.mode === 'real' ? null : (s.simulatedMs as number),
    realAnchorMs: s.realAnchorMs,
  };
}
