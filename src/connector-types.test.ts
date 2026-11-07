import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { CommandContext } from './commands.js';
import {
  DECLARATIONS_FILE,
  findToolkitImports,
  renderDeclarations,
  ROUTE_TYPE_KEYS,
  runTypes,
  schemaType,
  typesRefresher,
} from './connector-types.js';
import { readAppPackage } from './files.js';

const ts = createRequire(import.meta.url)(
  'typescript-compiler-api',
) as typeof import('typescript-compiler-api');

const GMAIL = 'charming:connectors/gmail@20261029_00';
const FETCH = {
  tool: 'GMAIL_FETCH_EMAILS',
  function: 'gmailFetchEmails',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'A Gmail search query.' },
      max_results: { type: 'integer' },
      label_ids: { type: 'array', items: { type: 'string' } },
    },
    required: ['query'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      messages: { type: 'array', items: { $ref: '#/$defs/message' } },
      next_page_token: { type: ['string', 'null'] },
    },
    required: ['messages'],
    additionalProperties: false,
    $defs: {
      message: {
        type: 'object',
        properties: { id: { type: 'string' }, state: { enum: ['read', 'unread'] } },
        required: ['id'],
        additionalProperties: false,
      },
    },
  },
};

describe('findToolkitImports', () => {
  it('merges the names each file imports from a toolkit, ignoring aliases, type imports, and other modules', () => {
    expect(
      findToolkitImports({
        'routes/list.ts': `import type { Route } from 'charming';\nimport { gmailFetchEmails as fetchMail } from '${GMAIL}';`,
        'lib/send.js': `import {\n  gmailSendEmail,\n  gmailFetchEmails,\n} from "${GMAIL}";\nimport { kv } from 'charming:storage/kv@1.0';`,
        'styles.css': `import { nope } from '${GMAIL}';`,
      }),
    ).toEqual([
      {
        specifier: GMAIL,
        toolkit: 'gmail',
        version: '20261029_00',
        functions: ['gmailFetchEmails', 'gmailSendEmail'],
      },
    ]);
  });
});

describe('findToolkitImports with comments and type forms', () => {
  it('skips imports inside comments and strings, and type-only imports and specifiers', () => {
    expect(
      findToolkitImports({
        'routes/a.ts': [
          `// import { gmailOldName } from '${GMAIL}';`,
          `/* import { gmailOther } from '${GMAIL}'; } */`,
          `const text = "import { gmailInString } from '${GMAIL}';";`,
          `import type { GmailFetchEmailsInput } from '${GMAIL}';`,
          `import { type gmailSendEmail, gmailFetchEmails } from '${GMAIL}';`,
        ].join('\n'),
      })[0].functions,
    ).toEqual(['gmailFetchEmails']);
  });
});

describe('schemaType', () => {
  it.each([
    [{ type: 'string' }, 'string'],
    [{ type: ['integer', 'null'] }, 'number | null'],
    [{ enum: ['a', 1, null] }, '"a" | 1 | null'],
    [{ const: 'fixed' }, '"fixed"'],
    [{ anyOf: [{ type: 'string' }, { type: 'boolean' }] }, 'string | boolean'],
    [{ type: 'array', items: { type: 'number' } }, 'number[]'],
    [{ type: 'object', properties: {}, additionalProperties: false }, 'Record<string, never>'],
    [{ $ref: 'https://example.com/schema.json' }, 'unknown'],
    [{ not: { type: 'string' } }, 'unknown'],
    [true, 'unknown'],
    [{ oneOf: [{ type: 'string' }, { type: 'null' }] }, 'string | null'],
    [{ allOf: [{ type: 'string' }, { const: 'a' }] }, '(string) & ("a")'],
    [{ allOf: [{ type: 'string' }, { not: {} }] }, 'unknown'],
    [{ $ref: '#/definitions/id', definitions: { id: { type: 'string' } } }, 'string'],
    [
      {
        type: 'object',
        properties: { 'x-id': { type: 'string' } },
        required: ['x-id'],
        additionalProperties: { type: 'number' },
      },
      '{\n  "x-id": string;\n  [key: string]: unknown;\n}',
    ],
  ])('types %j as %s', (schema, type) => {
    expect(schemaType(schema)).toBe(type);
  });

  it('marks optional properties and keeps unnamed ones open unless the schema closes it', () => {
    expect(schemaType(FETCH.inputSchema)).toBe(
      [
        '{',
        '  /** A Gmail search query. */',
        '  query: string;',
        '  max_results?: number;',
        '  label_ids?: string[];',
        '  [key: string]: unknown;',
        '}',
      ].join('\n'),
    );
  });

  it('stops at a $ref that refers back to itself', () => {
    expect(
      schemaType({
        $defs: { node: { type: 'object', properties: { next: { $ref: '#/$defs/node' } } } },
        $ref: '#/$defs/node',
      }),
    ).toContain('next?: unknown;');
  });
});

describe('the declarations file', () => {
  let directory: string | undefined;
  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  async function compile(route: string) {
    directory = await mkdtemp(join(tmpdir(), 'charming-types-'));
    await writeFile(
      join(directory, DECLARATIONS_FILE),
      renderDeclarations([{ specifier: GMAIL, tools: [FETCH] }]),
    );
    await writeFile(join(directory, 'route.ts'), route);
    const program = ts.createProgram(
      [join(directory, 'route.ts'), join(directory, DECLARATIONS_FILE)],
      {
        strict: true,
        noEmit: true,
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
      },
    );
    return ts
      .getPreEmitDiagnostics(program)
      .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
  }

  const route = (call: string) => `import type { Route } from 'charming';
import { gmailFetchEmails } from '${GMAIL}';
export default {
  op: 'list',
  method: 'GET',
  handler: async () => {
    const result = await ${call};
    return result.messages.map((message) => message.id);
  },
} satisfies Route;
`;

  it('type-checks a route that calls a tool with its input and a reason', async () => {
    expect(
      await compile(
        route("gmailFetchEmails({ query: 'is:unread' }, { reason: 'Listing unread mail' })"),
      ),
    ).toEqual([]);
  });

  it('reports a call without a reason, and an input missing a required field', async () => {
    expect(await compile(route("gmailFetchEmails({ query: 'is:unread' }, {})"))).toEqual([
      expect.stringContaining("Property 'reason' is missing"),
    ]);
    expect(await compile(route("gmailFetchEmails({}, { reason: 'Listing mail' })"))).toEqual([
      expect.stringContaining("Property 'query' is missing"),
    ]);
  });

  it('declares a Route interface with exactly the keys admission accepts', async () => {
    directory = await mkdtemp(join(tmpdir(), 'charming-types-route-'));
    const file = join(directory, DECLARATIONS_FILE);
    await writeFile(file, renderDeclarations([]));
    const program = ts.createProgram([file], { strict: true, noEmit: true });
    const route = program
      .getSourceFile(file)!
      .statements.filter(ts.isModuleDeclaration)
      .flatMap((module) =>
        module.body && ts.isModuleBlock(module.body) ? [...module.body.statements] : [],
      )
      .find(
        (node): node is import('typescript-compiler-api').InterfaceDeclaration =>
          ts.isInterfaceDeclaration(node) && node.name.text === 'Route',
      )!;

    expect(new Set(route.members.map((member) => (member.name as { text: string }).text))).toEqual(
      new Set(ROUTE_TYPE_KEYS),
    );
  });

  it('lets a misspelled optional field through an open input, which only Composio catches', async () => {
    expect(
      await compile(route("gmailFetchEmails({ query: 'x', max_result: 5 }, { reason: 'x' })")),
    ).toEqual([]);
  });

  it('reports a route with a field the Route type does not have', async () => {
    const diagnostics = await compile(
      route("gmailFetchEmails({ query: 'x' }, { reason: 'x' })").replace(
        "method: 'GET',",
        "method: 'GET', uses: {},",
      ),
    );
    expect(diagnostics.join('\n')).toContain("'uses' does not exist in type 'Route'");
  });
});

describe('runTypes', () => {
  let directory: string | undefined;
  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it('asks for the imported names at each version, writes the file, and keeps it out of --files', async () => {
    directory = await mkdtemp(join(tmpdir(), 'charming-types-run-'));
    await mkdir(join(directory, 'routes'));
    await writeFile(join(directory, 'package.json'), '{"name":"inbox"}');
    await writeFile(
      join(directory, 'server.js'),
      "export { default as list } from './routes/list.ts';",
    );
    await writeFile(
      join(directory, 'routes/list.ts'),
      `import { gmailFetchEmails } from '${GMAIL}';\nexport default { op: 'list', handler: () => gmailFetchEmails({ query: 'x' }, { reason: 'x' }) };`,
    );
    const requested: string[] = [];
    const context = {
      options: {},
      session: { origin: 'https://charming.test', token: 'chrm_user_test' },
      fetchImpl: (async (input: string | URL | Request) => {
        requested.push(input instanceof Request ? input.url : input.toString());
        return new Response(
          JSON.stringify({ ok: true, service: 'gmail', version: '20261029_00', tools: [FETCH] }),
          {
            headers: { 'content-type': 'application/json' },
          },
        );
      }) as typeof fetch,
    } as unknown as CommandContext;

    const result = await runTypes(context, directory);

    expect(requested).toEqual([
      'https://charming.test/api/v1/connectors/gmail/versions/20261029_00/tools?functions=gmailFetchEmails',
    ]);
    expect(result).toMatchObject({
      ok: true,
      modules: [{ specifier: GMAIL, functions: ['gmailFetchEmails'] }],
    });
    expect(await readFile(join(directory, DECLARATIONS_FILE), 'utf8')).toContain(
      'export function gmailFetchEmails(input: GmailFetchEmailsInput, options: { reason: string }): Promise<GmailFetchEmailsOutput>;',
    );
    expect(Object.keys(await readAppPackage(directory))).not.toContain(DECLARATIONS_FILE);
  });

  async function app(files: Record<string, string>) {
    directory = await mkdtemp(join(tmpdir(), 'charming-types-run-'));
    for (const [path, text] of Object.entries({ 'package.json': '{"name":"inbox"}', ...files })) {
      await mkdir(join(directory, path, '..'), { recursive: true });
      await writeFile(join(directory, path), text);
    }
    return directory;
  }

  function contextFor(answer: (url: string) => Response, token: string | null = 'chrm_user_test') {
    const requested: string[] = [];
    const context = {
      options: {},
      session: { origin: 'https://charming.test', ...(token ? { token } : {}) },
      fetchImpl: (async (input: string | URL | Request) => {
        const url = input instanceof Request ? input.url : input.toString();
        requested.push(url);
        return answer(url);
      }) as typeof fetch,
    } as unknown as CommandContext;
    return { context, requested };
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  it('writes only the Route type, signed out and without a request, when the App imports no toolkit', async () => {
    const dir = await app({
      'server.js': "export { default as ping } from './routes/ping.ts';",
      'routes/ping.ts': "export default { op: 'ping', handler: () => 'pong' };",
    });
    const { context, requested } = contextFor(() => {
      throw new Error('no request expected');
    }, null);

    expect(await runTypes(context, dir)).toMatchObject({ ok: true, modules: [] });
    expect(requested).toEqual([]);
    expect(await readFile(join(dir, DECLARATIONS_FILE), 'utf8')).toContain(
      "declare module 'charming'",
    );
  });

  it('asks once per toolkit, in groups of 50 names, and keeps the toolkits the server accepts when it refuses one', async () => {
    const names = Array.from({ length: 51 }, (_, index) => `gmailTool${index}`);
    const dir = await app({
      'server.js': "export { default as list } from './routes/list.js';",
      'routes/list.js': [
        `import { ${names.join(', ')} } from '${GMAIL}';`,
        "import { slackCreateAReminder } from 'charming:connectors/slack@20261001_00';",
        "export default { op: 'list', handler: () => 1 };",
      ].join('\n'),
    });
    const { context, requested } = contextFor((url) =>
      url.includes('/slack/')
        ? json(
            {
              ok: false,
              error: { kind: 'not_found', message: 'Composio retired slack version 20261001_00.' },
            },
            404,
          )
        : json({
            ok: true,
            tools: new URL(url).searchParams
              .get('functions')!
              .split(',')
              .map((name) => ({ ...FETCH, function: name })),
          }),
    );

    const result = await runTypes(context, dir);

    expect(
      requested.map((url) => new URL(url).searchParams.get('functions')!.split(',').length),
    ).toEqual([50, 1, 1]);
    expect(result).toMatchObject({
      ok: false,
      modules: [{ specifier: GMAIL }],
      errors: [
        {
          specifier: 'charming:connectors/slack@20261001_00',
          kind: 'not_found',
          message: 'Composio retired slack version 20261001_00.',
        },
      ],
    });
    expect((result.modules[0] as { functions: string[] }).functions).toHaveLength(51);
  });

  it('drops a tool whose name from the server is not an identifier', () => {
    expect(
      renderDeclarations([{ specifier: GMAIL, tools: [{ ...FETCH, function: 'gmail(); evil' }] }]),
    ).not.toContain('evil');
  });

  it('refuses to write through a symlinked charming-env.d.ts', async () => {
    const dir = await app({ 'server.js': 'export const routes = [];' });
    await writeFile(join(dir, 'target.txt'), 'keep');
    await symlink(join(dir, 'target.txt'), join(dir, DECLARATIONS_FILE));
    const { context } = contextFor(() => json({}));

    await expect(runTypes(context, dir)).rejects.toThrow(
      'is a symlink, so charming types will not write through it.',
    );
    expect(await readFile(join(dir, 'target.txt'), 'utf8')).toBe('keep');
  });

  it('leaves .d.ts files at any depth out of --files', async () => {
    const dir = await app({
      'server.js': 'export const routes = [];',
      'types/extra.d.ts': 'export {};',
      [DECLARATIONS_FILE]: '',
    });
    expect(Object.keys(await readAppPackage(dir))).toEqual(['package.json', 'server.js']);
  });
});

describe('typesRefresher', () => {
  let directory: string | undefined;
  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  async function app(route: string) {
    directory = await mkdtemp(join(tmpdir(), 'charming-types-dev-'));
    await mkdir(join(directory, 'routes'));
    await writeFile(join(directory, 'package.json'), '{"name":"inbox"}');
    await writeFile(
      join(directory, 'server.js'),
      "export { default as list } from './routes/list.ts';",
    );
    await writeFile(join(directory, 'routes/list.ts'), route);
    return directory;
  }

  function contextFor(token: string | null) {
    const requested: string[] = [];
    const context = {
      options: {},
      session: { origin: 'https://charming.test', ...(token ? { token } : {}) },
      fetchImpl: (async (input: string | URL | Request) => {
        const url = input instanceof Request ? input.url : input.toString();
        requested.push(url);
        const functions = new URL(url).searchParams.get('functions')!.split(',');
        return new Response(
          JSON.stringify({
            ok: true,
            tools: functions.map((name) => ({ ...FETCH, function: name })),
          }),
          { headers: { 'content-type': 'application/json' } },
        );
      }) as typeof fetch,
    } as unknown as CommandContext;
    return { context, requested };
  }

  const importing = (names: string) =>
    `import { ${names} } from '${GMAIL}';\nexport default { op: 'list', handler: () => 1 };`;

  it('writes again only when the toolkit imports change', async () => {
    const dir = await app(importing('gmailFetchEmails'));
    const { context, requested } = contextFor('chrm_user_test');
    const lines: string[] = [];
    const refresh = typesRefresher(
      () => Promise.resolve(context),
      dir,
      (line) => lines.push(line),
    );

    await refresh();
    await refresh();
    expect(requested).toHaveLength(1);
    expect(lines).toEqual([
      `Wrote ${DECLARATIONS_FILE} with the Route type and 1 connector function.`,
    ]);

    await writeFile(join(dir, 'routes/list.ts'), importing('gmailFetchEmails, gmailSendEmail'));
    await refresh();
    expect(requested).toHaveLength(2);
    expect(await readFile(join(dir, DECLARATIONS_FILE), 'utf8')).toContain(
      'export function gmailSendEmail(',
    );
  });

  it('logs a failure instead of throwing, and tries again on the next change', async () => {
    const dir = await app(importing('gmailFetchEmails'));
    const lines: string[] = [];
    const signedOut = typesRefresher(
      () => Promise.resolve(contextFor(null).context),
      dir,
      (line) => lines.push(line),
    );

    await expect(signedOut()).resolves.toBeUndefined();
    await signedOut();
    expect(lines).toEqual([
      expect.stringMatching(
        new RegExp(`^Could not write ${DECLARATIONS_FILE.replace('.', '\\.')}: Not authenticated`),
      ),
      expect.stringMatching(/^Could not write/),
    ]);
  });

  it('leaves a JavaScript App with no toolkit import alone', async () => {
    directory = await mkdtemp(join(tmpdir(), 'charming-types-dev-'));
    await writeFile(join(directory, 'package.json'), '{"name":"plain"}');
    await writeFile(join(directory, 'server.js'), 'export const routes = [];');
    const { context, requested } = contextFor('chrm_user_test');

    await typesRefresher(
      () => Promise.resolve(context),
      directory,
      () => {},
    )();

    expect(requested).toEqual([]);
    await expect(readFile(join(directory, DECLARATIONS_FILE), 'utf8')).rejects.toThrow();
  });

  it('turns overlapping calls into one request, and stays silent on an unreadable package', async () => {
    const dir = await app(importing('gmailFetchEmails'));
    const { context, requested } = contextFor('chrm_user_test');
    const refresh = typesRefresher(
      () => Promise.resolve(context),
      dir,
      () => {},
    );

    await Promise.all([refresh(), refresh(), refresh()]);
    expect(requested).toHaveLength(1);

    await rm(join(dir, 'server.js'));
    await expect(refresh()).resolves.toBeUndefined();
  });

  it('logs a toolkit the server refuses and asks for it again on the next call', async () => {
    const dir = await app(importing('gmailFetchEmails'));
    let refused = true;
    const requested: string[] = [];
    const context = {
      options: {},
      session: { origin: 'https://charming.test', token: 'chrm_user_test' },
      fetchImpl: (async (input: string | URL | Request) => {
        requested.push(input instanceof Request ? input.url : input.toString());
        return refused
          ? new Response(
              JSON.stringify({
                ok: false,
                error: { kind: 'rate_limited', message: 'Try again later.' },
              }),
              {
                status: 429,
                headers: { 'content-type': 'application/json' },
              },
            )
          : new Response(JSON.stringify({ ok: true, tools: [FETCH] }), {
              headers: { 'content-type': 'application/json' },
            });
      }) as typeof fetch,
    } as unknown as CommandContext;
    const lines: string[] = [];
    const refresh = typesRefresher(
      () => Promise.resolve(context),
      dir,
      (line) => lines.push(line),
    );

    await refresh();
    refused = false;
    await refresh();

    expect(requested).toHaveLength(2);
    expect(lines).toEqual([
      `Wrote ${DECLARATIONS_FILE} with the Route type and 0 connector functions.`,
      `${DECLARATIONS_FILE} leaves out ${GMAIL}: Try again later.`,
      `Wrote ${DECLARATIONS_FILE} with the Route type and 1 connector function.`,
    ]);
  });

  it('logs a session that cannot be resolved instead of stopping', async () => {
    const dir = await app(importing('gmailFetchEmails'));
    const lines: string[] = [];
    const refresh = typesRefresher(
      () => Promise.reject(new Error('Profile "work" is not saved on this machine.')),
      dir,
      (line) => lines.push(line),
    );

    await expect(refresh()).resolves.toBeUndefined();
    expect(lines).toEqual([
      `Could not write ${DECLARATIONS_FILE}: Profile "work" is not saved on this machine.`,
    ]);
  });

  it('rewrites an existing file once the last toolkit import is gone from a JavaScript App', async () => {
    directory = await mkdtemp(join(tmpdir(), 'charming-types-dev-'));
    await writeFile(join(directory, 'package.json'), '{"name":"plain"}');
    await writeFile(join(directory, 'server.js'), 'export const routes = [];');
    await writeFile(join(directory, DECLARATIONS_FILE), `declare module '${GMAIL}' {}`);
    const { context, requested } = contextFor('chrm_user_test');

    await typesRefresher(
      () => Promise.resolve(context),
      directory,
      () => {},
    )();

    expect(requested).toEqual([]);
    expect(await readFile(join(directory, DECLARATIONS_FILE), 'utf8')).not.toContain(GMAIL);
  });
});
