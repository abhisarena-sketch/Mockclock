# Support

## Getting help

- **Documentation:** start with the [README](README.md) and the [docs](docs) folder ([API](docs/api.md), [calendar arithmetic](docs/calendar-arithmetic.md), [time zones](docs/timezones.md), [scenarios](docs/scenarios.md), [Node.js](docs/node.md), [CLI](docs/cli.md)).
- **Questions and ideas:** open a [GitHub Discussion](https://github.com/abhisarena-sketch/mockclock/discussions) if enabled, or an issue with the *question* label.
- **Bugs:** open a [bug report](https://github.com/abhisarena-sketch/mockclock/issues/new?template=bug_report.yml). Include the MockClock and Node.js versions, the time zone involved, and a minimal reproduction.
- **Security issues:** do not open a public issue; see [SECURITY.md](SECURITY.md).

## What to include for time zone bugs

Time zone results depend on the runtime's ICU data. Please include the output of:

```bash
node -p "process.versions.node + ' icu ' + process.versions.icu + ' tz ' + process.versions.tz"
```

MockClock is maintained by Workfonic Labs on a best-effort basis. There is no paid support.
