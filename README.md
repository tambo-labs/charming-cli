# Charming CLI

Build and manage personal apps hosted by [Charming](https://charm.ing) from a terminal or coding agent.

## Install

Not published yet. Once it is, the plan is:

```bash
npm install -g @usecharming/charming-cli
# or
brew install tambo-labs/tap/charming
```

Until then, install from source:

```bash
git clone https://github.com/tambo-labs/charming-cli.git
cd charming-cli
bun install
bun run build
bun link
charming doctor
```

Remove the link with `bun unlink`.

## First app

```bash
charming auth login --no-open
charming apps create examples/hello --dry-run
charming apps create examples/hello --yes
```

Commands write JSON results to stdout. Login instructions and JSON errors go to stderr. Run mutations with `--dry-run` first. Live deletions and signed-in creates require `--yes`.

Command help and input validation come from [oclif](https://oclif.io). Run `charming <topic> <command> --help` to see the generated usage and flags for any command, or `charming --help` for the full command list.

## Environment

- `CHARMING_TOKEN`: user-token override.
- `CHARMING_BASE_URL`: API origin override.
- `XDG_CONFIG_HOME`: config-directory override.

The CLI stores credentials in `$XDG_CONFIG_HOME/charming/config.json`, or `~/.config/charming/config.json`, with user-only permissions.

## Development

```bash
bun install
bun run openapi:gen
bun run check
```

`openapi.json` is a snapshot of the Charming OpenAPI contract. `src/generated/operations.ts` is generated from it with the pinned Hey API version. Do not edit the generated file.

An hourly GitHub workflow checks the live Charming OpenAPI document. When the contract changes, it updates the snapshot and generated catalog and opens a pull request. `UPSTREAM.json` records the source URL and contract digest.

## Agent skill

The portable skill lives at `skills/charming-cli/SKILL.md`.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Report security issues as described in [SECURITY.md](./SECURITY.md).
