# usecharming

## 0.5.1

### Patch Changes

- [#7242](https://github.com/tambo-ai/charming/pull/7242) [`c04e5f3`](https://github.com/tambo-ai/charming/commit/c04e5f39e24d6f84065271576e3ee83036d6b8de) Thanks [@michaelmagan](https://github.com/michaelmagan)! - Cap request bodies at 1 MiB on the routes that read them whole, and bound what an unauthorized Webhook sender writes.

  - A Webhook delivery (`POST /api/v1/hooks/{webhookId}`) or a call to an app operation (`/app/{id}/api/{operation}` with any method but `GET` and `HEAD`) with a body over 1 MiB is refused with 413 `payload_too_large` before the op or the app handler runs, whether or not the request declares a length. A body of exactly 1 MiB still runs.
  - A delivery with a missing or wrong secret still gets its 401, but the Webhook's delivery record keeps at most 10 of them a minute per sender address. The record keeps the first 256 characters of `User-Agent` and `Content-Type`.
  - The 300-a-minute per-address delivery limit and that 10-a-minute record budget count an IPv6 sender by its /64.

  Nothing already stored changes, and delivery rows written earlier keep their full headers. A sender or app that posts more than 1 MiB to one of these two routes now gets a 413 where it used to get an answer. Asset uploads (10 MiB) and the routes with their own caps are not affected.

## 0.5.0

### Minor Changes

- [#7228](https://github.com/tambo-ai/charming/pull/7228) [`6fc638d`](https://github.com/tambo-ai/charming/commit/6fc638dd06e4ceb755630ef20545ddc488bb23b3) Thanks [@michaelmagan](https://github.com/michaelmagan)! - Let an App's owner or team admin allow an invited person to invite others. Set `canInvite` on `POST` or `PATCH /api/v1/apps/{appId}/shares…`, or `can_invite` on the `share_app` MCP tool. That person can then invite at their own role or lower and revoke only the people they invited. They can't pass the ability on. Share listings now carry `canInvite` and `invitedBy`, and delegates outside their limits get the new error kinds `role_above_own`, `invite_delegation_owner_only`, and `not_your_invite`.

- [#7217](https://github.com/tambo-ai/charming/pull/7217) [`3985ab6`](https://github.com/tambo-ai/charming/commit/3985ab62a7de6601ae9dd95dd85c4d627dec80b8) Thanks [@michaelmagan](https://github.com/michaelmagan)! - Let team owners and admins require two-factor authentication under Team settings → Security or with `GET` and `PATCH /api/v1/teams/{teamId}/security`. Turning it on needs two-factor on your own account (`403 two_factor_required` otherwise). While it is on, a member without two-factor stays on the team but reaches none of its Apps, settings, or admin actions until they turn it on; they can still leave and answer invitations, and the team's member and invitation endpoints refuse them with `403 two_factor_required`.

  `GET /api/v1/teams` flags such a team with `blockedByTwoFactor` and leaves out its roster, and the People tab and `GET /api/v1/teams/{teamId}/people` show who has two-factor on, sortable with `twoFactor`. The CLI asks for `--yes` before `update-team-security`.

### Patch Changes

- [#7075](https://github.com/tambo-ai/charming/pull/7075) [`af2f03a`](https://github.com/tambo-ai/charming/commit/af2f03ab1e5955aa65464a81dd41ee069742256b) Thanks [@akhileshrangani4](https://github.com/akhileshrangani4)! - Let Apps call a person's Gmail and the other services in Charming's connector catalog, listed on the Connectors docs page. A route handler calls `env.connectors.call(service, tool, args)` with the service and tool written as strings, and Charming reads those calls when the App is saved to learn which tools it uses, so nothing goes in the manifest; a save whose call names a service or tool outside the catalog, or names either through a variable, is refused with `invalid_connector_call`. On the ESM contract an App declares the tools under `permissions.server.connectors` and imports `connectors` from `charming:connectors@1.0` instead. Each person connects a service once and approves each App in a Charming window that `charming.connect(service)` opens, and no token ever reaches the App, the browser, or the agent.

  Approval is by access level, per service: `read`, `write`, and `delete`, each independent of the others. A tool added at a level a person already approved runs without asking again; a tool at a new level refuses with `connector_not_granted` and `missingLevels` naming the levels to approve. Owners can share their own account with the people they share an App with, limited to the levels they pick. The grants route takes and returns approved levels in `levels`, and App connector settings carry the shared ones in `sharedLevels`.

  Connector calls count against the App owner's new monthly allowance (`connector_calls_per_month`: 500 on Free, 10,000 on Pro, 10,000 per seat on Business) and refuse past it with `connector_call_limit_exceeded`. Refusals carry the kinds `sign_in_required`, `connector_not_granted`, `connector_action_not_declared`, `connector_no_person`, `connector_reconnect_required`, `connector_unavailable`, `connector_rate_limited`, and `connector_cross_site`, which refuses a write or delete call when another site sent the signed-in person to the App. Connector calls need a signed-in Charming session or the agent's own sign-in: an App shown inside Claude or ChatGPT names the person only by its URL, and gets `connector_no_person`. **Account settings → Connectors** lists every service to connect, reconnect, or remove, with the Apps each one is approved for, and owners set sharing in **App settings → Connectors**. The account settings tab for agent connections is now labelled **Agents**.

- [#7238](https://github.com/tambo-ai/charming/pull/7238) [`b7771a8`](https://github.com/tambo-ai/charming/commit/b7771a841e0a1f03f884b93f01a74d9a8d1fcb66) Thanks [@lachieh](https://github.com/lachieh)! - Add per-person staff logins for the admin API. `chadmin login` starts a code at `POST /api/admin/login/start` and prints the bare `/pair` URL. A person on the environment's staff roster, with two-factor authentication on, types the code there and approves it from a browser session that signed in within the last 10 minutes; `/pair` never accepts a staff code from a link. chadmin then uses a 12-hour `chrm_staff_*` token that works only on `/api/admin/*`, listed in its owner's tokens for revocation; `chadmin logout` revokes it. Admin audit lines name the staff member and token. The shared `CHARMING_ADMIN_TOKEN` keeps working when no staff login is stored.

  `POST /api/pair/approve` answers 403 `staff_only`, `two_factor_required`, or `reauthentication_required` for a staff code it cannot approve.

- [#7208](https://github.com/tambo-ai/charming/pull/7208) [`77238e9`](https://github.com/tambo-ai/charming/commit/77238e9c2f85121e08ff743fd4bd7d4fb695637c) Thanks [@akhileshrangani4](https://github.com/akhileshrangani4)! - The `charming` skill now explains how an App calls a person's connected services, such as Gmail, with `env.connectors.call`, and when to offer the Connect button.

- [#7241](https://github.com/tambo-ai/charming/pull/7241) [`896af87`](https://github.com/tambo-ai/charming/commit/896af87e1a8534e356405c4764e7e341fd68605f) Thanks [@michaelmagan](https://github.com/michaelmagan)! - Cap what one account can create and list.

  - A signed-in account can create or copy 60 apps a minute, across `POST /app`, `POST /app/{id}/copy`, MCP `create_app` and `copy_app`, and a Template's Copy button. A caller with no account gets 10 a minute per address on `POST /app`. Past either, the call answers 429 `rate_limited` with `Retry-After` and creates nothing.
  - `styles` is capped at 256 KiB like `module` and `ui`, on every create and edit path (`styles_too_large`, 413). MCP `create_app` now enforces all three caps, and a `POST /app` or `PUT /app/{id}` body over 832 KiB is refused (`payload_too_large`, 413).
  - Template listing text is capped at 120 characters for the title, 300 for the summary, 20,000 for the content, 300 for each image alt text and caption, and 128 for an asset key, with at most 12 gallery images (`template_listing_too_large`, 413).

  Nothing already stored changes. An app whose source is already over a cap keeps running and can still change its other fields, and a Template listing already over a limit stays as it is until its owner saves that field again. An account can still hold any number of apps. An ESM styles breach now reports `styles_too_large` instead of `payload_too_large`.

- [#7232](https://github.com/tambo-ai/charming/pull/7232) [`b26a277`](https://github.com/tambo-ai/charming/commit/b26a277478c590a05cf73e36b7cc53509ae2e503) Thanks [@michaelmagan](https://github.com/michaelmagan)! - Revalidate the caller's credential on every path that mints a paired token: `POST /api/pair/approve`, `POST /app/{id}/claim`, the cookie auto-claim, and the poll that finishes an approval a claim left undone. A revoked credential mints nothing, and `POST /api/pair/approve` answers `401 unauthorized`. A pairing approved or claimed with a bearer token or personal access token now gets a 7-day token, and one approved in the browser keeps 30 days. A claimed app whose pairing was still unapproved at this release stays pending until a person approves its code at `/pair`.

  Sign the custom-domain grant code, grantee cookie, and login state token under separate purposes, so one never verifies as another. Cookies and tokens issued before this release stop verifying, so a visitor signed in on a custom domain signs in again once.

## 0.4.2

### Patch Changes

- [#7154](https://github.com/tambo-ai/charming/pull/7154) [`c5cdf52`](https://github.com/tambo-ai/charming/commit/c5cdf525d7434b5b39445c07f362aafbadc7febc) Thanks [@renovate](https://github.com/apps/renovate)! - fix(deps): update dependency @oclif/core to v5.1.9

## 0.4.1

### Patch Changes

- [#6987](https://github.com/tambo-ai/charming/pull/6987) [`da89761`](https://github.com/tambo-ai/charming/commit/da89761dc8052d86b6292848efcf0e0e5d9cb0af) Thanks [@renovate](https://github.com/apps/renovate)! - Update dependency @oclif/core to v5.1.8

## 0.4.0

### Minor Changes

- [#6956](https://github.com/tambo-ai/charming/pull/6956) [`88494e4`](https://github.com/tambo-ai/charming/commit/88494e4de72718759412578ff1b93bd12a24fc5d) Thanks [@lachieh](https://github.com/lachieh)! - Add `charming dev [directory]`, which serves an app at a local URL without touching the live app. The module runs against in-memory storage with the server's validation and error kinds, the ui renders in the production app document and runtime, and server `fetch` reaches only the origins the manifest declares. `--state`, `--save-state`, and `--user` seed storage, save it to a file, and set the signed-in user.

## 0.3.0

### Minor Changes

- [#6823](https://github.com/tambo-ai/charming/pull/6823) [`ad7d986`](https://github.com/tambo-ai/charming/commit/ad7d9863cdca9b619beb35e6cd94bb892650943b) Thanks [@lachieh](https://github.com/lachieh)! - Add `copy_app` to the MCP server and `POST /app/{id}/copy` to the HTTP API, so an agent can make the signed-in user a private copy of an app they can edit, or of a Template they may copy, in one call without sending its source. The copy takes the next free manifest id, or a `manifest_id` the caller does not hold (`manifest_id_conflict`, naming the app that holds it, otherwise), and never carries sharing, Template state, tokens, secrets, Routines, Webhooks, or version history. `include_data: true` also copies up to 24 MiB of stored data and assets in the same transaction that creates the copy (`copy_data_too_large` beyond that), for the owner of a personally owned source (`copy_data_forbidden` for anyone else, and for any team app), within the per-app caps and the caller's storage allowance (`storage_limit_exceeded`). `secretsNotCopied` names the secrets to set on the copy. An `idempotency_key` makes a retry return the first copy instead of making another; the same key with a different source, `include_data`, or `manifest_id` answers `idempotency_conflict`.

  `search_templates` results now carry the Template's `id`, which `copy_app` takes as `app_id`. Only POST answers at `/app/<id>/copy`; a GET there still opens the App at that route. `@buildy/sandbox` exports `MANIFEST_ID_RE_SOURCE`, and the CLI catalog gains the `copy-app` operation.

### Patch Changes

- [#6913](https://github.com/tambo-ai/charming/pull/6913) [`0928a8d`](https://github.com/tambo-ai/charming/commit/0928a8d158a3fae65799111a8016102a477f59f3) Thanks [@lachieh](https://github.com/lachieh)! - Add the `2026-10-16` App contract, `$schema: "https://charm.ing/schema/app-manifest/2026-10-16.json"`, and make it the contract new Apps get. It takes the `2026-07-31` source shape and adds an optional per-route `callers` field (`'members'`, `'signed-in'`, or `'anyone'`, default `'members'`), which Charming validates and stores but does not enforce yet. A route that declares `'signed-in'` or `'anyone'` together with `public: false` is refused.

  Apps on `2026-07-31` keep loading unchanged, and that contract ignores a `callers` key. A canonical App moves to `2026-10-16` by saving source that declares its URL, and a legacy migration targets it. Source that omits `$schema` is now stamped with `2026-10-16`, `GET /schema/app-manifest/2026-10-16.json` serves the new schema, and source responses may return either dated URL as `$schema`. `next` routes accept `callers` too.

- [#6874](https://github.com/tambo-ai/charming/pull/6874) [`dbb57e9`](https://github.com/tambo-ai/charming/commit/dbb57e941bb2c0b823b2294e23809944de3f46ef) Thanks [@lachieh](https://github.com/lachieh)! - Show the Pro check and affiliation logo beside names in the widget: the viewer's own name in the footer and account menu, each person in the Access tab, and the app owner's label, which carries the paid-team check for a paying team. `GET /api/v1/apps/{appId}/shares` now returns optional `grantee.badges`, and the browser-shell config carries optional `widgetViewer.badges` and `widgetOwner`; `window.charming.user` does not change.

- [#6838](https://github.com/tambo-ai/charming/pull/6838) [`4ab105b`](https://github.com/tambo-ai/charming/commit/4ab105bd8a0e90134cf2e5b7ba2958b8ea591654) Thanks [@renovate](https://github.com/apps/renovate)! - Update dependency @oclif/core to v5.1.3

- [#6884](https://github.com/tambo-ai/charming/pull/6884) [`b57f9f1`](https://github.com/tambo-ai/charming/commit/b57f9f1729ac27ae05fd5d5f4d727dc0c94bfb9c) Thanks [@renovate](https://github.com/apps/renovate)! - Update OCLIF

- [#6824](https://github.com/tambo-ai/charming/pull/6824) [`0694602`](https://github.com/tambo-ai/charming/commit/06946027b0936dd6417341ec6439cb9f85d7a6c0) Thanks [@lachieh](https://github.com/lachieh)! - Rename the unreleased ESM app contract from `2026-09-05` to the rolling marker `next`. Flagged authors declare `$schema: 'https://charm.ing/schema/app-manifest/next.json'`, and an App saved under the old URL loads again only after its source is saved with the new one.

  MCP now describes the ESM contract only to callers with the authoring flag or with builds still to poll or cancel. Everyone else no longer sees `get_app_build`, `cancel_app_build`, `idempotency_key`, or ESM wording in tool descriptions, the app guide, the server card, or the agent card.

  `@buildy/sandbox` exports the contract as `@buildy/sandbox/contracts/next` and no longer exports the unused `2026-08-27` draft. `@buildy/content` moves the two build tools into `ESM_MCP_TOOL_CARDS`, outside the public `MCP_TOOL_CARDS` inventory.

## 0.2.5

### Patch Changes

- [#6720](https://github.com/tambo-ai/charming/pull/6720) [`f265c13`](https://github.com/tambo-ai/charming/commit/f265c13dd6addd29fef71e25094a907bb95d941c) Thanks [@akhileshrangani4](https://github.com/akhileshrangani4)! - Say what happens when the user claims an app more than 10 minutes after a no-login `charming apps create`: the claim revokes the CLI's app credential and pairs nothing, so run `charming auth login` to keep working on the app.

## 0.2.4

### Patch Changes

- [#6700](https://github.com/tambo-ai/charming/pull/6700) [`b7297e4`](https://github.com/tambo-ai/charming/commit/b7297e44b76261f6d04b18b83494f51d25826e89) Thanks [@akhileshrangani4](https://github.com/akhileshrangani4)! - Collect the pairing from a no-login `charming apps create`. The CLI now saves the pairing privately next to the app credential. Once the user approves the printed code, or claims the app, within 10 minutes, the next command on that app or `charming auth status` saves their account token and claims the app with it. Before this, the approval minted a token the CLI never collected, and a later claim cut the CLI off from the app it created.

  A CLI signed in with `charming auth login` now also claims an app it created without a login the next time a command uses it. If a claim fails, the command runs on the app's own credential, writes an `app_claim_failed` event to stderr, and the next command retries.

- [#6707](https://github.com/tambo-ai/charming/pull/6707) [`10e1e5f`](https://github.com/tambo-ai/charming/commit/10e1e5f2ece8a19d2c6feecd9ae46cd637789237) Thanks [@akhileshrangani4](https://github.com/akhileshrangani4)! - Stop losing CLI credentials when commands run in parallel. Every write to `credentials.json` now holds a lock file, so two commands can no longer overwrite each other's saved tokens.

  An app token whose app was deleted, expired, or claimed by someone else is now dropped, so the CLI stops printing `app_claim_failed` for it on every command. A no-login `charming apps create` also picks up an approved pairing first, so a second create goes into the user's account instead of making another unclaimed app.

- [#6691](https://github.com/tambo-ai/charming/pull/6691) [`e821ebf`](https://github.com/tambo-ai/charming/commit/e821ebfb170331e089d3dfacc351f16fc853e807) Thanks [@akhileshrangani4](https://github.com/akhileshrangani4)! - Add a Delete app card to each app's settings page, so an owner or team admin can permanently delete an app without an agent. The dialog asks for the app's slug, then deletes the app with its data and secrets through the new `DELETE /api/v1/apps/{appId}` route.

  `DELETE /app/{id}?purge=storage` now deletes the app's secrets along with its key-value data, matching MCP `delete_app` with `purge_storage: true`. If the purge fails on any delete path, the app stays in place so a retry can finish. The `delete_app` and `DELETE /app/{id}` descriptions now say what a delete without the purge leaves: the secrets are kept, and an hourly cleanup clears the key-value data.

- [#6699](https://github.com/tambo-ai/charming/pull/6699) [`c7e7898`](https://github.com/tambo-ai/charming/commit/c7e78986764d793966aabe65e608bd09c056d0fe) Thanks [@akhileshrangani4](https://github.com/akhileshrangani4)! - Approving the pairing code of an app created with `pair: true` at `/pair` now claims that app for the approver, the same as claiming the app approves its pairing. Before, approval minted the agent's token but left the app unclaimed, so it missed the user's Account Home and expired. `/pair` names the app before you approve. A claim the user cannot take leaves the app as it is, and the approval still goes through.

  No claim path hands you a copy of a template you own: `POST /app/:id/claim` refuses it with `409 duplicate_remix` pointing at the template, as it already did for a second copy. Approving a code and looking one up at `/pair?code=` now share one budget: 20 a minute per account and 60 a minute per address. Past it, `/pair` says "Too many codes tried." A code bound to an app another user owns is refused with `409 already_approved`. While too many codes are missing across all callers, a code bound to an unclaimed app answers a retryable `429` instead of being approved without its app. `POST /api/pair/approve` now returns `{ ok, claimed }`.

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
