# @workfonic/mockclock-cli

The `mockclock` command, by Workfonic Labs. Part of [MockClock](https://github.com/abhisarena-sketch/mockclock).

```bash
npm install --global @workfonic/mockclock-cli
mockclock timezone Asia/Kolkata
mockclock scenario month-end -p year=2027 -p month=2
mockclock advance --days 2 --hours 4 --from 2026-11-30T23:59:00Z --json
```

Each command is independent: **state persists only with `--session <file>`** (or `MOCKCLOCK_SESSION`).

```bash
export MOCKCLOCK_SESSION=.mockclock-session.json
mockclock freeze 2026-11-30T23:59:00Z
mockclock advance --days 2 --hours 4
mockclock now --json
```

The session affects only `mockclock` itself, never the system clock or other processes. Exit codes: `0` success, `1` runtime/session error, `2` invalid usage or input. Full reference: [docs/cli.md](https://github.com/abhisarena-sketch/mockclock/blob/main/docs/cli.md).

MIT © Workfonic Labs
