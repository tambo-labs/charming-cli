# Charming CLI

Build and manage personal apps hosted by [Charming](https://charm.ing) from a terminal or coding agent.

## Install

```bash
npm install -g usecharming
# or
brew install tambo-labs/tap/charming
```

To install from source:

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

Commands write JSON results to stdout. Login instructions and JSON errors go to stderr. Run mutations with `--dry-run` first. Live deletions, destructive app operations, share revocations, share declines, App transfers, team invitation declines, direct team member additions, team App default changes, and signed-in creates require `--yes`.

Command help and input validation come from [oclif](https://oclif.io). Run `charming <topic> <command> --help` to see the generated usage and flags for any command, or `charming --help` for the full command list.

## Calling app operations

```bash
charming apps call APP_ID search --input '{"text":"hello","limit":5}' --dry-run
charming api request call-app-operation --param id=APP_ID --param operation=search --body '{"text":"hello","limit":5}' --dry-run
```

Both forms read the app's `agent.json` descriptor first and send the operation with its declared method and path. The `call-app-operation` catalog entry lists the server's generic POST route; the CLI dispatches that one operation by the declared method instead. `--dry-run` makes the descriptor read, prints the resolved request, and does not call the operation.

A `GET` operation receives its input as query parameters. Don't pass secrets as `GET` input, because query strings reach server and proxy logs. In a dry-run preview, query values under credential keys (`token`, keys ending in `_token`, `authorization`, `device_code`) show as `[redacted]`; the live request sends them unchanged.

A `DELETE` operation, or one the app marks `destructive`, requires `--yes`.

## Teams and ownership transfer

Discover existing team operations with `charming api list` and inspect each one with `charming api describe OPERATION_ID`.

```bash
charming api request list-teams
charming api request get-team-app-defaults --param teamId=TEAM_ID
charming api request update-team-app-defaults --param teamId=TEAM_ID --body '{"templateEnabled":true}' --dry-run
charming api request transfer-app --param appId=APP_ID --body '{"teamId":"TEAM_ID"}' --dry-run
```

Team lists, team creation, direct member addition, team App defaults, App transfer, and the team inventory reads (`list-team-apps`, `get-team-audit`, `list-team-egress`, `get-team-exposure`, `list-team-people`, `list-team-shares`) accept a personal access token or a session cookie. `charming api describe OPERATION_ID` lists the accepted schemes in `security`. Creating a team still requires an eligible account plan. Transfer, invitation decline, direct member addition, and default changes require `--yes` to execute; use `--dry-run` to preview. Direct member addition can grant the `owner` role. Default changes can make public access the default for later creates and transfers. Transfer can change access defaults and remove existing grants when `keepExistingAppMembers` is false.

Invitation creation and actions, member role changes and removal, and leaving a team accept only a signed-in session cookie. `api describe` marks these operations with `security: ["sessionCookie"]`. For them the CLI sends no bearer token, refuses `--token`, and fails before sending unless you pass `--header Cookie=NAME=VALUE`. Personal access tokens, including the `charming auth login` token, do not authorize them. Do these actions in the Charming web app, or pass an existing session cookie. The CLI does not obtain or store session cookies. HTTPS uses `__Secure-better-auth.session_token`; local HTTP uses `better-auth.session_token`.

## App management API

Use `charming api list` to discover operations and `charming api describe OPERATION_ID` to inspect parameters and body fields. The generated catalog includes app shares, signed-in access, Template listing actions, and private runtime-issue handoffs.

```bash
charming api request list-app-shares --param appId=APP_ID
charming api request update-app-signed-in-access --param appId=APP_ID --body '{"signedInAccess":"viewer"}' --dry-run
charming api request get-widget-runtime-issue-handoff --param appId=APP_ID --param token=HANDOFF_TOKEN
```

A runtime-issue handoff requires your personal access token, app-management permission, and an unexpired handoff for the same user and app. A browser session cannot resolve it.

## Environment

- `CHARMING_TOKEN`: user-token override.
- `CHARMING_BASE_URL`: API origin override.
- `XDG_CONFIG_HOME`: config-directory override.

The CLI stores credentials in `$XDG_CONFIG_HOME/charming/config.json`, or `~/.config/charming/config.json`, with user-only permissions.

## Activity feeds

`charming api request get-app-activity-timeline --param appId=APP_ID --param limit=50` reads the app timeline using a user token with `app:manage` access. It returns `items`, `hasMore`, and `retention`; page backward with both `--param before=OLDEST_TS` and `--param beforeId=OLDEST_ID`. Optional `kinds` and `since` filters narrow the feed.

The separate `get-app-activity --param id=APP_ID` operation keeps the durable runtime-failure log and its `{ok,value:{items,retention}}` response.

## Development

The source of truth is [`packages/cli` in the Charming monorepo](https://github.com/tambo-ai/charming/tree/main/packages/cli). This public repository is a generated mirror. Source pull requests opened here cannot be merged because the next mirror run replaces the full tree.

```bash
git clone https://github.com/tambo-ai/charming.git
cd charming
bun install
bun run cli:gen
bun run --filter usecharming check
```

`openapi.json` is synced from the monorepo's committed OpenAPI contract. `src/generated/operations.ts` is generated from it with the pinned Hey API version. Do not edit either generated file in the public mirror. `UPSTREAM.json` records the source URL and contract digest.

## Agent skill

The portable skill lives at `skills/charming/SKILL.md`.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Report security issues as described in [SECURITY.md](./SECURITY.md).
