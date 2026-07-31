---
name: charming
description: Build, inspect, update, and call hosted personal apps with the Charming CLI. Use when a user wants to create or manage an interactive personal app hosted by Charming.
license: MIT
compatibility: Requires the charming CLI, Node.js 22 or newer, and network access to charm.ing.
metadata:
  openclaw:
    requires:
      bins:
        - charming
---

# Charming CLI

Use `charming` to create and manage apps hosted by Charming. It saves credentials, prevents stale updates, and prints JSON errors.

## Start

1. Run `charming auth status`.
2. If it reports `"authenticated": false`, run `charming auth login --no-open`. Give the approval URL and code to the user.
3. Run `charming apps create <directory> --dry-run`. The directory must contain `module.js`; it may contain `ui.js` and `styles.css`.
4. A signed-in create can replace an app with the same manifest ID. Ask before running `charming apps create <directory> --yes`.
5. Return the `url` from the JSON result.

## Iterate

- List: `charming apps list`
- Inspect operations and input schemas: `charming apps describe <app-id>`
- Export or update source: `charming apps source <app-id> --out <directory>` or `charming apps update <app-id> <directory>`
- Call an app operation: `charming apps call <app-id> <operation> --input '{"key":"value"}'`
- Delete: `charming apps delete <app-id> --yes`

Run mutations with `--dry-run` first. Signed-in creates and deletions require `--yes`; pass it only after the user approves that action.

`charming auth logout` removes the user credential and every app credential for the selected origin. Unclaimed apps that relied on those app credentials become unreachable.

Read JSON results from stdout. Login instructions and JSON errors use stderr. Branch on `error.kind`. Follow `error.recovery` when present. Never print tokens or `device_code` values. Show `user_code` only during login.

## Platform API fallback

1. Read an app's agent descriptor: `charming api request get-app-agent-descriptor --param id=<app-id>`.
2. Preview a visibility change: `charming api request set-app-public --param id=<app-id> --body '{"public":true}' --dry-run`.
3. For any other route, run `charming api list`, then `charming api describe <operation-id>` before `charming api request`.
