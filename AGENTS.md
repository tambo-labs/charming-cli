# Contributor rules

- Write clear, short English.
- Treat `tambo-ai/charming/packages/cli` as the only source of truth. The public repository is a generated mirror.
- Treat `openapi.json` as the upstream contract snapshot.
- Never edit `src/generated/operations.ts` by hand. Run `bun run openapi:gen`.
- Keep product workflows and safety checks in hand-written source files.
- Never print tokens, cookies, authorization headers, device codes, or secret values.
- Run `bun run --filter usecharming check` before opening a monorepo pull request.
- Smoke-test the built CLI from outside this repository.
