# Contributing

Issues and pull requests are welcome.

1. Fork and clone the repository.
2. Run `bun install`.
3. Add behavior tests for command changes.
4. Run `bun run check`.
5. Explain the user-visible effect in the pull request.

Do not edit `src/generated/operations.ts` directly. If the API contract changed, update `openapi.json` and run `bun run openapi:gen`.
