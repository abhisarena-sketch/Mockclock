# Releasing

Releases are manual and deliberate. Nothing is published automatically.

## Before the first release

1. **npm scope.** The packages are scoped to `@workfonic`. Create the `workfonic` organization on npmjs.com (or change the scope in every `package.json`, the README and the docs). On 2026-11-25, `@workfonic/mockclock`, `@workfonic/mockclock-node`, `@workfonic/mockclock-cli` and the unscoped `mockclock` were all unpublished on the public registry. Check again before publishing: `npm view <name>` should return `E404`.
2. **Token.** Create an npm automation token (or configure npm trusted publishing for this repository) and add it to the repository as the `NPM_TOKEN` secret.
3. **Environment.** Create a GitHub environment named `npm` with required reviewers, so every publish needs a human approval.

## Release steps

1. Make sure `main` is green.
2. Bump the version in `packages/core/package.json`, `packages/node/package.json`, `packages/cli/package.json`, `packages/cli/src/version.ts`, and the `@workfonic/mockclock` dependency ranges in node and cli. All three packages share one version.
3. Move the `Unreleased` entries in `CHANGELOG.md` under the new version with today's date and update the compare links.
4. Run the full check locally:
   ```bash
   npm ci
   npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e && npm run verify:pack
   ```
5. Commit (`chore(release): vX.Y.Z`), tag `vX.Y.Z`, push the tag.
6. The **Release** workflow re-runs every check, packs the tarballs, creates a draft GitHub release with them attached, and then waits on the `npm` environment approval before running `npm publish --provenance --access public` for core, node and cli in dependency order.
7. Review the draft release notes and publish the GitHub release.

To dry-run packaging at any time: `npm run verify:pack`.
