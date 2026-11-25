/**
 * Error codes are stable and safe to match on in application code and tests.
 */
export type MockClockErrorCode =
  | 'INVALID_DATE'
  | 'AMBIGUOUS_DATE_INPUT'
  | 'INVALID_DURATION'
  | 'INVALID_TIME_ZONE'
  | 'NONEXISTENT_LOCAL_TIME'
  | 'AMBIGUOUS_LOCAL_TIME'
  | 'CALENDAR_OVERFLOW'
  | 'INVALID_CLOCK_OPERATION'
  | 'UNKNOWN_SCENARIO'
  | 'INVALID_SCENARIO_PARAMETER'
  | 'INVALID_SNAPSHOT';

/** Base class for every error thrown by MockClock. */
export class MockClockError extends Error {
  readonly code: MockClockErrorCode;

  constructor(code: MockClockErrorCode, message: string) {
    super(message);
    this.name = 'MockClockError';
    this.code = code;
  }
}

/** A value could not be interpreted as a valid date, time or instant. */
export class InvalidDateError extends MockClockError {
  constructor(message: string) {
    super('INVALID_DATE', message);
    this.name = 'InvalidDateError';
  }
}

/**
 * A string was a local date or date-time without an offset where an absolute
 * instant was required. MockClock never silently assumes UTC.
 */
export class AmbiguousDateInputError extends MockClockError {
  constructor(message: string) {
    super('AMBIGUOUS_DATE_INPUT', message);
    this.name = 'AmbiguousDateInputError';
  }
}

export class InvalidDurationError extends MockClockError {
  constructor(message: string) {
    super('INVALID_DURATION', message);
    this.name = 'InvalidDurationError';
  }
}

export class InvalidTimeZoneError extends MockClockError {
  constructor(message: string) {
    super('INVALID_TIME_ZONE', message);
    this.name = 'InvalidTimeZoneError';
  }
}

/** A local wall-clock time falls inside a gap (for example a DST spring-forward). */
export class NonexistentLocalTimeError extends MockClockError {
  constructor(message: string) {
    super('NONEXISTENT_LOCAL_TIME', message);
    this.name = 'NonexistentLocalTimeError';
  }
}

/** A local wall-clock time occurs twice (for example a DST fall-back). */
export class AmbiguousLocalTimeError extends MockClockError {
  constructor(message: string) {
    super('AMBIGUOUS_LOCAL_TIME', message);
    this.name = 'AmbiguousLocalTimeError';
  }
}

/** Calendar arithmetic produced a day that does not exist and `overflow: 'reject'` was used. */
export class CalendarOverflowError extends MockClockError {
  constructor(message: string) {
    super('CALENDAR_OVERFLOW', message);
    this.name = 'CalendarOverflowError';
  }
}

export class InvalidClockOperationError extends MockClockError {
  constructor(message: string) {
    super('INVALID_CLOCK_OPERATION', message);
    this.name = 'InvalidClockOperationError';
  }
}

export class UnknownScenarioError extends MockClockError {
  constructor(message: string) {
    super('UNKNOWN_SCENARIO', message);
    this.name = 'UnknownScenarioError';
  }
}

export class InvalidScenarioParameterError extends MockClockError {
  constructor(message: string) {
    super('INVALID_SCENARIO_PARAMETER', message);
    this.name = 'InvalidScenarioParameterError';
  }
}

export class InvalidSnapshotError extends MockClockError {
  constructor(message: string) {
    super('INVALID_SNAPSHOT', message);
    this.name = 'InvalidSnapshotError';
  }
}
