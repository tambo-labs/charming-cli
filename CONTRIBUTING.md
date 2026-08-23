# Contributing

Issues and pull requests are welcome.

1. Fork and clone the repository.
2. Run `bun install`.
3. Add behavior tests for command changes.
4. Run `bun run check`.
5. Explain the user-visible effect in the pull request.

Do not edit `src/generated/operations.ts` directly. If the API contract changed, update `openapi.json` and run `bun run openapi:gen`.

## Releasing

Merging a PR to `main` does not publish anything. In particular, a `skills/**` change sits unpublished on ClawHub until a release ships — `clawhub-publish.yml` only runs a `--dry-run` on a pull request; the real `sync` (with `CLAWHUB_TOKEN`) runs on the `release: published` event only, and nothing on `main` fires that automatically.

To ship a release (npm + GitHub release + ClawHub sync, in one shot):

1. Bump `version` in `package.json`.
2. Commit and merge that change to `main`.
3. Tag the merge commit and push the tag: `git tag vX.Y.Z && git push origin vX.Y.Z`. The tag must match `package.json`'s version exactly, or `release.yml` fails its verification step.

The tag push runs `bun run check`, publishes to npm (trusted publishing, no manual token), creates the GitHub release, and — because that release triggers `clawhub-publish.yml`'s `publish` job — syncs `skills/charming` to ClawHub. If you only need the ClawHub side (no npm-worthy change), run the `ClawHub publish` workflow manually instead: **Actions → ClawHub publish → Run workflow**.
