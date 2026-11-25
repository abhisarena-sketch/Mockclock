# CLI (`@workfonic/mockclock-cli`)

```bash
npm install --global @workfonic/mockclock-cli    # once published
# or from a clone: npm run build:packages && node packages/cli/dist/bin.js help
```

## Persistence: read this first

Each `mockclock` invocation is a separate process. **Without a session, nothing persists**: `mockclock freeze ...` followed by `mockclock now` shows real time again. Commands that would change state say so on stderr (`Note: Not persisted ...`) and report `"persisted": false` in JSON.

To keep simulated time between commands, use a session file:

```bash
mockclock freeze 2026-11-30T23:59:00Z --session .mockclock-session.json
mockclock advance --days 2 --session .mockclock-session.json
# or
export MOCKCLOCK_SESSION=.mockclock-session.json
```

The session file is plain JSON holding a clock snapshot. It is written atomically (temporary file + rename). A running (not frozen) clock keeps running between commands relative to real time. **The session only affects `mockclock` commands that read it**; it does not change the time seen by your application, other processes or the operating system. To use it from your own code, read the file and call `MockClock.fromSnapshot(json.clock)`.

## Commands

| Command | Description |
|---|---|
| `now` | Current time: simulated (session) or real. |
| `freeze [instant]` / `freeze --local <dt> --tz <zone>` | Freeze, optionally at an instant or local time. |
| `resume` | Let a frozen session clock run again (requires a session). |
| `advance [ISO duration] [--years … --milliseconds]` | Move forward. Without a session starts from `--from` or now. |
| `rewind [ISO duration] [--days …]` | Move backward. |
| `travel <instant>` / `travel --local <dt> --tz <zone>` | Jump to an instant or local time. |
| `reset` | Back to real time. |
| `scenarios` | List scenarios. |
| `scenario <id> [-p key=value …]` | Resolve a scenario; with a session, load it (frozen at its start). `--tz` fills the scenario's `timeZone` parameter. |
| `timezone <zone> [--at instant]` | Local time, offset, abbreviation, DST flag, previous and next transition. |
| `help`, `--help`, `--version` | |

## Options

| Option | Applies to | Meaning |
|---|---|---|
| `--session, -s <file>` | all except `scenarios` | Session file (also `MOCKCLOCK_SESSION`). Relative paths resolve against the working directory. |
| `--tz <zone>` | all except `scenarios` | IANA zone for calendar arithmetic and display. Stored in the session. Default: session zone, else `UTC`. |
| `--from <instant>` | `advance`, `rewind` | Start instant when there is no session. |
| `--local <date-time>` | `freeze`, `travel` | Local wall-clock time in `--tz`. |
| `--at <instant>` | `timezone` | Instant to inspect. |
| `--overflow constrain\|reject` | `advance`, `rewind` | End-of-month policy. |
| `--param, -p key=value` | `scenario` | Scenario parameter; repeatable. Lists are comma-separated. |
| `--json` | all | JSON on stdout. Errors are also JSON (`{ "ok": false, "error": { "kind", "message" } }`). |

Duration flags take non-negative whole numbers; combine freely (`--days 2 --hours 4`). Alternatively pass one ISO 8601 duration (`P2DT4H`). Not both.

## Input rules

- Instants must include `Z` or an offset. `2027-01-01` is rejected with a hint to use `--local … --tz …`.
- Invalid dates (`2026-02-30T00:00:00Z`), hours ≥ 24, leap seconds, unknown zones, unknown options and options that do not apply to the command are rejected.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Success |
| `1` | Runtime error: unreadable, corrupt or unwritable session file; unexpected error |
| `2` | Invalid usage or input: unknown command or option, bad date, duration, zone or scenario parameter |

A corrupt session file is never overwritten.

## JSON output

`now`, `freeze`, `resume`, `advance`, `rewind`, `travel` and `reset`:

```json
{
  "ok": true,
  "command": "advance",
  "from": "2026-11-30T23:59:00.000Z",
  "duration": "P2DT4H",
  "mode": "frozen",
  "simulated": true,
  "now": "2026-12-03T03:59:00.000Z",
  "local": "2026-12-03T03:59:00+00:00",
  "timeZone": "UTC",
  "realNow": "2026-11-25T12:00:00.000Z",
  "offsetFromRealMs": 683940000,
  "session": "/work/.mockclock-session.json",
  "persisted": true
}
```

`scenario` returns `{ ok, command, scenario: ResolvedScenario, session, persisted }`; `scenarios` returns `{ ok, command, scenarios: [{ id, title, category, description }] }`; `timezone` returns `{ ok, command, timeZone, at, local, offset, offsetMinutes, abbreviation, isDst, previousTransition, nextTransition }`.
