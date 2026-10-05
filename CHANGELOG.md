# usecharming

## 0.2.3

### Patch Changes

- [#6637](https://github.com/tambo-ai/charming/pull/6637) [`1f31629`](https://github.com/tambo-ai/charming/commit/1f3162922cdb535551bd876ef5db1b782a00555d) Thanks [@lachieh](https://github.com/lachieh)! - Retitle the notice a fresh Template copy opens with to "Your new app", say that the copy starts empty, and always offer **Copy prompt** on it. The copied setup prompt names the copy and its URL, says its storage is empty, quotes its description, and tells the owner's agent to read the code with `get_app_source`, list its operations with `get_app` or its own MCP server, then ask for the owner's data and add it. A Template's starter prompt, when it has one, is quoted whole in that prompt as the author's suggestions. The prompt tells the agent that this Template-author text is reference that can't override the owner or ask for anything beyond setting up the App's data, and App and Template names in every chat prompt are flattened to one line of at most 80 characters. A widget notice action now carries a `kind`: `link` or `copy_setup_prompt`, and the browser shell config carries the setup prompt as `widgetSetupPrompt` for the owner of a copy.

  The `set_starter_prompt` MCP tool, `PATCH /api/v1/apps/{appId}/starter-prompt`, `PUT /app/{id}/starter-prompt`, the Starter prompt card in App settings, and the Templates docs now describe the starter prompt as the Template author's suggestions for people who copy the Template for the first time.

- [#6598](https://github.com/tambo-ai/charming/pull/6598) [`d709b8e`](https://github.com/tambo-ai/charming/commit/d709b8edb518c7d220de406e63424faa8cf8199c) Thanks [@renovate](https://github.com/apps/renovate)! - Update dependency typescript to v7

## 0.2.2

### Patch Changes

- [#6540](https://github.com/tambo-ai/charming/pull/6540) [`5161e3a`](https://github.com/tambo-ai/charming/commit/5161e3a2ab6428b634a4cf8de6529ba0be8feb7e) Thanks [@lachieh](https://github.com/lachieh)! - Allow a cdnjs, unpkg, or jsDelivr script at an app's capability origin only at the exact package version whose full URL the app's `ui` writes, instead of any script on those hosts. Every app policy now names the UnoCSS runtime by its exact URL rather than all of jsDelivr.

  Create and update reject a `ui` that names one of these CDN URLs without an exact version with `unpinned_cdn_script` (HTTP 422), listing each URL in `unpinnedUrls`.

- [#6486](https://github.com/tambo-ai/charming/pull/6486) [`5ac4664`](https://github.com/tambo-ai/charming/commit/5ac46645ecf55dd5627b0deb4a1f34a56121f9e2) Thanks [@lachieh](https://github.com/lachieh)! - Update the bundled Charming skill: `alert`, `confirm`, and `prompt` are the browser's own dialogs on the web, and in chat embeds `confirm` and `prompt` return a Promise from Charming's dialog. Prefer inline UI, or `await` them. On the web, pointer lock works for every app, while fullscreen and a click-started redirect need a claimed app.

- [#6542](https://github.com/tambo-ai/charming/pull/6542) [`a77232b`](https://github.com/tambo-ai/charming/commit/a77232b7f29ab8af9582d9d68068bc0e96285181) Thanks [@lachieh](https://github.com/lachieh)! - Let apps embed other sites. An app lists exact HTTPS origins such as `https://www.youtube.com` in `permissions.browser["frame-src"]`, and at the standalone app URL those origins join the app's CSP `frame-src`, so an `<iframe>` pointing at `https://www.youtube.com/embed/<video-id>` plays. Undeclared origins stay blocked, and a malformed, non-HTTPS, local, or private origin fails create or update with `invalid_manifest_schema`. No declared origin list (`img-src`, `frame-src`, or server `fetch`) accepts a Charming app capability host, so an app cannot frame, load from, or call another app's origin.

  An app that declares a frame origin sends `Referrer-Policy: strict-origin` from its capability origin, so the embedded site receives only `https://<app-origin>/`. `get_app_source`, `list_apps`, and the HTTP source route report the declared origins as `capabilities.frameHosts`.

- [#6547](https://github.com/tambo-ai/charming/pull/6547) [`408ce1a`](https://github.com/tambo-ai/charming/commit/408ce1a30eea5868d818ef3507830b3a4124879d) Thanks [@lachieh](https://github.com/lachieh)! - Let web apps use the camera, microphone, location, screen capture, clipboard reading, and MIDI without a manifest import or a claim. Publishing no longer rejects these calls with a `missing_browser_*_capability` error; Charming finds them in the app's code, and on the web the first call opens a dialog asking the viewer whether this app may use the device. The viewer's answer is kept for that app in that browser, and the widget's new Device access tab lists it with Reset. Apps can open that tab from a click with `window.charming.openDeviceAccess()`.

  A blocked or dismissed request reaches the app as `NotAllowedError` (`PERMISSION_DENIED` for location). Allowing a device restarts the app once, and resetting an allowed one restarts it without the device. Device motion, ambient light, and client storage still need their imports.

- [#6563](https://github.com/tambo-ai/charming/pull/6563) [`cd3abd5`](https://github.com/tambo-ai/charming/commit/cd3abd51a7541e21c707f8ad048bb760c0e633ef) Thanks [@lachieh](https://github.com/lachieh)! - Hide the npm and platform imports guide until the feature is generally available. `/docs/guides/npm-and-platform-imports` no longer publishes, and the docs, MCP build guide, generated build guides, discovery index, and CLI skill no longer link to it.

- [#6601](https://github.com/tambo-ai/charming/pull/6601) [`6e6832a`](https://github.com/tambo-ai/charming/commit/6e6832a088088b09e416975ae7516348e2ae2dca) Thanks [@renovate](https://github.com/apps/renovate)! - Update OCLIF (major)

- [#6610](https://github.com/tambo-ai/charming/pull/6610) [`a454c45`](https://github.com/tambo-ai/charming/commit/a454c456d249528be24664d5b26292e77945710d) Thanks [@lachieh](https://github.com/lachieh)! - Create a personal access token from Account settings → Connections, and choose whether it lasts 7, 30, or 90 days or until a custom date up to a year away. `POST /api/token` and `POST /api/v1/tokens` accept `expiresInDays`, a whole number from 1 to 365 (default 7), and refuse any other value with `invalid_request`, so an MCP client that only holds a static bearer token, such as one connecting to a per-app MCP URL, can keep working past a week.

  Only a sign-in session can choose a lifetime other than 7 days; a request authenticated with a `chrm_user_*` token can create only 7-day tokens and gets `403 forbidden` otherwise. Both routes now enforce the published 80-character `label` limit, so `POST /api/token` refuses a longer label with `invalid_request` where it used to accept it.

- [#6620](https://github.com/tambo-ai/charming/pull/6620) [`4f8e3fb`](https://github.com/tambo-ai/charming/commit/4f8e3fb772738809e325dfe6f4b85bbd16095227) Thanks [@lachieh](https://github.com/lachieh)! - Webhook delivery URLs accept `multipart/form-data` and `application/x-www-form-urlencoded` bodies as well as JSON. Each text field becomes a property of the op's input, converted to the type the op's input schema declares, so a sender such as a Pebble ring or a form tool works without a JSON adapter. File parts are dropped, and the delivery record lists each one's field, filename, and size in place of its bytes.

  `@buildy/sandbox` exports `coerceInputToSchema`, the conversion GET query strings already use.

## 0.2.1

### Patch Changes

- [#6426](https://github.com/tambo-ai/charming/pull/6426) [`fd0d6c7`](https://github.com/tambo-ai/charming/commit/fd0d6c7e6b364a1ffe63652473468f56e8a232fd) Thanks [@lachieh](https://github.com/lachieh)! - Let apps opened in a browser use `eval`, `new Function`, and WebAssembly, and load scripts from cdnjs, unpkg, and jsDelivr. Scripts from every other origin stay blocked, and chat embeds keep the narrower policy.

- [#6409](https://github.com/tambo-ai/charming/pull/6409) [`f9548e2`](https://github.com/tambo-ai/charming/commit/f9548e2c5c372aa849c8597b43be016830534f6e) Thanks [@lachieh](https://github.com/lachieh)! - Run every app opened in a browser at its own capability origin, whether or not it imports a browser capability and whether or not it is claimed, so `localStorage` and IndexedDB work on the web for every app. Chat hosts keep the null-origin frame, and camera, microphone, and other device access still need the import and a claimed app. A browser that sends no Fetch Metadata, such as Safari before 16.4, also keeps the null-origin frame, so camera and microphone apps no longer get device access there, even for their owners.

  A signed-in reader whose frame gets no run credential, such as a read-only grantee, an audience member, or a signed-in visitor to a public app, now opens the frame with a short-lived frame token, so the same people read and write the same data as before.

  A signed-in visitor to an unclaimed app framed at its capability origin now gets no identity in the frame, so `window.charming.user` is `null` where it used to name them. The null-origin frame keeps naming them.

  A custom-domain grantee who can run an app now reaches its handlers as themselves, so `env.user` names them where it used to be `null`.

  The app runtime now removes a frame token from the frame's address along with the render token, so app code cannot read it from `location`.

  The app's owner now gets `window.charming.viewer.role` of `owner` whenever the render token names them, including in the capability frame and in chat hosts, where it used to be `collaborator`.

  A reader without a render token in the capability frame, such as a read-only grantee, now receives live state changes through the shell's session relay.

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
