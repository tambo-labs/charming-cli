import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

import { type OptionValue, stringOption, stringOptions } from './args.js';
import {
  loadAppToken,
  loadToken,
  removeToken,
  resolveToken,
  saveAppToken,
  saveToken,
} from './config.js';
import { findOperation, operations } from './contract.js';
import { readAppBundle, readJsonValue, writeAppBundle } from './files.js';
import { ApiError, CharmingClient, isOpenableUrl } from './http.js';

type CommandDefinition = {
  maxPositionals: number;
  minPositionals: number;
  options: readonly string[];
  usage: string;
  words: number;
};

type CommandContext = {
  baseUrl: string;
  command: string[];
  fetchImpl?: typeof fetch;
  options: Record<string, OptionValue>;
  token?: string;
};

const GLOBAL_OPTIONS = ['base-url', 'token'] as const;
// Operations that upsert by a caller-supplied id and silently overwrite an existing
// row in place, so they need the same --yes consent as a DELETE.
const REPLACES_IN_PLACE = new Set(['create-app']);
const COMMANDS: Record<string, CommandDefinition> = {
  'agent-context': command('charming agent-context', 1),
  'apps call': command(
    'charming apps call <APP_ID> <OPERATION> [--input JSON|@FILE] [--dry-run]',
    2,
    2,
    2,
    ['input', 'dry-run'],
  ),
  'apps create': command(
    'charming apps create [DIR] [--module FILE] [--ui FILE] [--styles FILE] [--dry-run] [--yes]',
    2,
    0,
    1,
    ['module', 'ui', 'styles', 'dry-run', 'yes'],
  ),
  'apps delete': command('charming apps delete <APP_ID> --yes', 2, 1, 1, ['yes', 'dry-run']),
  'apps describe': command('charming apps describe <APP_ID>', 2, 1, 1),
  'apps list': command('charming apps list [--limit N] [--cursor CURSOR]', 2, 0, 0, [
    'limit',
    'cursor',
  ]),
  'apps source': command('charming apps source <APP_ID> [--out DIR]', 2, 1, 1, ['out']),
  'apps update': command(
    'charming apps update <APP_ID> [DIR] [--module FILE] [--ui FILE] [--styles FILE] [--dry-run]',
    2,
    1,
    2,
    ['module', 'ui', 'styles', 'dry-run'],
  ),
  'api describe': command('charming api describe <OPERATION_ID>', 2, 1, 1),
  'api list': command('charming api list', 2),
  'api request': command(
    'charming api request <OPERATION_ID> [--param NAME=VALUE] [--body JSON|@FILE] [--file PATH] [--header NAME=VALUE] [--dry-run] [--yes]',
    2,
    1,
    1,
    ['param', 'body', 'file', 'header', 'dry-run', 'yes'],
  ),
  'auth login': command('charming auth login [--no-open]', 2, 0, 0, ['no-open']),
  'auth logout': command('charming auth logout', 2),
  'auth status': command('charming auth status', 2),
  doctor: command('charming doctor', 1),
};

type SourceResponse = {
  source?: {
    module?: unknown;
    styles?: unknown;
    ui?: unknown;
  };
};

export async function runCommand(context: CommandContext): Promise<unknown> {
  return redactSecrets(await dispatchCommand(context));
}

async function dispatchCommand(context: CommandContext): Promise<unknown> {
  assertCommandShape(context);
  const [group, action, ...positionals] = context.command;
  if (group === 'auth') return runAuth(action, context);
  if (group === 'apps') return runApps(action, positionals, context);
  if (group === 'api') return runApi(action, positionals, context);
  if (group === 'doctor') return runDoctor(context);
  if (group === 'agent-context') return agentContext(context.baseUrl);
  throw new Error(`Unknown command: ${context.command.join(' ') || '(none)'}`);
}

async function runAuth(action: string | undefined, context: CommandContext): Promise<unknown> {
  if (action === 'logout') {
    if (context.token) {
      throw new Error('Cannot log out while --token is set. Remove it and try again.');
    }
    const resolved = await resolveToken({ baseUrl: context.baseUrl });
    const activeSource = resolved.source;
    if (!activeSource) return { authenticated: false };
    if (activeSource !== 'config') {
      throw new Error(`Cannot log out while ${activeSource} is set. Unset it and try again.`);
    }
    if (resolved.fallbackSource) {
      throw new Error(
        'Cannot log out while a legacy credential exists at ~/.buildy/user-token. Remove it and try again.',
      );
    }
    await removeToken({ baseUrl: context.baseUrl });
    return { authenticated: false };
  }
  if (action === 'status') {
    const resolved = context.token
      ? { source: '--token', token: context.token }
      : await resolveToken({ baseUrl: context.baseUrl });
    const token = resolved.token;
    if (!token) return { authenticated: false };
    const client = clientFor(context, token);
    await client.request('GET', '/app?limit=1', { timeoutMs: 2_000 });
    return {
      authenticated: true,
      source: resolved.source,
    };
  }
  if (action !== 'login') throw new Error('Usage: charming auth login|status|logout');

  const client = clientFor(context);
  const started = (
    await client.request('POST', '/api/pair/start', {
      body: { label: `Charming CLI ${CLI_VERSION}` },
    })
  ).data as {
    device_code?: string;
    expires_in?: number;
    polling_interval?: number;
    user_code?: string;
    verification_url?: string;
    verification_url_complete?: string;
  };
  if (!started.device_code || !started.user_code || !started.verification_url) {
    throw new Error('Charming returned an invalid pairing response');
  }

  const url = started.verification_url_complete ?? started.verification_url;
  process.stderr.write(
    `${JSON.stringify({
      event: 'authentication_required',
      verificationUrl: url,
      userCode: started.user_code,
    })}\n`,
  );
  if (context.options['no-open'] !== true) openUrl(url, context.baseUrl);

  const deadline = Date.now() + (started.expires_in ?? 600) * 1_000;
  const interval = Math.max(started.polling_interval ?? 5, 1) * 1_000;
  while (Date.now() < deadline) {
    await wait(interval);
    const polled = (
      await client.request('POST', '/api/pair/poll', {
        body: { device_code: started.device_code },
      })
    ).data as { already_delivered?: boolean; status?: string; token?: string };
    if (polled.status === 'pending') continue;
    if (polled.status === 'expired') throw new Error('Pairing code expired. Run auth login again.');
    if (polled.token) {
      await saveToken(polled.token, { baseUrl: context.baseUrl });
      return { authenticated: true };
    }
    if (polled.already_delivered) {
      throw new Error('Pairing token was already delivered and cannot be shown again.');
    }
  }
  throw new Error('Pairing code expired. Run auth login again.');
}

async function runApps(
  action: string | undefined,
  positionals: string[],
  context: CommandContext,
): Promise<unknown> {
  if (action === 'list') {
    const token = await requireUserToken(context);
    const query = new URLSearchParams();
    const limit = stringOption(context.options, 'limit');
    const cursor = stringOption(context.options, 'cursor');
    if (limit) query.set('limit', limit);
    if (cursor) query.set('cursor', cursor);
    const suffix = query.size > 0 ? `?${query}` : '';
    return (await clientFor(context, token).request('GET', `/app${suffix}`, { timeoutMs: 2_000 }))
      .data;
  }

  if (action === 'create') {
    const token = context.token ?? (await loadToken({ baseUrl: context.baseUrl }));
    const bundle = await readBundle(positionals[0], context.options);
    const body: Record<string, unknown> = { ...bundle };
    if (!token) {
      body.pair = true;
      body.label = `Charming CLI ${CLI_VERSION}`;
    }
    if (context.options['dry-run'] === true) {
      return { dryRun: true, method: 'POST', path: '/app', body };
    }
    if (token && context.options.yes !== true) {
      throw new Error(
        'Authenticated create may overwrite an app with the same manifest id. Use --yes or --dry-run.',
      );
    }
    const data = (await clientFor(context, token).request('POST', '/app', { body })).data as {
      id?: string;
      token?: string;
      [key: string]: unknown;
    };
    if (data.id && data.token)
      await saveAppToken(data.id, data.token, { baseUrl: context.baseUrl });
    return safeCreateResult(data);
  }

  const appId = positionals[0];
  if (!appId) throw new Error(`Usage: charming apps ${action ?? '<command>'} <APP_ID>`);

  if (action === 'delete' && context.options['dry-run'] !== true && context.options.yes !== true) {
    throw new Error('Deletion requires --yes. Use --dry-run to preview it.');
  }

  if (action === 'update' && context.options['dry-run'] === true) {
    const local = await readBundle(positionals[1], context.options);
    return {
      dryRun: true,
      method: 'PUT',
      path: `/app/${encodeURIComponent(appId)}`,
      body: local,
      note: 'A live update first reads the current source and sends its ETag with the write.',
    };
  }

  if (action === 'call' && context.options['dry-run'] === true) {
    const operation = positionals[1];
    if (!operation) throw new Error('Usage: charming apps call <APP_ID> <OPERATION>');
    const input = stringOption(context.options, 'input');
    const body = input ? await readJsonValue(input) : {};
    return {
      dryRun: true,
      method: 'POST',
      path: `/app/${encodeURIComponent(appId)}/api/${encodeURIComponent(operation)}`,
      body,
    };
  }

  if (action === 'delete' && context.options['dry-run'] === true) {
    return {
      dryRun: true,
      method: 'DELETE',
      path: `/app/${encodeURIComponent(appId)}`,
    };
  }

  const token = await tokenForApp(context, appId);
  const client = clientFor(context, token);

  if (action === 'describe') {
    return (
      await client.request('GET', `/app/${encodeURIComponent(appId)}/agent.json`, {
        timeoutMs: 2_000,
      })
    ).data;
  }

  if (action === 'source') {
    const data = (
      await client.request('GET', `/app/${encodeURIComponent(appId)}/source`, {
        timeoutMs: 2_000,
      })
    ).data as SourceResponse;
    const outputDirectory = stringOption(context.options, 'out');
    if (outputDirectory) {
      const source = validSource(data);
      await writeAppBundle(outputDirectory, source);
      return { id: appId, outputDirectory };
    }
    return data;
  }

  if (action === 'update') {
    const local = await readBundle(positionals[1], context.options);
    const current = await client.request('GET', `/app/${encodeURIComponent(appId)}/source`, {
      timeoutMs: 2_000,
    });
    const source = validSource(current.data as SourceResponse);
    if (!current.etag) {
      throw new Error(
        'Charming did not return an ETag for this app source; refusing to update without optimistic concurrency. Retry. If it still fails, run `charming doctor` and check that `--base-url` points to Charming.',
      );
    }
    const body = {
      module: local.module,
      ui: local.ui ?? source.ui ?? undefined,
      styles: local.styles ?? source.styles ?? undefined,
    };
    return (
      await client.request('PUT', `/app/${encodeURIComponent(appId)}`, {
        body,
        headers: { 'If-Match': current.etag },
      })
    ).data;
  }

  if (action === 'call') {
    const operation = positionals[1];
    if (!operation) throw new Error('Usage: charming apps call <APP_ID> <OPERATION>');
    const input = stringOption(context.options, 'input');
    const body = input ? await readJsonValue(input) : {};
    const path = `/app/${encodeURIComponent(appId)}/api/${encodeURIComponent(operation)}`;
    return (
      await client.request('POST', path, {
        body,
        timeoutMs: 30_000,
      })
    ).data;
  }

  if (action === 'delete') {
    return (await client.request('DELETE', `/app/${encodeURIComponent(appId)}`)).data;
  }

  throw new Error('Usage: charming apps list|create|source|update|call|delete');
}

async function runApi(
  action: string | undefined,
  positionals: string[],
  context: CommandContext,
): Promise<unknown> {
  if (action === 'list') {
    return {
      operations: operations.map(({ id, method, path, summary }) => ({
        id,
        method,
        path,
        summary,
      })),
    };
  }
  const operationId = positionals[0];
  if (!operationId) throw new Error(`Usage: charming api ${action ?? '<command>'} <OPERATION_ID>`);
  const operation = findOperation(operationId);
  if (!operation) throw new Error(`Unknown OpenAPI operation: ${operationId}`);
  if (action === 'describe') return operation;
  if (action !== 'request') throw new Error('Usage: charming api list|describe|request');
  if (operation.streaming) {
    throw new Error(
      `Operation ${operation.id} returns a live stream. This CLI version does not support streaming.`,
    );
  }
  if (
    operation.method === 'DELETE' &&
    context.options['dry-run'] !== true &&
    context.options.yes !== true
  ) {
    throw new Error('Deletion requires --yes. Use --dry-run to preview it.');
  }
  if (
    REPLACES_IN_PLACE.has(operation.id) &&
    context.options['dry-run'] !== true &&
    context.options.yes !== true
  ) {
    throw new Error(
      'This operation may overwrite an existing app with the same manifest id. Use --yes or --dry-run.',
    );
  }

  const supplied = new Map(
    stringOptions(context.options, 'param').map((entry) => {
      const separator = entry.indexOf('=');
      if (separator < 1) throw new Error(`Invalid --param ${entry}; expected NAME=VALUE`);
      return [entry.slice(0, separator), entry.slice(separator + 1)];
    }),
  );
  const parameterNames = new Set(operation.parameters.map((parameter) => parameter.name));
  const unknownParameter = [...supplied.keys()].find((name) => !parameterNames.has(name));
  if (unknownParameter) {
    throw new Error(
      `Unknown --param ${unknownParameter}. Run \`charming api describe ${operation.id}\`.`,
    );
  }
  let path = operation.path;
  const query = new URLSearchParams();
  const parameterHeaders: Record<string, string> = {};
  for (const parameter of operation.parameters) {
    const value = supplied.get(parameter.name);
    if (parameter.required && value === undefined) {
      throw new Error(`Missing required --param ${parameter.name}=VALUE`);
    }
    if (value === undefined) continue;
    if (parameter.in === 'path') {
      path = path.replace(`{${parameter.name}}`, encodeURIComponent(value));
    } else if (parameter.in === 'query') {
      query.set(parameter.name, value);
    } else if (parameter.in === 'header') {
      parameterHeaders[parameter.name] = value;
    }
  }
  if (query.size > 0) path += `?${query}`;
  const bodyOption = stringOption(context.options, 'body');
  if (operation.requestBody?.required && bodyOption === undefined) {
    throw new Error(`Operation ${operation.id} requires --body JSON|@FILE.`);
  }
  const body = bodyOption ? await readJsonValue(bodyOption) : undefined;
  const file = stringOption(context.options, 'file');
  if (operation.requestBody?.mediaType === 'multipart/form-data' && !file) {
    throw new Error(`Operation ${operation.id} requires --file PATH.`);
  }
  if (file && operation.requestBody?.mediaType !== 'multipart/form-data') {
    throw new Error(`Operation ${operation.id} does not accept --file.`);
  }
  if (context.options['dry-run'] === true && operation.method !== 'GET') {
    return {
      dryRun: true,
      method: operation.method,
      path,
      body: redactDryRunBody(operation.id, body),
    };
  }
  const token =
    context.token ??
    (await loadToken({ baseUrl: context.baseUrl })) ??
    (supplied.get('id')
      ? await loadAppToken(supplied.get('id')!, { baseUrl: context.baseUrl })
      : undefined);
  const rawBody =
    operation.requestBody?.mediaType === 'multipart/form-data' && file
      ? await multipartBody(body, file)
      : undefined;
  return (
    await clientFor(context, token).request(operation.method, path, {
      body: rawBody ? undefined : body,
      headers: Object.fromEntries(
        [
          ...Object.entries(parameterHeaders).map(([name, value]) => `${name}=${value}`),
          ...stringOptions(context.options, 'header'),
        ].map((entry) => {
          const separator = entry.indexOf('=');
          if (separator < 1) throw new Error(`Invalid --header ${entry}; expected NAME=VALUE`);
          return [entry.slice(0, separator), entry.slice(separator + 1)];
        }),
      ),
      rawBody,
      timeoutMs: operation.timeoutMs,
    })
  ).data;
}

function agentContext(baseUrl: string): unknown {
  return {
    schemaVersion: 1,
    cliVersion: CLI_VERSION,
    baseUrl,
    output: {
      format: 'json',
      errors: 'stderr',
      loginInstructions: 'stderr',
      success: 'stdout',
    },
    auth: {
      command: 'charming auth login --no-open',
      environment: ['CHARMING_TOKEN', 'CHARMING_BASE_URL'],
      tokenKinds: ['chrm_user_*', 'chrm_app_*'],
    },
    commands: {
      auth: ['login', 'status', 'logout'],
      apps: ['list', 'create', 'describe', 'source', 'update', 'call', 'delete'],
      generatedApiOperations: operations.length,
      generatedApiIndex: 'charming api list',
    },
    safety: {
      destructiveRequiresYes: true,
      mutationsSupportDryRun: true,
      sourceUpdatesUseEtag: true,
    },
  };
}

async function runDoctor(context: CommandContext): Promise<unknown> {
  const token = context.token ?? (await loadToken({ baseUrl: context.baseUrl }));
  let spec;
  try {
    spec = await clientFor(context).request('GET', '/.well-known/openapi.json', {
      timeoutMs: 2_000,
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Could not reach ${context.baseUrl}: ${detail}. Check --base-url and your network connection.`,
      { cause: error },
    );
  }
  let auth: 'invalid' | 'missing' | 'ok' = 'missing';
  if (token) {
    try {
      await clientFor(context, token).request('GET', '/app?limit=1', { timeoutMs: 2_000 });
      auth = 'ok';
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        auth = 'invalid';
      } else {
        throw error;
      }
    }
  }
  const document = spec.data as {
    info?: { version?: unknown };
    openapi?: unknown;
    paths?: Record<string, Record<string, { operationId?: unknown }>>;
  };
  return {
    api: 'ok',
    apiVersion: document.info?.version ?? null,
    auth,
    baseUrl: context.baseUrl,
    generatedOperations: operations.length,
    liveOperations: Object.values(document.paths ?? {}).reduce(
      (count, path) =>
        count +
        Object.values(path).filter(
          (operation) =>
            operation && typeof operation === 'object' && typeof operation.operationId === 'string',
        ).length,
      0,
    ),
    openapiVersion: document.openapi ?? null,
  };
}

async function multipartBody(body: unknown, filePath: string): Promise<FormData> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Multipart operations require --body with a JSON object.');
  }
  const form = new FormData();
  for (const [key, value] of Object.entries(body)) {
    if (typeof value !== 'string') {
      throw new Error(`Multipart field ${key} must be a string.`);
    }
    form.set(key, value);
  }
  const path = resolve(filePath);
  form.set('file', new File([await readFile(path)], basename(path)));
  return form;
}

function clientFor(context: CommandContext, token?: string): CharmingClient {
  return new CharmingClient({
    baseUrl: context.baseUrl,
    fetchImpl: context.fetchImpl,
    token,
  });
}

async function requireUserToken(context: CommandContext): Promise<string> {
  const token = context.token ?? (await loadToken({ baseUrl: context.baseUrl }));
  if (!token) throw new Error('Not authenticated. Run `charming auth login`.');
  return token;
}

async function tokenForApp(context: CommandContext, appId: string): Promise<string> {
  const token =
    context.token ??
    (await loadToken({ baseUrl: context.baseUrl })) ??
    (await loadAppToken(appId, { baseUrl: context.baseUrl }));
  if (!token) throw new Error('No credential for this app. Run `charming auth login`.');
  return token;
}

async function readBundle(directory: string | undefined, options: Record<string, OptionValue>) {
  return readAppBundle({
    directory,
    module: stringOption(options, 'module'),
    styles: stringOption(options, 'styles'),
    ui: stringOption(options, 'ui'),
  });
}

function validSource(data: SourceResponse): {
  module: string;
  styles?: string | null;
  ui?: string | null;
} {
  if (!data.source || typeof data.source.module !== 'string') {
    throw new Error('Charming returned an invalid app source response');
  }
  return {
    module: data.source.module,
    styles: typeof data.source.styles === 'string' ? data.source.styles : null,
    ui: typeof data.source.ui === 'string' ? data.source.ui : null,
  };
}

function safeCreateResult(data: {
  token?: string;
  [key: string]: unknown;
}): Record<string, unknown> {
  const result = { ...data };
  if (typeof result.token === 'string') {
    delete result.token;
    result.tokenSaved = true;
  }
  const pairing = result.pairing;
  if (pairing && typeof pairing === 'object') {
    const { device_code: _deviceCode, ...safePairing } = pairing as Record<string, unknown>;
    result.pairing = safePairing;
  }
  return result;
}

export function redactSecrets(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(/(?:bld|chrm)_(?:app|pair|render|user)_[A-Za-z0-9_-]{4,}/g, '[redacted]');
  }
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        key === 'device_code' ||
        key.toLowerCase() === 'authorization' ||
        key.toLowerCase() === 'token' ||
        key.toLowerCase().endsWith('_token')
          ? '[redacted]'
          : redactSecrets(item),
      ]),
    );
  }
  return value;
}

function redactDryRunBody(operationId: string, body: unknown): unknown {
  if (!operationId.includes('secret') || !body || typeof body !== 'object') {
    return redactSecrets(body);
  }
  return Object.fromEntries(
    Object.entries(body).map(([key, value]) => [
      key,
      key === 'value' || key.toLowerCase().includes('secret') ? '[redacted]' : redactSecrets(value),
    ]),
  );
}

function openUrl(url: string, baseUrl: string): void {
  if (!isOpenableUrl(url, baseUrl)) return;
  // rundll32 opens the URL directly; it never hands the string to a command
  // shell, so it can't be reinterpreted the way `cmd /c start` can be.
  const [command, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
        : ['xdg-open', [url]];
  const child = spawn(command, args, { detached: true, stdio: 'ignore' });
  child.on('error', () => {});
  child.unref();
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export const CLI_VERSION = '0.1.0';

function command(
  usage: string,
  words: number,
  minPositionals = 0,
  maxPositionals = 0,
  options: readonly string[] = [],
): CommandDefinition {
  return { maxPositionals, minPositionals, options, usage, words };
}

function assertCommandShape(context: CommandContext): void {
  const key =
    context.command[0] === 'doctor' || context.command[0] === 'agent-context'
      ? context.command[0]
      : context.command.slice(0, 2).join(' ');
  const definition = COMMANDS[key];
  if (!definition) throw new Error(`Unknown command: ${context.command.join(' ') || '(none)'}`);

  const positionals = context.command.length - definition.words;
  if (positionals < definition.minPositionals || positionals > definition.maxPositionals) {
    throw new Error(`Usage: ${definition.usage}`);
  }

  const allowed = new Set([...GLOBAL_OPTIONS, ...definition.options]);
  const unknown = Object.keys(context.options).find((option) => !allowed.has(option));
  if (unknown) {
    throw new Error(`Unknown option --${unknown}. Usage: ${definition.usage}`);
  }
}
