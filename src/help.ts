export const HELP = `charming — build and manage personal apps

Usage:
  charming auth login [--no-open]
  charming auth status
  charming auth logout
  charming apps list [--limit N] [--cursor CURSOR]
  charming apps create [DIR] [--module FILE] [--ui FILE] [--styles FILE] [--dry-run] [--yes]
  charming apps describe <APP_ID>
  charming apps source <APP_ID> [--out DIR]
  charming apps update <APP_ID> [DIR] [--module FILE] [--ui FILE] [--styles FILE] [--dry-run]
  charming apps call <APP_ID> <OPERATION> [--input JSON|@FILE] [--dry-run]
  charming apps delete <APP_ID> [--dry-run] --yes
  charming api list
  charming api describe <OPERATION_ID>
  charming api request <OPERATION_ID> [--param NAME=VALUE] [--body JSON|@FILE] [--file PATH] [--header NAME=VALUE] [--dry-run] [--yes]
  charming doctor
  charming agent-context

Global options:
  --base-url URL   API origin (default: CHARMING_BASE_URL or https://charm.ing)
  --token TOKEN    Override CHARMING_TOKEN and saved credentials
  --dry-run        Print a mutation without sending it
  --help           Show help
  --version        Show the CLI version

App directories contain module.js and may contain ui.js and styles.css.
Commands print JSON. Live deletions and authenticated creates require --yes.
Run "charming api list" to list platform API operation IDs.
`;
