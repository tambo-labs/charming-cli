/**
 * Field-level drift check between the server's OpenAPI request bodies and
 * the CLI's hand-written "friendly" commands (`apps create`, `apps update`,
 * …) that wrap them. Operation-level reachability is never a real gap —
 * every OpenAPI operation is already callable generically via `charming api
 * request <operation-id>` — so the check that catches real drift (like
 * `--description` missing from `apps create` while the server already
 * accepted a `description` body field) is: for each operation a friendly
 * command claims to wrap, does that command expose a flag for every
 * property in the operation's request body?
 *
 * Run via `bun run cli:check` (packages/cli/scripts/generate.ts).
 */

export type CatalogOperation = {
  id: string;
  requestBody: { schema?: unknown } | null;
};

export type ParityIssue = {
  operationId: string;
  property: string;
};

export function findParityIssues(
  operations: readonly CatalogOperation[],
  friendlyCommandFlags: Readonly<Record<string, ReadonlySet<string>>>,
  allowlist: Readonly<Record<string, ReadonlySet<string>>>,
): ParityIssue[] {
  const issues: ParityIssue[] = [];
  for (const operation of operations) {
    const flags = friendlyCommandFlags[operation.id];
    if (!flags) continue;
    const allowed = allowlist[operation.id] ?? new Set<string>();
    for (const property of bodyProperties(operation.requestBody?.schema)) {
      if (flags.has(property) || allowed.has(property)) continue;
      issues.push({ operationId: operation.id, property });
    }
  }
  return issues;
}

export function formatParityIssues(issues: readonly ParityIssue[]): string {
  return [
    'Charming CLI commands are missing flags for server request-body fields:',
    ...issues.map(
      (issue) =>
        `  - ${issue.operationId}: no flag for \`${issue.property}\`. Add one, or add it to packages/cli/scripts/cli-parity-allowlist.json with a reason.`,
    ),
  ].join('\n');
}

function bodyProperties(schema: unknown): string[] {
  if (!schema || typeof schema !== 'object') return [];
  const properties = (schema as { properties?: unknown }).properties;
  if (!properties || typeof properties !== 'object') return [];
  return Object.keys(properties);
}
