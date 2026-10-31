---
name: charming
description: Build, inspect, update, and call hosted personal apps with the Charming CLI. Covers the app contract (manifest, capabilities, env.storage, routes, window.charming.api), the sandbox rules, and the CLI workflow. Use when a user wants to create or manage an interactive personal app hosted by Charming.
license: MIT
compatibility: Requires the charming CLI, Node.js 22 or newer, and network access to charm.ing.
metadata:
  openclaw:
    requires:
      bins:
        - charming
    install:
      - kind: node
        package: usecharming
        bins:
          - charming
---

# Charming CLI

Charming is a hosting platform for personal apps you and your agent build, update, and use together. Learn more at [usecharming.com](https://usecharming.com). Install: `npm install -g usecharming@0.1.1` (check [npm](https://www.npmjs.com/package/usecharming) for the latest version).

Charming hosts small single-purpose personal apps. You write two files, push them with `charming`, and the user gets a real URL with real storage that any agent — including this one, later — can keep editing.

An app is a directory:

- `module.js` — required. The backend: a `manifest` and a `routes` array.
- `ui.js` — optional. One JavaScript program that fills `#app`.
- `styles.css` — optional. Overrides only.

Do not free-hand the skeleton. Copy `templates/crud`, then change the data model.

## Start

1. `charming auth status`. If `"authenticated": false`, run `charming auth login --no-open` and give the user the approval URL and code.
2. Copy the CRUD template into a working directory: `cp -r "$(npm root -g)/usecharming/skills/charming/templates/crud" ./my-app` Change `manifest.id`, `manifest.meta.name`, the storage key, and the `window.charming.api("<id>")` argument in `ui.js` to match.
3. `charming apps create ./my-app --description "<one line>" --dry-run`
4. `charming apps create ./my-app --description "<one line>" --yes`
5. Smoke-test the backend before you claim it works: `charming apps call <app-id> list --input '{}'`
6. Return the `url` from the JSON result.

For `<app-id>`, use the UUID returned by `apps create` or the `id` field from `apps list`. The app name and `manifest.id` are not lookup keys for this command.

`apps call` reads the app's descriptor, then sends the operation with the method its route declares. A `GET` operation receives `--input` as query parameters, so every value must be a string, number, boolean, or array of those; other methods receive it as a JSON body. An operation name the app doesn't declare fails before the call and lists the declared ones. `--dry-run` prints the resolved method, path, and body, with credential-named `GET` query values shown as `[redacted]`. `charming api request call-app-operation` resolves the operation the same way. A `DELETE` operation, or one the app marks destructive, requires `--yes`; ask the user before passing it.

`--yes` is required on a signed-in create because a create whose `manifest.id` already exists **replaces that app in place**. Ask the user before running it, and keep `manifest.id` stable and unique per app.

Without a saved token, `charming apps create` still works: it stores an app-scoped credential locally, so later `update` and `call` on that app work from the same machine without `charming auth login`. Show the user `pairing.user_code` and `pairing.verification_url` from its output. If they approve the code within 10 minutes, the next command on that app or `charming auth status` saves their account token and claims the app for them. A claim after those 10 minutes revokes the app credential and pairs nothing; run `charming auth login` to keep working on the app. If a claim fails, the CLI writes an `app_claim_failed` event to stderr, uses the app's own credential, and retries the claim on the next command.

## Iterate

The CLI has no partial-edit mode. The loop is export, edit, push:

```
charming apps source <app-id> --out ./my-app   # writes module.js / ui.js / styles.css
# edit the files
charming apps update <app-id> ./my-app --dry-run
charming apps update <app-id> ./my-app
```

`apps update` reads the current source, matches its ETag, and fails loudly on a conflicting concurrent write instead of clobbering it — there's no revision number to track. A field missing locally is left as-is on the server: a directory with no `ui.js` updates the module and keeps the deployed UI.

`charming dev` runs the app's module in your own Node process, with your file system and network access; it is not a sandbox. Run it only on source you or the user wrote, and ask the user before running it on source someone else last edited. With that settled, run the app locally before pushing with `charming dev ./my-app --port 0`. It prints `{"ok": true, "url": "...", "appId": "...", "panelUrl": "..."}` and serves the app without touching the live one: the module runs against in-memory storage with the server's validation and error kinds, and the ui renders in the production app document. Open the URL in a browser to check the ui, or call operations at `<url>/app/<appId>/api/<op>`; `panelUrl` lists every operation with a Run button and the live call log, and `--run-op <op>` runs an operation once at startup the way a Routine does, with no signed-in user; only an operation the App does not declare stops it, with `operation_not_found`. Saving a file reloads the app and every open page, and calling an operation picks up edits too. The watcher ignores hidden files, anything under `node_modules`, and the `--state` and `--save-state` files, and in an App saved before packages it watches only the top level of each source directory. When it cannot watch a directory, it logs `Could not watch <directory> for changes (<reason>); reload the page to pick up edits.` and keeps serving: edits there show on the next page load, because each request re-reads the source. An operation that runs past production's 30-second limit is answered with `timeout` but keeps running in the background, and a reload doesn't wait for it. Files in `assets/` beside the source are served as the App's assets at `<url>/app/<appId>/assets/<name>`, read once at startup. They stay local: upload each one to Charming with `upload_asset` or `POST /app/<id>/assets`, a file Charming would refuse stops the command with `invalid_asset`, and in a package app keep `.js`, `.mjs`, and `.json` files out of `assets/`, because the package reads them as source and Charming refuses a file nothing imports. Seed storage with `--state state.json`, keep it with `--save-state state.json`, and set the signed-in user with `--user user.json`. Check what a visitor can do with `--as viewer`, signed out unless you also pass `--user`; `--as editor` (the `end-user` share role) and `--as builder` (`collaborator`) test the other share roles; pass `--user` with them, since on Charming those shares always belong to a signed-in account. Answer outbound calls with `--fetch fixtures.json` (keys `"[METHOD ]<origin><path>"`, values `{status, headers, body | json}`); a request with no fixture still reaches the live network, under the same allowlist, and a file that is not a JSON object of such fixtures stops the command with `invalid_fetch_fixtures`. Let the app reach an origin it doesn't declare yet with `--fetch-allow https://api.example.com`; the command warns that Charming refuses that origin until the app declares it, and anything other than an HTTPS origin with no path fails with `invalid_fetch_allow`. Give a sealed fetch its secrets with `--secret NAME` (read from the environment) or `--secret NAME=value`; a name outside `[A-Z][A-Z0-9_]*`, an empty value after `=`, or a `NAME` with no value in the environment fails with `invalid_secret`. Locally the app's code runs in the CLI process, so it can read every value you pass, unlike on Charming; prefer `--secret NAME`, because `NAME=value` shows up in your shell history and in the process list. Without `--state`, an existing `--save-state` file seeds storage, so state carries over between sessions; pass both and the first write replaces that file, so drop `--state` to resume. To work on a live app, `charming dev <app-id> --out ./my-app` writes its source there and runs it; an existing directory is run as it is, never pulled over. Add `--pull-data <op>` to seed storage from a read-only GET operation that returns an object of storage keys to values; the data lands in `.charming-dev/state.json`, which git and `--files` saves ignore. `--pull-data` cannot be combined with `--state` or `--save-state`, and it listens only on a loopback `--host`; either combination, a non-loopback `--host`, an empty `--pull-data`, an `--out` that is not a directory, or a pull flag without an app ID fails with `invalid_arguments`. So does an operation the app does not declare as a read-only GET: pick another operation rather than retrying. A result that is not an object of storage keys to values, or a symlinked `.charming-dev` or `.charming-dev/state.json`, fails with `invalid_state` before anything is written; name an operation that returns storage in that shape, or remove the symlink. A later run without `--pull-data` never reads `.charming-dev/state.json`: storage starts empty, or from `--state`, so pass `--pull-data` again to seed it from the live app. Pulled data can belong to real users, so ask the user before pulling it and delete `.charming-dev/` when done. Stop it with Ctrl+C. `charming dev` runs package apps (a directory with `package.json`), which it builds with npm and esbuild the way a save does, so it needs `node` and `npm` on PATH and registry access; without them it fails with `build_tools_unavailable`. It also runs apps saved before packages whose module declares a dated manifest `$schema`.

Before every push of source you trust, run `charming dev ./my-app --check` (add `--click <selector>` for each interaction worth exercising). It renders the app headless on a free loopback port, prints a JSON report, and exits 9 when the page threw, rendered nothing, or a click failed. The report's fields: `ok` is `false` when `errors` is non-empty, `render.empty` is `true`, or a click failed; `render` is `{ms, empty}`, how long until `#app` had an element in it and whether it never did within 5 seconds; `errors[]` is `{source, message}`, where `source` is `page` (thrown, rejected, or `console.error` in the page), `runtime` (a failure the runtime reported), `operation` (an operation that failed or broke its output schema, or a request still running more than 5 seconds after it started when the check ended), or `host` (thrown in the CLI process by the app's server code, the local server, or the headless browser); `clicks[]` is `{selector, ok, message?}`, one per `--click`, failing a selector that matches nothing or is not valid CSS; `findings[]` is `{rule, path, line?, message}`, embed-breakers that do not affect `ok`. A `--run-op` that fails at startup counts as an error in the report. The ui runs unsandboxed in your Node process, not a browser, so it can read your files, tokens, and network, and `WebSocket` is not stubbed. It refuses `--pull-data`, and a `--state` or `--save-state` file anywhere inside a `.charming-dev/` directory or linked to the app's pulled state, with `invalid_arguments`, but not a copy of that file, and the ui can still read `.charming-dev/state.json` from disk: delete `.charming-dev/` before `--check` when it holds real user data. Fix every `errors` entry and every `findings` entry (dialogs, `target="_blank"`, raw `fetch`, undeclared storage or image origins, old brand names), then push with `charming apps update <id> --files ./my-app`. The loop is: edit, `charming dev --check`, `charming apps update`.

Other commands: `charming apps list`, `charming apps describe <app-id>` (the public descriptor — ops and input schemas), `charming apps rename <app-id> <name>`, `charming apps delete <app-id> --yes`.

Run mutations with `--dry-run` first. Signed-in creates, deletions, share revocations and declines, and the team actions listed under the platform API require `--yes`; pass it only after the user approves that action.

Read JSON results from stdout. Login instructions and JSON errors use stderr. Branch on `error.kind`. Follow `error.recovery` when present. Never print tokens or `device_code` values. Show `user_code` only during login.

A profile is a name and an origin, with its token saved in the user's `credentials.json`. Run `charming profile current` to see which profile a command in this directory uses and why: `--profile`, `CHARMING_PROFILE`, the nearest `.config/charming.json` or `.charming/config.json` up to the git root, the user's selected profile, or `default`. If it names a profile that isn't saved, commands fail before any request; ask the user to run `charming auth login --profile NAME`. Never write a token into a project file; it holds only `{"profile": "NAME"}`, and the CLI refuses one with a credential. `charming profile use NAME --project` writes that file.

An explicit `--token` or production `CHARMING_TOKEN` overrides a saved profile. A profile never sends its token to another origin: `--profile work --base-url URL` fails when `work` is saved for a different origin, and an unforced `--base-url` uses the one profile saved for that origin. Logging out `default`, or the last profile on an origin, also removes that origin's app credentials, so unclaimed apps that relied on them become unreachable. Logging out another named profile keeps them.

## Apps as packages

The workflow and template below use the existing contract. A signed-in author can instead send an App as a package: `charming apps create --files <dir>` and `charming apps update <id> --files <dir>` send a directory holding package.json, server.js, and the files they import. `charming apps source <id> --out <dir>` writes a package App's files into a directory to edit; it refuses a directory holding a package file the App does not have, so use an empty one or the one it wrote last. Add `--migrate-contract` to `apps update --files` to move an App on the existing contract onto the package contract. Run each with `--dry-run` first. The generated `charming api request` commands reach the same endpoints for anything the flags do not cover: inspect `create-app` or `update-app` with `charming api describe`, and pass the JSON body with `--body @build.json`, `Idempotency-Key` with `--header`, and the desired-source `If-Match` for an existing destination.

HTTP 202 means accepted. `charming builds wait <build-id>` waits for the build and prints it once it publishes; add `--wait` to `apps create --files` or `apps update --files` to do both in one command. Any other final state (`failed`, `superseded`, `canceled`, `expired`) exits with code 6 and prints the build on stderr. Do not write a polling loop. Use `cancel-app-build --param buildId=<id>` to cancel. A server that predates package Apps refuses `--files` up front with "does not accept package Apps yet". Keep the original body, revision, and key for an exact retry. `apps create --files` and `apps update --files` supply the request key themselves.

## History

Every save makes a revision, and History keeps the earlier ones within the plan's window. Use it to look back or roll back:

```
charming apps history list <app-id>                      # newest first; page with --before <nextBefore>
charming apps history get <app-id> <revision> --out ./old  # the revision's source
charming apps history restore <app-id> <revision> --dry-run
charming apps history restore <app-id> <revision> --yes --wait
```

`restore` saves the chosen revision as a new newest revision and keeps the one it replaces, so ask the user before passing `--yes`. `restore` replaces whatever is newest when it runs, not the revision you saw in `list`: list again before `--yes` if time has passed. A `revision_mismatch` error means the App changed in the instant between that check and the save; run it again. A `restorable: false` revision cannot be restored, and asking for one fails with `version_not_restorable`; a revision past the plan's window fails with `version_limit_exceeded`. A package revision starts a build; `--wait` follows it.

## The module

```js
export const manifest = {
  $schema: 'https://charm.ing/schema/app-manifest/2026-10-16.json',
  id: 'water-log', // stable, unique, never changes
  meta: { name: 'Water Log', icon: { emoji: '💧', bg: '#0ea5e9' } },
  capabilities: { imports: ['charming:storage/kv@1.0'] },
};

export const routes = [
  {
    op: 'list',
    method: 'GET',
    annotations: { readOnlyHint: true },
    handler: async (_input, { env }) => (await env.storage.get('items_v1')) ?? [],
  },
];
```

- `manifest` is parsed statically. Keep it a plain literal — no computed values.
- Unknown top-level keys are rejected. The keys are `$schema`, `id`, `meta`, `capabilities`, `permissions`. There is no `version` or `displayName` key — the display name is `meta.name`.
- `meta.icon` is one emoji plus a hex background, not an array of image URLs.
- Declare the capabilities you use, nothing more. There is no capability `exports` array — `routes` is the only way to expose an operation.
- `routes` is an array of route objects, never an object keyed by op name. `op` values must be unique.
- Charming does **not** infer `readOnlyHint` from `method: 'GET'`. Set it explicitly on every read, or the operation publishes as a mutation.
- Handlers receive `(input, { env, ctx, request })` and return a JSON-compatible value; Charming wraps it as `{ ok: true, value }` on the wire (or `{ ok: false, error: { kind, message } }` on failure).
- Only WinterTC globals (Request, Response, URL, crypto, TextEncoder, …). No Node APIs, no DOM.
- Omit `default.fetch` unless the app needs custom fallback HTTP; Charming supplies a 404 handler when it's absent.

### Storage

`env.storage` (`get` / `put` / `delete` / `list`) stores JSON values **directly**. Never `JSON.stringify` on the way in or `JSON.parse` on the way out. Storage is per-app and survives updates, so iterate freely.

`env.storage` works everywhere the app runs — the web app and inside Claude/ChatGPT. `localStorage` / `sessionStorage` / `IndexedDB` need the `charming:browser/storage@1.0` capability _and_ are empty inside chat hosts. Anything the user expects to keep belongs in `env.storage`.

Keep user data in `env.storage`, never in module constants — a shared or templated copy of the app then starts empty instead of leaking the author's data.

Full capability list, `permissions.server.fetch` rules, secrets, and external images: [resources/contract.md](./resources/contract.md).

## The UI

`ui.js` is one JavaScript program — not HTML, not a module. Charming injects `<div id="app"></div>`, a Tailwind-compatible runtime, and a default theme.

```js
const api = window.charming.api('water-log'); // manifest.id, NOT the URL's UUID
const items = await api.list({}); // the value itself; throws on failure
```

`window.charming.api(id).<op>(input)` returns the value directly and throws `CharmingOperationError` on failure. It is not `api.operation(name, params)`, and it is never a raw `fetch()`.

Sandbox rules that silently break apps:

- In chat embeds, `confirm` and `prompt` show Charming's dialog and return a Promise; on the web they are the browser's own. Build inline UI, or `await` them.
- On the web, pointer lock works for every app; fullscreen and a click-started `window.top.location` redirect need a claimed app. Chat embeds block all three.
- Chat embeds block external `<script>` tags and CDN imports; on the web only, scripts from cdnjs, unpkg, or jsDelivr load when `ui` writes the full URL with an exact package version (`leaflet@1.9.4`); anything looser fails create/update with `unpinned_cdn_script`. Prefer inlining a UMD build if a library is truly needed.
- Prevent native form submission and handle it in JavaScript.
- Set `#app` innerHTML **before** attaching listeners, and re-bind after every re-render. Re-render narrow containers, not the whole root, or a refresh wipes half-typed input.
- Reserve the bottom-right 64px square — Charming's widget button sits there. Do not build a Charming badge, share button, app switcher, or account nav inside the app; the outer shell owns those.

`window.charming.viewer.can(op)` is a UI hint for read-only viewers, not an auth check — the server enforces access. Catch `forbidden` / `forbidden_write` and render a read-only state.

## Visual style

Charming apps should look like one product, not one generated page.

- Page `bg-stone-50`; cards `bg-white border border-stone-200 rounded-md`.
- Labels `text-sm font-semibold text-stone-700`; numbers `tabular-nums`.
- One accent color per app (emerald / amber / violet / cyan / sky); stone neutrals everywhere else.
- Sticky header with the title and one live metric. Optional tab nav with `border-b-2` on the active tab.
- Fill the viewport. Don't wrap the whole app in a narrow `max-w-*` box, and don't default every app to heading + input + button + empty list.
- No tiny all-caps tracked eyebrows, no empty settings pages, no fake account fields — they read as generated.

## Mobile

Apps are shared by link, usually into a chat, so a large share of first opens are on a phone.

- Keep `input`, `select`, and `textarea` `font-size` at 16px or above on small screens. iOS Safari auto-zooms a focused field under 16px and does not zoom back out. The CRUD template scopes this with a `@media (max-width: 640px)` rule in `styles.css` rather than shrinking desktop type, and needs `!important` there — a Tailwind text-size utility (`text-sm`, ...) is a class selector and outranks a plain element selector on specificity, so without it the rule silently loses. Never fix the zoom with `maximum-scale=1, user-scalable=no`; that disables pinch-zoom for everyone.

## Patterns that keep biting

- **Undo-toast deletes** beat confirm dialogs (a Promise in chat, a boolean on the web): delete immediately, show "Removed · Undo" for ~6s, and have Undo call a `restore` op that upserts by id. The CRUD template includes this.
- **Inline confirm** for genuinely destructive actions: swap the button for "Delete? [Delete] [Cancel]".
- **Migration discipline**: a versioned storage key (`items_v1`) plus a `normalize()` on read that fills defaults for new fields. On a shape change, write `migrate(old)` and keep the old key one cycle.
- **Live updates**: `window.charming.onStateChange?.(() => refresh())`. Never poll with a timer: the stream reconnects and resyncs on its own.

More patterns, including agent-mediated enrichment and display-only apps: [resources/patterns.md](./resources/patterns.md).

## Beyond apps: the platform API

`charming apps …` covers create / read / update / call / delete. Everything else, including sharing, public access, templates, routines, webhooks, secrets, and feedback, goes through the generated catalog:

1. `charming api list`, then `charming api describe <operation-id>`.
2. `charming api request set-app-public --param id=<app-id> --body '{"public":true}' --dry-run`

For team operations, inspect `security` in `api describe`. Personal tokens work for operations that list `userToken`, including the team inventory reads (`list-team-apps`, `get-team-audit`, `list-team-egress`, `get-team-exposure`, `list-team-people`, `list-team-shares`). An operation whose `security` is only `sessionCookie` needs a signed-in session cookie, which CLI login does not provide: the CLI sends no bearer token, refuses `--token`, and fails before sending without `--header Cookie=NAME=VALUE`. Ask the user to do it in the Charming web app, or to supply an existing session cookie. App transfers, invitation declines, direct team member additions, and team App default changes require `--yes`; preview them with `--dry-run` first.

`charming doctor` checks connectivity, auth, and contract freshness. `charming agent-context` prints the CLI's own contract as JSON.

Read the rich app timeline with `charming api request get-app-activity-timeline --param appId=APP_ID --param limit=50` using a user token with `app:manage`. When `hasMore` is true, pass the oldest item’s `ts` and `id` as `before` and `beforeId`. `get-app-activity --param id=APP_ID` remains the separate runtime-failure log.
