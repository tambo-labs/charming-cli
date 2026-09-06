# Contributing

Issues are welcome in this public repository. Make source changes in the private Charming monorepo; this repository is a generated mirror and does not accept source pull requests.

1. Clone `tambo-ai/charming` with the access granted to you.
2. Run `bun install`.
3. Change `packages/cli` and add behavior tests for command changes.
4. Run `bun run --filter usecharming check`.
5. Explain the user-visible effect in the pull request.

Do not edit `packages/cli/src/generated/operations.ts` or `packages/cli/openapi.json` directly. If the API contract changed, regenerate the monorepo contract, then run `bun run cli:gen`.
