import { lstat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { clientFor, requireUserToken, timeoutFor, type CommandContext } from './commands.js';
import { readAppPackage } from './files.js';
import { ApiError } from './http.js';

/** A connector toolkit an App imports, with the names it imports from it. */
export interface ToolkitImport {
  specifier: string;
  toolkit: string;
  version: string;
  functions: string[];
}

/** One tool's schemas at a toolkit version, as the API returns them. */
export interface ToolSchemas {
  tool: string;
  function: string;
  inputSchema: unknown;
  outputSchema: unknown;
}

/** The file `charming types` writes beside package.json. */
export const DECLARATIONS_FILE = 'charming-env.d.ts';

const TOOLKIT_IMPORT =
  /(?<=^|;)\s*import\s+(type\s+)?\{([^}]*)\}\s*from\s*(['"])(charming:connectors\/([a-z0-9]+(?:_[a-z0-9]+)*)@(\d{8}_\d{2}))\3/gm;

/** The source with its comments blanked, keeping strings and template literals as they are. */
export function withoutComments(text: string): string {
  let out = '';
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '/' && next === '/') {
      const end = text.indexOf('\n', index);
      index = end === -1 ? text.length : end;
      continue;
    }
    if (char === '/' && next === '*') {
      const end = text.indexOf('*/', index + 2);
      const stop = end === -1 ? text.length : end + 2;
      out += text.slice(index, stop).replace(/[^\n]/g, ' ');
      index = stop;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      let end = index + 1;
      while (end < text.length && text[end] !== char) end += text[end] === '\\' ? 2 : 1;
      out += text.slice(index, end + 1);
      index = end + 1;
      continue;
    }
    out += char;
    index += 1;
  }
  return out;
}

/**
 * The connector toolkits the App's code imports by name, merged across files
 * and sorted, leaving out comments and type-only imports, which Charming
 * erases before it reads the source. Charming refuses every other form of
 * toolkit import at save.
 */
export function findToolkitImports(files: Readonly<Record<string, string>>): ToolkitImport[] {
  const found = new Map<string, ToolkitImport>();
  for (const [path, text] of Object.entries(files)) {
    if (!/\.(?:js|mjs|ts)$/.test(path)) continue;
    for (const [, typeOnly, names, , specifier, toolkit, version] of withoutComments(text).matchAll(
      TOOLKIT_IMPORT,
    )) {
      if (typeOnly) continue;
      const entry = found.get(specifier) ?? { specifier, toolkit, version, functions: [] };
      for (const part of names.split(',')) {
        const specified = part.trim();
        if (/^type\s/.test(specified)) continue;
        const name = specified.split(/\s+as\s+/)[0]?.trim();
        if (name && !entry.functions.includes(name)) entry.functions.push(name);
      }
      found.set(specifier, entry);
    }
  }
  return [...found.values()]
    .map((entry) => ({ ...entry, functions: entry.functions.sort() }))
    .sort((a, b) => a.specifier.localeCompare(b.specifier));
}

type Schema = Record<string, unknown>;

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

function isSchema(value: unknown): value is Schema {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function literal(value: unknown): string {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value)
    ? JSON.stringify(value)
    : 'unknown';
}

function union(types: string[]): string {
  const unique = [...new Set(types)];
  if (unique.includes('unknown')) return 'unknown';
  return unique.length === 0 ? 'never' : unique.join(' | ');
}

function propertyKey(key: string): string {
  return IDENTIFIER.test(key) ? key : JSON.stringify(key);
}

function docComment(schema: Schema, indent: string): string {
  const text = typeof schema.description === 'string' ? schema.description.trim() : '';
  if (!text) return '';
  return `${indent}/** ${text.replace(/\*\//g, '* /').replace(/\s*\n\s*/g, ' ')} */\n`;
}

/**
 * A TypeScript type for a JSON Schema. It covers the shapes Composio's tool
 * schemas use: objects, arrays, primitives, enums, consts, unions, and local
 * `$ref`s. Anything else becomes `unknown`, so a type is looser than the
 * schema, never stricter.
 */
export function schemaType(
  value: unknown,
  defs: Readonly<Record<string, unknown>> = {},
  indent = '',
  seen: ReadonlySet<string> = new Set(),
): string {
  if (value === true || value === undefined) return 'unknown';
  if (value === false) return 'never';
  if (!isSchema(value)) return 'unknown';
  const schema = value;
  const ownDefs = isSchema(schema.$defs)
    ? { ...defs, ...schema.$defs }
    : isSchema(schema.definitions)
      ? { ...defs, ...schema.definitions }
      : defs;
  if (typeof schema.$ref === 'string') {
    const match = /^#\/(?:\$defs|definitions)\/([^/]+)$/.exec(schema.$ref);
    if (!match || seen.has(match[1]) || !(match[1] in ownDefs)) return 'unknown';
    return schemaType(ownDefs[match[1]], ownDefs, indent, new Set([...seen, match[1]]));
  }
  if ('const' in schema) return literal(schema.const);
  if (Array.isArray(schema.enum)) return union(schema.enum.map(literal));
  for (const key of ['anyOf', 'oneOf'] as const)
    if (Array.isArray(schema[key]))
      return union(
        (schema[key] as unknown[]).map((part) => schemaType(part, ownDefs, indent, seen)),
      );
  if (Array.isArray(schema.allOf)) {
    const parts = (schema.allOf as unknown[]).map((part) =>
      schemaType(part, ownDefs, indent, seen),
    );
    return parts.includes('unknown') || parts.length === 0
      ? 'unknown'
      : parts.map((part) => `(${part})`).join(' & ');
  }
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (types.length === 1 && types[0] === undefined) {
    if (isSchema(schema.properties)) return objectType(schema, ownDefs, indent, seen);
    if ('items' in schema) return arrayType(schema, ownDefs, indent, seen);
    return 'unknown';
  }
  return union(
    types.map((type) => {
      switch (type) {
        case 'string':
          return 'string';
        case 'number':
        case 'integer':
          return 'number';
        case 'boolean':
          return 'boolean';
        case 'null':
          return 'null';
        case 'array':
          return arrayType(schema, ownDefs, indent, seen);
        case 'object':
          return objectType(schema, ownDefs, indent, seen);
        default:
          return 'unknown';
      }
    }),
  );
}

function arrayType(
  schema: Schema,
  defs: Readonly<Record<string, unknown>>,
  indent: string,
  seen: ReadonlySet<string>,
): string {
  const item = schemaType(schema.items, defs, indent, seen);
  return /^[\w$."]+$/.test(item) ? `${item}[]` : `Array<${item}>`;
}

function objectType(
  schema: Schema,
  defs: Readonly<Record<string, unknown>>,
  indent: string,
  seen: ReadonlySet<string>,
): string {
  const properties = isSchema(schema.properties) ? schema.properties : {};
  const required = new Set(Array.isArray(schema.required) ? schema.required : []);
  const inner = `${indent}  `;
  const lines = Object.entries(properties).map(
    ([key, property]) =>
      `${isSchema(property) ? docComment(property, inner) : ''}${inner}${propertyKey(key)}${required.has(key) ? '' : '?'}: ${schemaType(property, defs, inner, seen)};`,
  );
  if (schema.additionalProperties !== false) lines.push(`${inner}[key: string]: unknown;`);
  return lines.length === 0 ? 'Record<string, never>' : `{\n${lines.join('\n')}\n${indent}}`;
}

/** The keys the \`Route\` type declares, which admission accepts on a saved route. */
export const ROUTE_TYPE_KEYS = [
  'op',
  'method',
  'path',
  'title',
  'description',
  'inputSchema',
  'outputSchema',
  'annotations',
  'callers',
  'public',
  'examples',
  'handler',
] as const;

const ROUTE_MODULE = `declare module 'charming' {
  /** A route: the default export of a route file, read by Charming without running it. */
  export interface Route {
    op: string;
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    path?: string;
    title?: string;
    /** What the route does, then what it keeps private. */
    description?: string;
    inputSchema?: Record<string, unknown>;
    /** Closed with \`additionalProperties: false\` when the route calls a connector tool. */
    outputSchema?: Record<string, unknown>;
    annotations?: {
      readOnlyHint?: boolean;
      destructiveHint?: boolean;
      idempotentHint?: boolean;
      openWorldHint?: boolean;
    };
    /** Who may call a route that writes, at most. */
    callers?: 'signed-in' | 'members';
    public?: boolean;
    examples?: unknown[];
    handler: (input: any, context: any) => unknown;
  }
}`;

function isWellFormed(tool: ToolSchemas): boolean {
  return IDENTIFIER.test(tool.function) && /^[A-Z0-9_]+$/.test(tool.tool);
}

function pascal(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * The declarations file for the toolkits an App imports: one module per
 * specifier with a typed function per imported tool, and the `Route` type
 * under `charming`.
 */
export function renderDeclarations(
  toolkits: readonly { specifier: string; tools: readonly ToolSchemas[] }[],
): string {
  const modules = toolkits.map(({ specifier, tools }) => {
    const members = tools.filter(isWellFormed).map((tool) => {
      const name = pascal(tool.function);
      return [
        `  export type ${name}Input = ${schemaType(tool.inputSchema, {}, '  ')};`,
        `  export type ${name}Output = ${schemaType(tool.outputSchema, {}, '  ')};`,
        `  /** Calls ${tool.tool}. \`reason\` is a fixed string saying why the App makes the call. */`,
        `  export function ${tool.function}(input: ${name}Input, options: { reason: string }): Promise<${name}Output>;`,
      ].join('\n');
    });
    return `declare module '${specifier}' {\n${members.join('\n\n')}\n}`;
  });
  return [
    '// Generated by `charming types`. Do not edit; run it again after changing a toolkit import.',
    '',
    ROUTE_MODULE,
    ...modules.flatMap((module) => ['', module]),
    '',
  ].join('\n');
}

const SCHEMA_TIMEOUT_MS = 20_000;
const FUNCTIONS_PER_REQUEST = 50;

/**
 * Writes `charming-env.d.ts` in an App directory: the `Route` type, and a
 * typed function for every connector tool the App's code imports, from each
 * tool's schemas at the version the import names. A toolkit the server
 * refuses is left out and named in `errors`, and the rest are still written.
 */
export async function runTypes(context: CommandContext, directory: string) {
  const files = await readAppPackage(directory);
  const path = resolve(directory, DECLARATIONS_FILE);
  if ((await lstat(path).catch(() => null))?.isSymbolicLink())
    throw new Error(
      `${path} is a symlink, so charming types will not write through it. Remove it and retry.`,
    );
  const toolkits = findToolkitImports(files);
  const token = toolkits.length > 0 ? await requireUserToken(context) : undefined;
  const typed: { specifier: string; tools: ToolSchemas[] }[] = [];
  const errors: { specifier: string; kind: string; message: string }[] = [];
  for (const toolkit of toolkits) {
    const tools: ToolSchemas[] = [];
    try {
      for (let start = 0; start < toolkit.functions.length; start += FUNCTIONS_PER_REQUEST) {
        const query = new URLSearchParams({
          functions: toolkit.functions.slice(start, start + FUNCTIONS_PER_REQUEST).join(','),
        });
        const { data } = await clientFor(context, token).request(
          'GET',
          `/api/v1/connectors/${toolkit.toolkit}/versions/${toolkit.version}/tools?${query}`,
          { timeoutMs: timeoutFor(context, SCHEMA_TIMEOUT_MS) },
        );
        tools.push(...(data as { tools: ToolSchemas[] }).tools);
      }
    } catch (error) {
      if (!(error instanceof ApiError) || error.status >= 500 || error.status === 401) throw error;
      errors.push({ specifier: toolkit.specifier, kind: error.kind, message: error.message });
      continue;
    }
    typed.push({ specifier: toolkit.specifier, tools });
  }
  await writeFile(path, renderDeclarations(typed));
  return {
    ok: errors.length === 0,
    path,
    modules: typed.map(({ specifier, tools }) => ({
      specifier,
      functions: tools.filter(isWellFormed).map((tool) => tool.function),
    })),
    ...(errors.length > 0 ? { errors } : {}),
  };
}
