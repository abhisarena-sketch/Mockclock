import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EXIT_ERROR, EXIT_OK, EXIT_USAGE, run } from '../src/run.js';
import { VERSION } from '../src/version.js';

const REAL_NOW = Date.parse('2026-11-25T12:00:00Z');
let dir: string;
let realNow = REAL_NOW;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'mockclock-cli-'));
  realNow = REAL_NOW;
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function cli(...argv: string[]) {
  let stdout = '';
  let stderr = '';
  const code = await run(argv, {
    stdout: (s) => (stdout += s),
    stderr: (s) => (stderr += s),
    env: {},
    cwd: dir,
    realTime: () => realNow,
  });
  return { code, stdout, stderr, json: () => JSON.parse(stdout) as Record<string, any> };
}

describe('basics', () => {
  it('prints help and version', async () => {
    const h = await cli('help');
    expect(h.code).toBe(EXIT_OK);
    expect(h.stdout).toContain('Usage: mockclock <command>');
    expect((await cli('--version')).stdout.trim()).toBe(VERSION);
    expect((await cli('--version', '--json')).json()).toEqual({ version: VERSION });
  });

  it('exits 2 with no command', async () => {
    const r = await cli();
    expect(r.code).toBe(EXIT_USAGE);
    expect(r.stdout).toContain('Commands');
  });

  it('now shows real time when nothing is simulated', async () => {
    const r = await cli('now', '--json');
    expect(r.code).toBe(EXIT_OK);
    expect(r.json()).toMatchObject({ ok: true, mode: 'real', simulated: false, now: '2026-11-25T12:00:00.000Z', persisted: false });
  });
});

describe('validation and exit codes', () => {
  it.each([
    [['bogus'], /Unknown command "bogus"/],
    [['advance', '--day', '1'], /Unknown option '--day'/],
    [['advance'], /No duration given/],
    [['advance', '--days', '-1'], /ambiguous/],
    [['advance', '--days=-1'], /non-negative whole number/],
    [['advance', '--days', '1.5'], /non-negative whole number/],
    [['advance', '--days', 'two'], /non-negative whole number/],
    [['advance', 'P1D', '--days', '1'], /not both/],
    [['advance', '--', '-P1D'], /positive/],
    [['advance', 'P1X'], /not a valid ISO 8601 duration/],
    [['advance', '--days', '1', '--overflow', 'wrap'], /--overflow/],
    [['now', '--days', '1'], /--days is not valid for "now"/],
    [['now', 'extra'], /Too many arguments/],
    [['freeze', '2026-02-30T00:00:00Z'], /28 days/],
    [['freeze', 'tomorrow'], /not a valid ISO 8601 instant/],
    [['travel'], /needs an instant/],
    [['travel', '2027-01-01'], /no UTC offset/],
    [['timezone'], /needs an IANA zone/],
    [['timezone', 'Mars/Base'], /Unknown time zone/],
    [['now', '--tz', 'Nope/Zone'], /Unknown time zone/],
    [['scenario'], /needs an id/],
    [['scenario', 'month-start'], /Unknown scenario/],
    [['scenario', 'month-end', '-p', 'month'], /key=value/],
    [['scenario', 'month-end', '-p', 'month=13'], /at most 12/],
    [['resume'], /needs a session/],
  ])('%j fails with exit 2', async (argv, message) => {
    const r = await cli(...(argv as string[]));
    expect(r.code).toBe(EXIT_USAGE);
    expect(r.stderr).toMatch(message);
    expect(r.stdout).toBe('');
  });

  it('reports errors as JSON on stdout with --json', async () => {
    const r = await cli('travel', '2027-01-01', '--json');
    expect(r.code).toBe(EXIT_USAGE);
    expect(r.json()).toMatchObject({ ok: false, error: { kind: 'AMBIGUOUS_DATE_INPUT' } });
    expect(r.stderr).toContain('--local');
  });
});

describe('stateless mode (no session)', () => {
  it('does not pretend to persist anything', async () => {
    const f = await cli('freeze', '2026-11-30T23:59:00Z', '--json');
    expect(f.json()).toMatchObject({ now: '2026-11-30T23:59:00.000Z', mode: 'frozen', persisted: false, session: null });
    expect(f.json().notes[0]).toMatch(/Not persisted/);
    const n = await cli('now', '--json');
    expect(n.json()).toMatchObject({ mode: 'real', now: '2026-11-25T12:00:00.000Z' });
  });

  it('advance uses --from or real now', async () => {
    const a = await cli('advance', '--days', '2', '--hours', '4', '--from', '2026-11-30T23:59:00Z', '--json');
    expect(a.json()).toMatchObject({ from: '2026-11-30T23:59:00.000Z', now: '2026-12-03T03:59:00.000Z', duration: 'P2DT4H' });
    const b = await cli('rewind', '--days', '1', '--json');
    expect(b.json()).toMatchObject({ from: '2026-11-25T12:00:00.000Z', now: '2026-11-24T12:00:00.000Z' });
  });

  it('applies calendar arithmetic in --tz', async () => {
    const r = await cli('advance', 'P1D', '--from', '2026-03-07T17:00:00Z', '--tz', 'America/New_York', '--json');
    expect(r.json()).toMatchObject({ local: '2026-03-08T12:00:00-04:00', now: '2026-03-08T16:00:00.000Z' });
    const m = await cli('advance', '--months', '1', '--from', '2026-01-31T10:00:00Z', '--overflow', 'reject');
    expect(m.code).toBe(EXIT_USAGE);
    expect(m.stderr).toMatch(/does not exist/);
  });

  it('travel accepts --local with --tz', async () => {
    const r = await cli('travel', '--local', '2027-01-01T09:00', '--tz', 'Asia/Tokyo', '--json');
    expect(r.json()).toMatchObject({ now: '2027-01-01T00:00:00.000Z', local: '2027-01-01T09:00:00+09:00' });
  });

  it('reset explains there was nothing to reset', async () => {
    const r = await cli('reset');
    expect(r.code).toBe(EXIT_OK);
    expect(r.stderr).toMatch(/No session given/);
  });
});

describe('session mode', () => {
  it('persists state across invocations', async () => {
    const s = path.join(dir, 'session.json');
    expect((await cli('freeze', '2026-11-30T23:59:00Z', '--session', s)).code).toBe(EXIT_OK);
    await cli('advance', '--days', '2', '--hours', '4', '-s', s);
    await cli('rewind', '--days', '1', '-s', s);
    const now = await cli('now', '-s', s, '--json');
    expect(now.json()).toMatchObject({ now: '2026-12-02T03:59:00.000Z', mode: 'frozen', session: s });
    const file = JSON.parse(await readFile(s, 'utf8'));
    expect(file).toMatchObject({ tool: 'mockclock', version: 1, clock: { mode: 'frozen', timeZone: 'UTC' } });
    await cli('reset', '-s', s);
    expect((await cli('now', '-s', s, '--json')).json()).toMatchObject({ mode: 'real', now: '2026-11-25T12:00:00.000Z' });
  });

  it('a resumed session keeps running with real time', async () => {
    const s = path.join(dir, 'run.json');
    await cli('freeze', '2026-01-01T00:00:00Z', '-s', s);
    await cli('resume', '-s', s);
    realNow += 90_000;
    expect((await cli('now', '-s', s, '--json')).json()).toMatchObject({ mode: 'running', now: '2026-01-01T00:01:30.000Z' });
  });

  it('reads MOCKCLOCK_SESSION and resolves relative paths against cwd', async () => {
    let stdout = '';
    const code = await run(['freeze', '2030-01-01T00:00:00Z', '--json'], {
      stdout: (t) => (stdout += t),
      stderr: () => {},
      env: { MOCKCLOCK_SESSION: 'nested/s.json' },
      cwd: dir,
      realTime: () => realNow,
    });
    expect(code).toBe(EXIT_OK);
    expect(JSON.parse(stdout).session).toBe(path.join(dir, 'nested/s.json'));
    expect(JSON.parse(await readFile(path.join(dir, 'nested/s.json'), 'utf8')).clock.simulatedMs).toBe(Date.parse('2030-01-01T00:00:00Z'));
  });

  it('loads scenarios into a session', async () => {
    const s = path.join(dir, 'sc.json');
    const r = await cli('scenario', 'month-end', '-p', 'year=2027', '-p', 'month=2', '-s', s, '--json');
    expect(r.json()).toMatchObject({ persisted: true, scenario: { id: 'month-end', start: '2027-02-28T23:59:00.000Z' } });
    await cli('advance', '--minutes', '1', '-s', s);
    expect((await cli('now', '-s', s, '--json')).json().now).toBe('2027-03-01T00:00:00.000Z');
  });

  it('remembers the session time zone and lets --tz change it', async () => {
    const s = path.join(dir, 'tz.json');
    await cli('freeze', '2026-01-31T20:00:00Z', '--tz', 'Asia/Tokyo', '-s', s);
    await cli('advance', '--months', '1', '-s', s);
    expect((await cli('now', '-s', s, '--json')).json()).toMatchObject({ timeZone: 'Asia/Tokyo', local: '2026-03-01T05:00:00+09:00' });
  });

  it('refuses --from with an existing session', async () => {
    const s = path.join(dir, 'f.json');
    await cli('freeze', '2026-01-01T00:00:00Z', '-s', s);
    const r = await cli('advance', '--days', '1', '--from', '2027-01-01T00:00:00Z', '-s', s);
    expect(r.code).toBe(EXIT_USAGE);
  });

  it.each([
    ['not json', /not valid JSON/],
    ['{"tool":"other","version":1}', /not a MockClock session file/],
    ['{"tool":"mockclock","version":1,"clock":{"version":1,"mode":"frozen","timeZone":"UTC","simulatedMs":"x","realAnchorMs":0}}', /simulatedMs/],
  ])('rejects a corrupt session file (%s) with exit 1', async (content, message) => {
    const s = path.join(dir, 'bad.json');
    await writeFile(s, content);
    const r = await cli('now', '-s', s);
    expect(r.code).toBe(EXIT_ERROR);
    expect(r.stderr).toMatch(message);
    expect(await readFile(s, 'utf8')).toBe(content); // never overwritten on error
  });

  it('rejects a directory as the session path', async () => {
    const r = await cli('now', '-s', dir);
    expect(r.code).toBe(EXIT_ERROR);
    expect(r.stderr).toMatch(/not a file/);
  });
});

describe('scenarios and time zones', () => {
  it('lists all scenarios', async () => {
    const r = await cli('scenarios', '--json');
    expect(r.json().scenarios).toHaveLength(15);
    expect((await cli('scenarios')).stdout).toMatch(/^month-end\s+Month-end/m);
  });

  it('applies --tz to a scenario with a timeZone parameter', async () => {
    const r = await cli('scenario', 'midnight-rollover', '--tz', 'Asia/Tokyo', '--json');
    expect(r.json().scenario).toMatchObject({ timeZone: 'Asia/Tokyo', startLocal: '2026-11-30T23:59:59+09:00' });
  });

  it('describes a time zone at an instant, including DST transitions', async () => {
    const r = await cli('timezone', 'America/New_York', '--at', '2026-07-01T12:00:00Z', '--json');
    expect(r.json()).toMatchObject({
      local: '2026-07-01T08:00:00-04:00',
      offset: '-04:00',
      offsetMinutes: -240,
      isDst: true,
      previousTransition: { at: '2026-03-08T07:00:00.000Z', kind: 'gap' },
      nextTransition: { at: '2026-11-01T06:00:00.000Z', kind: 'overlap' },
    });
    const k = await cli('timezone', 'Asia/Kolkata', '--json');
    expect(k.json()).toMatchObject({ offset: '+05:30', offsetMinutes: 330, isDst: false, nextTransition: null });
  });

  it('timezone uses the session clock when no --at is given', async () => {
    const s = path.join(dir, 'z.json');
    await cli('freeze', '2026-11-30T23:59:00Z', '-s', s);
    expect((await cli('timezone', 'Asia/Kolkata', '-s', s, '--json')).json().local).toBe('2026-12-01T05:29:00+05:30');
  });
});
