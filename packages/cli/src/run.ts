import { parseArgs, type ParseArgsConfig } from 'node:util';
import {
  DURATION_UNITS,
  InvalidSnapshotError,
  MockClock,
  MockClockError,
  assertTimeZone,
  describeDuration,
  describeScenario,
  formatInstant,
  formatIsoDuration,
  isDaylightSavingTime,
  isZeroDuration,
  listScenarios,
  nextTransition,
  normalizeDuration,
  parseInstant,
  parseIsoDuration,
  previousTransition,
  resolveScenario,
  timeZoneAbbreviation,
  toZonedDateTime,
  type Duration,
  type DurationLike,
  type DurationUnit,
  type ScenarioParams,
  type TimeZoneTransition,
} from '@workfonic/mockclock';
import { SessionError, loadSession, resolveSessionPath, saveSession } from './session.js';
import { VERSION } from './version.js';

export const EXIT_OK = 0;
export const EXIT_ERROR = 1;
export const EXIT_USAGE = 2;

export interface CliIO {
  stdout(text: string): void;
  stderr(text: string): void;
  env: Readonly<Record<string, string | undefined>>;
  cwd: string;
  /** Real-time source; injectable for tests. */
  realTime?: () => number;
}

class UsageError extends Error {}

const COMMANDS = ['now', 'freeze', 'resume', 'advance', 'rewind', 'travel', 'reset', 'scenarios', 'scenario', 'timezone', 'help'] as const;
type Command = (typeof COMMANDS)[number];

const options = {
  json: { type: 'boolean' },
  session: { type: 'string', short: 's' },
  tz: { type: 'string' },
  from: { type: 'string' },
  at: { type: 'string' },
  local: { type: 'string' },
  overflow: { type: 'string' },
  param: { type: 'string', short: 'p', multiple: true },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
  years: { type: 'string' },
  months: { type: 'string' },
  weeks: { type: 'string' },
  days: { type: 'string' },
  hours: { type: 'string' },
  minutes: { type: 'string' },
  seconds: { type: 'string' },
  milliseconds: { type: 'string' },
} as const satisfies ParseArgsConfig['options'];

type Values = {
  json?: boolean;
  session?: string;
  tz?: string;
  from?: string;
  at?: string;
  local?: string;
  overflow?: string;
  param?: string[];
  help?: boolean;
  version?: boolean;
} & Partial<Record<DurationUnit, string>>;

const COMMON = ['json', 'session', 'tz', 'help'];
const DURATION_FLAGS = [...DURATION_UNITS];
const ALLOWED: Record<Command, readonly string[]> = {
  now: COMMON,
  freeze: [...COMMON, 'local'],
  resume: COMMON,
  advance: [...COMMON, 'from', 'overflow', ...DURATION_FLAGS],
  rewind: [...COMMON, 'from', 'overflow', ...DURATION_FLAGS],
  travel: [...COMMON, 'local'],
  reset: COMMON,
  scenarios: ['json', 'help'],
  scenario: [...COMMON, 'param'],
  timezone: [...COMMON, 'at'],
  help: [],
};

const MAX_POSITIONALS: Record<Command, number> = {
  now: 0,
  freeze: 1,
  resume: 0,
  advance: 1,
  rewind: 1,
  travel: 1,
  reset: 0,
  scenarios: 0,
  scenario: 1,
  timezone: 1,
  help: 1,
};

export const HELP = `mockclock ${VERSION} - Control time. Test anything.

Usage: mockclock <command> [arguments] [options]

Commands
  now                         Show the current (simulated or real) time
  freeze [instant]            Freeze time, optionally at an instant
  resume                      Let a frozen session clock run again
  advance [ISO duration]      Move forward, e.g. "advance --days 2 --hours 4" or "advance P2DT4H"
  rewind  [ISO duration]      Move backward, e.g. "rewind --days 1"
  travel <instant>            Jump to an instant, or use --local <date-time> with --tz
  reset                       Return to real time
  scenarios                   List built-in scenarios
  scenario <id>               Resolve a scenario (--param key=value to configure)
  timezone <IANA zone>        Show a time zone's offset, DST state and transitions
  help [command]              Show help

Options
  --session, -s <file>        Persist clock state in <file> between commands
                              (or set MOCKCLOCK_SESSION). Without it nothing persists.
  --tz <zone>                 IANA time zone for calendar arithmetic and display (default: session zone or UTC)
  --from <instant>            Starting instant for advance/rewind without a session (default: now)
  --local <date-time>         Local wall-clock time for travel/freeze, interpreted in --tz
  --at <instant>              Instant to inspect for "timezone" (default: now)
  --overflow constrain|reject End-of-month policy for months/years (default: constrain)
  --param, -p key=value       Scenario parameter (repeatable)
  --years --months --weeks --days --hours --minutes --seconds --milliseconds <n>
  --json                      Machine-readable output on stdout
  --help, -h / --version, -v

Instants must include "Z" or an offset (2026-11-30T23:59:00Z). Local times without
an offset are rejected rather than guessed; use --local with --tz for those.

Exit codes: 0 success, 1 runtime or session-file error, 2 invalid usage or input.
`;

export async function run(argv: readonly string[], io: CliIO): Promise<number> {
  let json = argv.includes('--json');
  try {
    let parsed: { values: Values; positionals: string[] };
    try {
      parsed = parseArgs({ args: [...argv], options, allowPositionals: true, strict: true }) as typeof parsed;
    } catch (error) {
      throw new UsageError((error as Error).message.replace(/^TypeError \[[A-Z_]+\]: /, ''));
    }
    const { values, positionals } = parsed;
    json = Boolean(values.json);

    if (values.version) {
      io.stdout(json ? `${JSON.stringify({ version: VERSION })}\n` : `${VERSION}\n`);
      return EXIT_OK;
    }
    const [name, ...args] = positionals;
    if (!name || values.help) {
      io.stdout(HELP);
      return name || values.help ? EXIT_OK : EXIT_USAGE;
    }
    if (!(COMMANDS as readonly string[]).includes(name)) {
      throw new UsageError(`Unknown command "${name}". Run "mockclock help" to see available commands.`);
    }
    const command = name as Command;
    if (command === 'help') {
      io.stdout(HELP);
      return EXIT_OK;
    }
    const allowed = ALLOWED[command];
    for (const key of Object.keys(values)) {
      if (values[key as keyof Values] !== undefined && !allowed.includes(key)) {
        throw new UsageError(`Option --${key} is not valid for "${command}"`);
      }
    }
    if (args.length > MAX_POSITIONALS[command]) {
      throw new UsageError(`Too many arguments for "${command}": ${args.join(' ')}`);
    }

    const ctx = new Context(io, values, json);
    const result = await ctx.execute(command, args);
    ctx.print(result);
    return EXIT_OK;
  } catch (error) {
    return reportError(error, io, json);
  }
}

function reportError(error: unknown, io: CliIO, json: boolean): number {
  let code = EXIT_ERROR;
  let kind = 'error';
  if (error instanceof UsageError) {
    code = EXIT_USAGE;
    kind = 'usage';
  } else if (error instanceof SessionError || error instanceof InvalidSnapshotError) {
    code = EXIT_ERROR;
    kind = 'session';
  } else if (error instanceof MockClockError) {
    code = EXIT_USAGE;
    kind = error.code;
  }
  const message = error instanceof Error ? error.message : String(error);
  if (json) io.stdout(`${JSON.stringify({ ok: false, error: { kind, message } })}\n`);
  io.stderr(`mockclock: ${message}\n`);
  if (code === EXIT_USAGE && error instanceof UsageError) io.stderr('Run "mockclock help" for usage.\n');
  if (error instanceof MockClockError && error.code === 'AMBIGUOUS_DATE_INPUT') {
    io.stderr('On the command line, use --local <date-time> --tz <zone> for local times.\n');
  }
  return code;
}

type Result = Record<string, unknown> & { human: string; notes?: string[] };

class Context {
  readonly #io: CliIO;
  readonly #values: Values;
  readonly #json: boolean;
  readonly #sessionPath: string | undefined;

  constructor(io: CliIO, values: Values, json: boolean) {
    this.#io = io;
    this.#values = values;
    this.#json = json;
    const raw = values.session ?? io.env.MOCKCLOCK_SESSION;
    this.#sessionPath = raw ? resolveSessionPath(raw, io.cwd) : undefined;
    if (values.tz !== undefined) assertTimeZone(values.tz);
  }

  get #realTime(): () => number {
    return this.#io.realTime ?? Date.now;
  }

  async #clock(): Promise<{ clock: MockClock; fromSession: boolean }> {
    const tz = this.#values.tz;
    if (this.#sessionPath) {
      const loaded = await loadSession(this.#sessionPath, this.#realTime);
      if (loaded) {
        if (tz) loaded.setTimeZone(tz);
        return { clock: loaded, fromSession: true };
      }
    }
    const clock = new MockClock({ timeZone: tz ?? 'UTC', realTime: this.#realTime, overflow: this.#overflow() });
    return { clock, fromSession: false };
  }

  #overflow(): 'constrain' | 'reject' {
    const o = this.#values.overflow ?? 'constrain';
    if (o !== 'constrain' && o !== 'reject') throw new UsageError(`--overflow must be "constrain" or "reject", received "${o}"`);
    return o;
  }

  async #persist(clock: MockClock): Promise<boolean> {
    if (!this.#sessionPath) return false;
    await saveSession(this.#sessionPath, clock, formatInstant(this.#realTime()));
    return true;
  }

  #describe(clock: MockClock, persisted: boolean, extra: Record<string, unknown> = {}): Record<string, unknown> {
    const s = clock.state();
    return {
      ok: true,
      ...extra,
      mode: s.mode,
      simulated: s.simulated,
      now: s.now,
      local: s.zoned.iso,
      timeZone: s.timeZone,
      realNow: s.realNow,
      offsetFromRealMs: s.offsetFromRealMs,
      session: this.#sessionPath ?? null,
      persisted,
    };
  }

  #statelessNote(mutating: boolean): string[] {
    if (this.#sessionPath || !mutating) return [];
    return [
      'Not persisted: each mockclock command is independent. Pass --session <file> (or set MOCKCLOCK_SESSION) to keep simulated time between commands.',
    ];
  }

  #duration(arg: string | undefined): Duration {
    const flags: DurationLike = {};
    let any = false;
    for (const unit of DURATION_UNITS) {
      const raw = this.#values[unit];
      if (raw === undefined) continue;
      if (!/^\d+$/.test(raw.trim())) {
        throw new UsageError(`--${unit} must be a non-negative whole number, received "${raw}"`);
      }
      flags[unit] = Number(raw);
      any = true;
    }
    if (arg !== undefined && any) throw new UsageError('Give either an ISO 8601 duration argument or --unit flags, not both');
    const d = arg !== undefined ? parseIsoDuration(arg) : normalizeDuration(flags);
    if (DURATION_UNITS.some((u) => d[u] < 0)) {
      throw new UsageError('Durations must be positive; use "rewind" to go back in time');
    }
    if (isZeroDuration(d)) {
      throw new UsageError('No duration given. Example: --days 2 --hours 4, or an ISO duration such as P2DT4H');
    }
    return d;
  }

  async execute(command: Command, args: string[]): Promise<Result> {
    switch (command) {
      case 'now': {
        const { clock } = await this.#clock();
        return this.#result('now', clock, false, {});
      }
      case 'freeze': {
        const { clock } = await this.#clock();
        if (args[0] !== undefined && this.#values.local !== undefined) throw new UsageError('Give an instant or --local, not both');
        if (this.#values.local !== undefined) clock.freeze({ local: this.#values.local });
        else if (args[0] !== undefined) clock.freeze(parseInstant(args[0], 'instant'));
        else clock.freeze();
        const persisted = await this.#persist(clock);
        return this.#result('freeze', clock, persisted, {}, this.#statelessNote(true));
      }
      case 'resume': {
        if (!this.#sessionPath) {
          throw new UsageError('"resume" needs a session (--session <file>); without one there is no frozen clock to resume');
        }
        const { clock } = await this.#clock();
        clock.resume();
        const persisted = await this.#persist(clock);
        return this.#result('resume', clock, persisted, {});
      }
      case 'advance':
      case 'rewind': {
        const duration = this.#duration(args[0]);
        const { clock, fromSession } = await this.#clock();
        if (this.#values.from !== undefined) {
          if (fromSession) throw new UsageError('--from cannot be combined with an existing session; use "travel" first');
          clock.freeze(parseInstant(this.#values.from, '--from'));
        }
        const from = clock.toISOString();
        if (command === 'advance') clock.advance(duration);
        else clock.rewind(duration);
        const persisted = await this.#persist(clock);
        return this.#result(command, clock, persisted, { from, duration: formatIsoDuration(duration) }, this.#statelessNote(true), `${command === 'advance' ? 'Advanced' : 'Rewound'} ${describeDuration(duration)} from ${from}`);
      }
      case 'travel': {
        if (args[0] === undefined && this.#values.local === undefined) {
          throw new UsageError('"travel" needs an instant (2027-01-01T00:00:00Z) or --local <date-time> with --tz');
        }
        if (args[0] !== undefined && this.#values.local !== undefined) throw new UsageError('Give an instant or --local, not both');
        const { clock } = await this.#clock();
        const from = clock.toISOString();
        clock.travel(this.#values.local !== undefined ? { local: this.#values.local } : parseInstant(args[0]!, 'instant'));
        const persisted = await this.#persist(clock);
        return this.#result('travel', clock, persisted, { from }, this.#statelessNote(true));
      }
      case 'reset': {
        const { clock } = await this.#clock();
        clock.reset();
        const persisted = await this.#persist(clock);
        const notes = this.#sessionPath ? [] : ['No session given, so there was no simulated state to reset. Showing real time.'];
        return this.#result('reset', clock, persisted, {}, notes);
      }
      case 'scenarios': {
        const list = listScenarios().map((s) => ({ id: s.id, title: s.title, category: s.category, description: s.description }));
        const width = Math.max(...list.map((s) => s.id.length));
        const human = list.map((s) => `${s.id.padEnd(width)}  ${s.title} - ${s.description}`).join('\n');
        return { ok: true, command: 'scenarios', scenarios: list, human };
      }
      case 'scenario':
        return this.#scenario(args[0]);
      case 'timezone':
        return this.#timezone(args[0]);
      case 'help':
        return { ok: true, human: HELP.trimEnd() };
    }
  }

  async #scenario(id: string | undefined): Promise<Result> {
    if (!id) throw new UsageError('"scenario" needs an id. Run "mockclock scenarios" to list them.');
    const params: Record<string, string> = {};
    for (const p of this.#values.param ?? []) {
      const eq = p.indexOf('=');
      if (eq <= 0) throw new UsageError(`--param must look like key=value, received "${p}"`);
      params[p.slice(0, eq)] = p.slice(eq + 1);
    }
    if (this.#values.tz !== undefined && !('timeZone' in params) && 'timeZone' in describeScenario(id).params) {
      params.timeZone = this.#values.tz;
    }
    const scenario = resolveScenario(id, params as ScenarioParams);
    const clock = MockClock.scenario(id, params as ScenarioParams, { realTime: this.#realTime });
    const persisted = await this.#persist(clock);
    const lines = [
      `${scenario.title} (${scenario.id})`,
      scenario.description,
      '',
      `Time zone: ${scenario.timeZone}`,
      `Start:     ${scenario.startLocal}  (${scenario.start}), clock frozen`,
      '',
      'Events:',
      ...scenario.events.map((e) => `  ${e.local}  ${e.label}${e.description ? `\n${' '.repeat(29)}${e.description}` : ''}`),
      ...(scenario.notes.length ? ['', ...scenario.notes] : []),
      '',
      `Parameters: ${Object.entries(scenario.params).map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(',') : String(v)}`).join(' ')}`,
    ];
    return {
      ok: true,
      command: 'scenario',
      scenario,
      session: this.#sessionPath ?? null,
      persisted,
      human: lines.join('\n'),
      notes: persisted
        ? [`Session clock frozen at the scenario start. Use "mockclock advance" to move through events.`]
        : ['Not persisted. Pass --session <file> to load this scenario into a session clock.'],
    };
  }

  async #timezone(zone: string | undefined): Promise<Result> {
    if (!zone) throw new UsageError('"timezone" needs an IANA zone, for example: mockclock timezone Asia/Kolkata');
    assertTimeZone(zone);
    let at: number;
    if (this.#values.at !== undefined) at = parseInstant(this.#values.at, '--at');
    else at = (await this.#clock()).clock.nowMs();
    const z = toZonedDateTime(at, zone);
    const next = nextTransition(zone, at);
    const prev = previousTransition(zone, at);
    const t = (x: TimeZoneTransition | undefined) =>
      x ? { at: x.iso, kind: x.kind, offsetBefore: x.offsetBefore, offsetAfter: x.offsetAfter, localBefore: x.localBefore, localAfter: x.localAfter } : null;
    const info = {
      ok: true,
      command: 'timezone',
      timeZone: zone,
      at: formatInstant(at),
      local: z.iso,
      offset: z.offset,
      offsetMinutes: z.offsetMs / 60_000,
      abbreviation: timeZoneAbbreviation(at, zone),
      isDst: isDaylightSavingTime(at, zone),
      previousTransition: t(prev),
      nextTransition: t(next),
    };
    const fmt = (x: ReturnType<typeof t>) =>
      x ? `${x.at} (${x.kind === 'gap' ? 'clocks forward' : 'clocks back'} ${x.offsetBefore} -> ${x.offsetAfter})` : 'none within 2 years';
    const human = [
      `${zone}`,
      `Instant:    ${info.at}`,
      `Local time: ${z.iso}`,
      `Offset:     ${z.offset} (${info.abbreviation})${info.isDst ? ', daylight saving time' : ''}`,
      `Previous transition: ${fmt(info.previousTransition)}`,
      `Next transition:     ${fmt(info.nextTransition)}`,
    ].join('\n');
    return { ...info, human };
  }

  #result(command: string, clock: MockClock, persisted: boolean, extra: Record<string, unknown>, notes: string[] = [], headline?: string): Result {
    const data = this.#describe(clock, persisted, { command, ...extra });
    const label = clock.mode === 'real' ? 'real time' : clock.mode === 'frozen' ? 'simulated, frozen' : 'simulated, running';
    const lines = [
      ...(headline ? [headline] : []),
      `${clock.toISOString()}  (${label})`,
      `${clock.zoned().iso}  ${clock.timeZone}`,
    ];
    if (this.#sessionPath) lines.push(`Session: ${this.#sessionPath}${persisted ? ' (saved)' : ''}`);
    return { ...data, human: lines.join('\n'), notes };
  }

  print(result: Result): void {
    const { human, notes, ...data } = result;
    if (this.#json) {
      this.#io.stdout(`${JSON.stringify(notes && notes.length ? { ...data, notes } : data, null, 2)}\n`);
      return;
    }
    this.#io.stdout(`${human}\n`);
    for (const n of notes ?? []) this.#io.stderr(`Note: ${n}\n`);
  }
}
