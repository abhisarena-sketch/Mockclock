# MockClock playground

An interactive Next.js app for exploring MockClock. It imports the real `@workfonic/mockclock` package; there is no separate simulation logic in the UI, no backend, no database and no analytics.

```bash
# from the repository root
npm install
npm run build:packages                                      # the playground uses packages/core/dist
npm run dev --workspace @workfonic/mockclock-playground     # http://localhost:3000
npm run build --workspace @workfonic/mockclock-playground   # static site in apps/playground/out
```

Set `PLAYGROUND_BASE_PATH=/mockclock` when building for a sub-path such as GitHub Pages. The scripts run Next.js with `NEXT_TELEMETRY_DISABLED=1`.

Sections: current clock (real vs simulated), simulation controls with generated TypeScript, scenario explorer, time zone explorer, DST explorer, event timeline, and billing renewal, subscription expiry, payroll cut-off and token expiration demos.

UI primitives in `components/ui` follow shadcn/ui conventions (`cn`, `class-variance-authority`) and are written by hand.
