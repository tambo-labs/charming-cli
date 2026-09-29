# usecharming

## 0.2.0

### Minor Changes

- [#6358](https://github.com/tambo-ai/charming/pull/6358) [`08d2a5b`](https://github.com/tambo-ai/charming/commit/08d2a5b2426c8e0e3f79e5ae012041a470966724) Thanks [@michaelmagan](https://github.com/michaelmagan)! - Add named profiles to the Charming CLI. A profile is a name and an origin: sign in with `charming auth login --profile work`, switch with `charming profile use work`, check the active one with `charming profile current`, or pick one per command with `--profile` or `CHARMING_PROFILE`. A repository can select a profile for everyone who works in it with `charming profile use work --project`, which writes `.config/charming.json` holding only the profile name.

  Tokens now live in `credentials.json` (mode 600) next to `config.json` in `~/.config/charming`, or in `CHARMING_CONFIG_DIR` when set. The CLI still reads the old single-file layout and moves its tokens into `credentials.json` the next time it saves. A token saved for another origin becomes a profile named after that host, such as `localhost-3000`.

- [#6403](https://github.com/tambo-ai/charming/pull/6403) [`dd1de25`](https://github.com/tambo-ai/charming/commit/dd1de25992d1f72e1f3da008f88697b2034d123f) Thanks [@lachieh](https://github.com/lachieh)! - Release Apps as MCP servers and Webhooks to every owner, with no enrollment. Any App with a friendly address answers as its own MCP server at `mcp.charm.ing/<owner>/<app-name>`, including a team-owned App at the team's handle, and any owner can give an op a delivery URL with `create_webhook` or `POST /api/v1/apps/{appId}/webhooks`.

  The MCP host no longer refuses with `403 experiment_disabled`, and Webhook creation no longer refuses with `feature_disabled`. Webhooks now appear in the OpenAPI spec, the MCP tool inventory, the agent card, the `usecharming` CLI, and the docs, with their caps in the Plans table. The billing page's plan cards and the pricing page list Webhooks per app and Webhooks in total beside the Routines caps, and the Plans table adds how much of each delivery's request and response body the delivery record keeps: 16 KB on Free, 64 KB on Pro and Business. `list_routines` and `GET /api/v1/routines` now return the Routines on every App the caller can edit, including team-owned Apps and Apps shared with them as a collaborator, as the Webhooks lists do.

### Patch Changes

- [#6352](https://github.com/tambo-ai/charming/pull/6352) [`6fd32fc`](https://github.com/tambo-ai/charming/commit/6fd32fcf6e73c8c70c0a075655db280259c7b04d) Thanks [@michaelmagan](https://github.com/michaelmagan)! - `charming api request call-app-operation` now sends an app operation with its declared method and path, like `charming apps call`. Both commands require `--yes` for a `DELETE` operation or one the app marks destructive, and a `GET` dry-run preview redacts credential-named query values.

- [#6437](https://github.com/tambo-ai/charming/pull/6437) [`d5baf69`](https://github.com/tambo-ai/charming/commit/d5baf697a36970d85695f0d0a45542c2b0a9399f) Thanks [@lachieh](https://github.com/lachieh)! - `charming apps call` now reads the app's descriptor and sends each operation with the method its route declares, so `GET` operations such as the CRUD template's `list` work. A `GET` operation receives `--input` as query parameters; an object, `null`, or empty-array value fails in the CLI because a query parameter cannot carry it. An operation name the app doesn't declare fails before the call and names the declared operations. Apps without routes still receive a `POST` to `/api/<op>`. `--dry-run` now needs a credential, reads the descriptor, and reports the resolved method and path.

- [#6439](https://github.com/tambo-ai/charming/pull/6439) [`f804203`](https://github.com/tambo-ai/charming/commit/f80420303e5d8046e6d6b5b7af457a8a96f62cc1) Thanks [@lachieh](https://github.com/lachieh)! - The Routines and Webhooks cards on an app's settings page now apply the app owner's per-app limit, so a team app follows the team's plan rather than the viewer's own. The `create_routine` tool and the Routine and Webhook create routes now say their caps come from the app owner's plan, and that `limits` on the list routes reports the caller's own plan, so it matches only their personal apps.

- [#6353](https://github.com/tambo-ai/charming/pull/6353) [`3db3b82`](https://github.com/tambo-ai/charming/commit/3db3b825c4302c367a57c8fc20e215b6c2f9520a) Thanks [@michaelmagan](https://github.com/michaelmagan)! - Expose the existing app activity timeline as `get-app-activity-timeline` in the public API catalog and CLI, including keyset pagination. Keep `get-app-activity` as the separate runtime-failure log and clarify that timeline access accepts a personal access token or session cookie with app-management permission.

- [#6350](https://github.com/tambo-ai/charming/pull/6350) [`c4cc1c4`](https://github.com/tambo-ai/charming/commit/c4cc1c493a76ed3290ae277a5c55948703f9bc98) Thanks [@michaelmagan](https://github.com/michaelmagan)! - Expose existing app sharing, signed-in access, Template listing, and private runtime-issue handoff operations in the public OpenAPI contract and generated CLI. Correct authentication descriptions to distinguish personal tokens and browser sessions, including the handoff's personal-token requirement.

  Require `--yes` for CLI share revocations and declines, which delete access grants. Use `--dry-run` to preview them without changing access.

- [#6351](https://github.com/tambo-ai/charming/pull/6351) [`6702f55`](https://github.com/tambo-ai/charming/commit/6702f559ad2820a35c8c18c1f8db97dc7e2b472d) Thanks [@michaelmagan](https://github.com/michaelmagan)! - Expose existing team and App transfer operations in the public API contract and CLI. Distinguish personal-token operations from session-cookie requirements, and require explicit CLI confirmation for transfers, invitation declines, direct member additions, and team app default changes. A direct member addition can grant the owner role, and a default change can make public access the default for later Apps. The SDK sends supplied personal tokens only as bearer credentials and preserves explicit session cookies.

  For operations that accept only a session cookie, the CLI no longer sends a stored Bearer token. It refuses `--token`, and without a `Cookie` header it fails before the request with the recovery steps instead of an unauthorized error. The server now checks the owner-grant rule against the session that makes the role change, not against a Bearer token sent with it.

- [#6357](https://github.com/tambo-ai/charming/pull/6357) [`5eaa0d2`](https://github.com/tambo-ai/charming/commit/5eaa0d2afd44646e2c4ebf1378d0c45aca9afe91) Thanks [@michaelmagan](https://github.com/michaelmagan)! - Return each route’s established missing-app response for malformed app IDs across app API, source, description, mutation, asset, and secret routes. Guide CLI app commands to the ID from `charming apps list` before any request for a non-UUID value.

- [#6385](https://github.com/tambo-ai/charming/pull/6385) [`b0e7481`](https://github.com/tambo-ai/charming/commit/b0e7481dba3ec1c8b925c70609b3342b0a7b38b2) Thanks [@lachieh](https://github.com/lachieh)! - Let the widget's Access tab set who can open an app: "Anyone with the link" is a No access / Can view / Can edit picker, and each person the app is shared with gets a No access / Can view / Can edit / Can build picker, avatar, and invited marker. People who are not signed in see one branded Charming panel, with Get started free and Log in, in place of the Overview and Feedback tabs.

  `GET /api/v1/apps/{appId}/shares` now returns an optional `handle` on account grantees, which names their avatar at `/<handle>.png`. `BrowserShell` takes `browserShellClient` (an inline bundle or a module `src`) in place of `browserShellBundle`, and no longer draws a "View only" label. `Select` gains an `sm` size, and `Button` trims the padding beside a first or last child marked `data-icon`.

  The widget's `roleLabel` uses the same words: `Can build` for collaborators, `Can edit` for end users, and `Can view` for viewers, replacing `Can edit`, `Can use`, and `View only`. `Owner` and `Public viewer` are unchanged.

## 0.1.3

### Patch Changes

- [#6243](https://github.com/tambo-ai/charming/pull/6243) [`eea25dc`](https://github.com/tambo-ai/charming/commit/eea25dc90c0a1810d3679f2d5245e984946a67a5) Thanks [@akhileshrangani4](https://github.com/akhileshrangani4)! - `POST /api/v1/teams` now refuses with `403 plan_required` (`feature: "teams"`) unless the caller's plan includes teams. Teams come with the Business plan and are set up with Charming through the operator API. The plan refusal's `feature` field gains `teams`.

## 0.1.2

### Patch Changes

- [#6201](https://github.com/tambo-ai/charming/pull/6201) [`8d0391e`](https://github.com/tambo-ai/charming/commit/8d0391ef5b691e3a39318bfc3b267304e57bdb97) Thanks [@akhileshrangani4](https://github.com/akhileshrangani4)! - Redact a `chrm_render_v2.<payload>.<sig>` token whole in command output. The scrubber's trailing character class excluded the dot, so a dotted render envelope lost its prefix and kept its signed payload and signature in anything the CLI printed.
