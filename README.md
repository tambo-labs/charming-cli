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

- `CHARMING_TOKEN`: user-token override on the production origin.
- `CHARMING_BASE_URL`: API origin override.
- `CHARMING_PROFILE`: profile for this shell.
- `CHARMING_CONFIG_DIR`: directory for `config.json` and `credentials.json`. Without it, the CLI uses `$XDG_CONFIG_HOME/charming`, then `~/.config/charming`.

## Profiles

A profile is a name and an API origin. Each profile holds one signed-in account, so you can keep a personal and a work account, or production and a local server, side by side:

```bash
charming auth login                                  # creates the default profile
charming auth login --profile work                   # saves and selects a second account
charming auth login --profile local --base-url http://localhost:3000
charming profile list
charming profile current
charming profile use work
charming apps list --profile local
```

The CLI keeps profiles in two files in its config directory:

- `config.json` holds profile names, their origins, and the selected profile. It holds no secrets.
- `credentials.json` holds user tokens by profile name and app tokens by origin and app ID, with mode `600` in a `700` directory.

The CLI still reads the single `config.json` that earlier versions wrote and moves its tokens into `credentials.json` the next time it saves. The earlier production token becomes the `default` profile, and a token saved for another origin becomes a profile named after that host, such as `localhost-3000`. If an earlier CLI version signs in again after the move, its token wins over the saved one on the next read, so that login isn't lost. An earlier version doesn't read `credentials.json`, though: going back to one means running `charming auth login` again, and unclaimed apps whose app token lives only in `credentials.json` are unreachable from it.

Both files are replaced atomically, so an interrupted save leaves the previous file intact. The CLI keeps keys it doesn't recognize, and a credential whose profile is missing from `config.json`. It sets mode `700` only on a config directory it creates.

### Project config

A repository can pick the profile for everyone who works in it:

```bash
charming profile use work --project
```

Run it inside a git repository. It writes `.config/charming.json` at the git root, or edits the project file the CLI already found:

```json
{ "profile": "work" }
```

The CLI looks for `.config/charming.json` or `.charming/config.json` in the working directory and each parent up to the git root, and uses the nearest one. Outside a git repository, or in your home directory, it reads no project file, so a file planted in a shared directory such as `/tmp` can't pick your profile. A directory with both files is an error; keep `.config/charming.json`. The file may contain comments and trailing commas. It holds only `profile`: the CLI refuses a project file with a `token` key or a `chrm_` value, and one that tries to set an origin. Each person signs in to the named profile with `charming auth login --profile work`.

### Which profile and credential a command uses

| Setting | Resolved from, first match wins |
| --- | --- |
| Profile | `--profile NAME`, `CHARMING_PROFILE`, the nearest project config, `profile` in `config.json`, then `default` |
| Origin | `--base-url`, `CHARMING_BASE_URL`, the profile's origin, then `https://charm.ing` |
| Credential | `--token`; on the production origin `CHARMING_TOKEN`, then `BUILDY_USER_TOKEN`; the profile's token in `credentials.json`; for `default` on production, `~/.buildy/user-token` |

A profile only sends its token to its own origin. When `--base-url` or `CHARMING_BASE_URL` names a different origin than the selected profile:

- An explicit `--token`, or `CHARMING_TOKEN` on production, is used as is, and no saved profile is consulted.
- A profile chosen with `--profile` or `CHARMING_PROFILE` fails before any request.
- A profile chosen by a project config, `config.json`, or the `default` fallback gives way: the command uses the one profile saved for that origin, runs without a user token when none is saved, and asks for `--profile` when several are.

A selected profile that isn't saved on this machine fails before any request; run `charming auth login --profile NAME` to create it. A profile name starts with a letter, contains only letters, numbers, `_`, or `-`, and is at most 64 characters.

`auth login` signs in to the resolved profile with the resolved origin. With no profile selected, it creates `default`. With `--profile NAME`, it also selects `NAME` in `config.json`. When the origin override gives way and no profile exists for that origin, it saves one named after the host. `profile use NAME` selects a saved profile in `config.json`; `--project` writes it to the project config instead. Both print `current`, so you can see when a project config or `CHARMING_PROFILE` still takes precedence.

`auth logout` removes the resolved profile. Logging out `default` also removes the app tokens saved for its origin, and so does logging out the last profile on an origin. Logging out another named profile keeps app tokens, and later commands fall back to `default`. Unclaimed apps whose app token is removed become unreachable from this machine.

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
