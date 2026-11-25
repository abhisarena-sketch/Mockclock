# Security Policy

## Supported versions

Security fixes are released for the latest minor version of `@workfonic/mockclock`, `@workfonic/mockclock-node` and `@workfonic/mockclock-cli`.

## Reporting a vulnerability

**Please do not open a public issue.** Report it privately through [GitHub Security Advisories](https://github.com/abhisarena-sketch/mockclock/security/advisories/new).

Include the affected package and version, steps to reproduce, and the impact. You will get an acknowledgement within 72 hours and a status update within 7 days.

## Scope

Areas we particularly care about:

- The global `Date` patch failing to restore, restoring the wrong constructor, or leaking across tests.
- Input parsing that could be abused (for example pathological strings causing excessive CPU time).
- CLI session-file handling: path handling, writes outside the chosen file, or acting on malformed files.
- Any code path that performs network requests, executes dynamic code, or reads files other than the session file the user named.
- Supply-chain concerns in the published packages.

## How MockClock is built to be safe

- No network requests, telemetry or data collection in any package. The playground runs Next.js with telemetry disabled and makes no requests of its own.
- No `eval`, `new Function` or dynamic `import()` of user input (enforced by ESLint).
- The core package has no runtime dependencies.
- Global patching never happens on import; it is explicit, reversible and conflict-checked.
- The CLI only reads and writes the session file you pass, validates its contents, writes atomically, and never overwrites a file it could not parse.
- Releases are published only from the Release workflow after a manual approval, with npm provenance.
