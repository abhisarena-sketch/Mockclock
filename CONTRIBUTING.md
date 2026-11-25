# Contributing to MockClock

Thanks for helping. Bug reports, fixes, new scenarios and better documentation are all welcome.

## Development

Requirements: Node.js 22.18+ (development tooling) and npm 10+. The published packages support Node.js 20+.

```bash
npm install
npm run typecheck    # all workspaces, examples and tests
npm run lint         # ESLint (no eval / Function, consistent type imports, React hooks rules)
npm test             # unit tests against TypeScript sources (no build needed)
npm run build        # packages (tsup) and the playground (Next.js static export)
npm run test:e2e     # built packages: ESM/CJS imports, CLI binary, examples, packaging, generated docs
npm run check        # everything above, in order
```

Useful extras:

```bash
npm run examples                                   # run examples/ against dist
npm run verify:pack                                # npm pack --dry-run checks
node scripts/generate-scenario-docs.mjs            # regenerate docs/scenarios.md after changing the registry
npm run dev --workspace @workfonic/mockclock-playground
```

Tests run with `TZ=UTC`. Never rely on the machine's time zone in tests or library code; pass zones explicitly.

## Project layout

| Path | What lives there |
|---|---|
| `packages/core/src` | The SDK. No runtime dependencies and no Node.js-only APIs. |
| `packages/node/src` | Node.js integration (AsyncLocalStorage, Date patch, timer adapters). |
| `packages/cli/src` | The `mockclock` CLI (`run.ts` is testable in-process; `bin.ts` is the entry point). |
| `packages/*/test` | Unit tests (Vitest). |
| `tests/e2e` | Tests of the built output. |
| `apps/playground` | Next.js playground. |
| `examples` | Self-checking examples (each uses `node:assert`). |
| `docs` | Reference documentation. `docs/scenarios.md` is generated. |

See [docs/architecture.md](docs/architecture.md) for the design decisions.

## Adding a scenario

1. Add an entry to `SCENARIOS` in `packages/core/src/scenarios.ts`: title, description, category, parameter specs with defaults, and `resolve()`. Do not hard-code dates anywhere else.
2. Add behaviour tests in `packages/core/test/scenarios.test.ts` (the registry test checks the list of ids, so update it).
3. Run `npm run build:packages && node scripts/generate-scenario-docs.mjs`.
4. Update the scenario table in `README.md` and `CHANGELOG.md`.

## Guidelines

- Calendar arithmetic must never approximate months or years with fixed milliseconds.
- Never invent time zone offsets. Read them from `Intl`.
- Never interpret an offset-less string as UTC or local time silently.
- Global patching must stay opt-in, reversible and conflict-checked.
- No network requests, telemetry, `eval` or `new Function`.
- No new runtime dependency in `@workfonic/mockclock` without discussion; today there are none.
- Add or update a test for every behaviour change. Tests must check behaviour, not just that functions exist.
- Update `CHANGELOG.md` under *Unreleased*.

## Commits and pull requests

Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat(core): …`, `fix(cli): …`, `docs: …`). Open an issue first for large changes. Keep pull requests focused, describe the behaviour change and how you tested it, and make sure `npm run check` passes.

By contributing you agree that your contributions are licensed under the MIT License and that you will follow the [Code of Conduct](CODE_OF_CONDUCT.md).
