# Charming CLI

Build and manage hosted personal apps from a terminal or coding agent.

## Local install

This MVP is local-only. It requires Bun and Node.js 22 or newer. From the Charming monorepo:

```bash
bun install
bun run cli:gen
bun run --cwd packages/cli build
cd packages/cli && bun link
charming doctor
```

For repo-local use without linking:

```bash
bun run charming -- --help
```

Remove the global link with `cd packages/cli && bun unlink`.

## First app

Authenticate once:

```bash
charming auth login --no-open
```

Create the included example:

```bash
charming apps create packages/cli/examples/hello --yes
```

The JSON result includes the app ID and URL. Use the ID to inspect its operations:

```bash
charming apps describe <APP_ID>
charming apps call <APP_ID> hello --input '{"name":"Ada"}'
```

Commands write JSON results to stdout. Login instructions and JSON errors go to stderr. Mutations accept `--dry-run`. Live deletions and authenticated creates require `--yes`. An authenticated create can replace an app with the same manifest ID.

## Contract sync

The OpenAPI file defines the platform API operations:

```bash
bun run cli:gen
bun run cli:check
bun run --cwd packages/cli test:coverage
bun run --cwd packages/cli typecheck
bun run --cwd packages/cli build
```

Run `cli:gen` after `apps/docs/openapi.fallback.json` changes. CI runs `cli:check` and fails if the generated file differs.

## Environment

- `CHARMING_TOKEN`: user token override.
- `CHARMING_BASE_URL`: API origin override for local or preview servers.
- `XDG_CONFIG_HOME`: changes the config root.

The CLI stores credentials at `$XDG_CONFIG_HOME/charming/config.json`, or `~/.config/charming/config.json`, with mode `0600`. It sends `CHARMING_TOKEN`, `BUILDY_USER_TOKEN`, and old unscoped credentials only to `https://charm.ing`. Other origins need a credential saved for that origin or an explicit `--token`.

## Agent skill

The portable skill lives at `skills/charming/SKILL.md`.
