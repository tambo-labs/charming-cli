import { existsSync } from 'node:fs';
import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { isIP, type AddressInfo } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readAppBundle } from './files.js';

interface DevAppSource {
  module: string;
  ui?: string;
  styles?: string;
}

interface DevUser {
  id: string;
  handle?: string;
  name?: string;
  image?: string;
}

interface DevHost {
  handle(request: Request): Promise<Response>;
  reload(source: DevAppSource): Promise<void>;
  dumpState(): Promise<Record<string, unknown>>;
  close(): void;
}

interface DevHostModule {
  DEV_APP_ID: string;
  createDevHost(options: {
    source: DevAppSource;
    state?: Record<string, unknown>;
    user?: DevUser | null;
    log?: (line: string) => void;
    onStorageChange?: () => void;
    operationTimeoutMs?: number;
  }): Promise<DevHost>;
}

export interface DevServerOptions {
  directory?: string;
  module?: string;
  ui?: string;
  styles?: string;
  host: string;
  port: number;
  /** JSON file of storage keys and values the App starts with. */
  state?: string;
  /** JSON file the App's storage is written to after each change and on close. */
  saveState?: string;
  /** JSON file with the signed-in user (`id`, optional `handle`, `name`, `image`). */
  user?: string;
  log: (line: string) => void;
  /** How long `close` waits for running requests before stopping anyway. */
  shutdownGraceMs?: number;
  /** Wall-clock limit per operation; the dev host defaults to production's. */
  operationTimeoutMs?: number;
}

export interface DevServer {
  url: string;
  /** The App id the page's API calls use: `<url>/app/<appId>/api/<op>`. */
  appId: string;
  close(): Promise<void>;
}

/** An App or flag problem `charming dev` reports with a stable kind. */
export class DevError extends Error {
  readonly kind: string;

  constructor(kind: string, message: string) {
    super(message);
    this.name = 'DevError';
    this.kind = kind;
  }
}

/** The `DEV_HOST_API_VERSION` the vendored dev host must export. */
export const DEV_HOST_API_VERSION = 1;
const READ_METHODS = new Set(['GET', 'HEAD']);
const SHUTDOWN_GRACE_MS = 5_000;
const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

export async function startDevServer(options: DevServerOptions): Promise<DevServer> {
  const readSource = () =>
    readAppBundle({
      directory: options.directory,
      module: options.module,
      ui: options.ui,
      styles: options.styles,
    });
  const [source, state, user, devHostModule] = await Promise.all([
    readSource(),
    initialState(options),
    options.user ? readUserFile(options.user) : null,
    loadDevHostModule(),
  ]);

  let session: DevSession | undefined;
  const server = createServer((request, response) => {
    if (session) session.accept(request, response);
    else response.writeHead(503).end();
  });
  const binding = bindingFor(await listen(server, options.port, options.host), options.host);
  if (!binding.loopback) {
    options.log(
      `Warning: listening on ${options.host}. Anyone who can reach this address can run the app's operations, and the module runs in this process with your user's access.`,
    );
  }

  const stateFile = new StateFile(options.saveState, options.log);
  let host: DevHost;
  try {
    host = await devHostModule.createDevHost({
      source,
      state,
      user,
      log: options.log,
      onStorageChange: () => {
        stateFile.markChanged();
        session?.storageChangedInBackground();
      },
      operationTimeoutMs: options.operationTimeoutMs,
    });
  } catch (error) {
    await closeServer(server);
    throw devErrorFrom(error);
  }
  try {
    await stateFile.prepare(host);
  } catch (error) {
    host.close();
    await closeServer(server);
    throw new DevError(
      'save_state_failed',
      `Could not write --save-state ${resolve(options.saveState ?? '')}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const active = new DevSession({
    host,
    binding,
    eventsPath: `/app/${devHostModule.DEV_APP_ID}/events`,
    sources: new SourceRefresher(readSource, options.log),
    stateFile,
    shutdownGraceMs: options.shutdownGraceMs ?? SHUTDOWN_GRACE_MS,
    log: options.log,
  });
  session = active;
  return {
    url: binding.url,
    appId: devHostModule.DEV_APP_ID,
    close: () => active.close(server),
  };
}

interface Binding {
  /** The URL the server prints, built from the bound address. */
  url: string;
  port: number;
  /** The `--host` value. */
  host: string;
  loopback: boolean;
}

function bindingFor(address: AddressInfo, host: string): Binding {
  const printed = address.family === 'IPv6' ? `[${address.address}]` : address.address;
  return {
    url: `http://${printed}:${address.port}`,
    port: address.port,
    host,
    loopback: LOOPBACK_HOSTNAMES.has(bracketless(address.address)),
  };
}

interface Refusal {
  status: 400 | 403;
  kind: 'invalid_request' | 'forbidden_host' | 'forbidden_origin';
  message: string;
}

/**
 * The request's URL on the page origin, or the refusal for a request that
 * cannot be parsed or that a DNS-rebinding or cross-site page sent. `Host`
 * must name this server's port and either the bound host, a loopback name, or
 * (for a non-loopback bind) an IP literal; `Origin`, when present, must be
 * that same origin; and an `/app/` request a browser marks as from another
 * site (`Sec-Fetch-Site`) is refused.
 */
function admittedUrl(request: IncomingMessage, binding: Binding): URL | Refusal {
  let host: URL;
  try {
    host = new URL(`http://${request.headers.host ?? ''}`);
  } catch {
    return {
      status: 403,
      kind: 'forbidden_host',
      message: 'The Host header is missing or invalid.',
    };
  }
  const hostname = bracketless(host.hostname.toLowerCase());
  const allowedName =
    hostname === bracketless(binding.host.toLowerCase()) ||
    LOOPBACK_HOSTNAMES.has(hostname) ||
    (!binding.loopback && isIP(hostname) !== 0);
  if (!allowedName || (host.port || '80') !== String(binding.port)) {
    return {
      status: 403,
      kind: 'forbidden_host',
      message: `charming dev answers requests for ${binding.url}, not ${host.host}.`,
    };
  }
  const origin = `http://${host.host}`;
  let url: URL;
  try {
    url = new URL(request.url ?? '/', origin);
  } catch {
    return {
      status: 400,
      kind: 'invalid_request',
      message: 'The request target is not a valid URL.',
    };
  }
  const requestOrigin = request.headers.origin;
  if (requestOrigin !== undefined && requestOrigin !== origin) {
    return {
      status: 403,
      kind: 'forbidden_origin',
      message: `charming dev refuses cross-origin requests from ${requestOrigin}.`,
    };
  }
  const fetchSite = request.headers['sec-fetch-site'];
  const appPath = url.pathname.startsWith('/app/');
  if (appPath && fetchSite !== undefined && fetchSite !== 'same-origin' && fetchSite !== 'none') {
    return {
      status: 403,
      kind: 'forbidden_origin',
      message: `charming dev refuses ${fetchSite} requests to the App API.`,
    };
  }
  return url;
}

/**
 * Re-reads the source before each request and hands it to the dev host, whose
 * reload queue keeps loads in order. A failure is logged once until it changes.
 */
class SourceRefresher {
  private lastFailure: string | undefined;

  constructor(
    private readonly read: () => Promise<DevAppSource>,
    private readonly log: (line: string) => void,
  ) {}

  async refresh(host: DevHost): Promise<void> {
    try {
      await host.reload(await this.read());
      this.lastFailure = undefined;
    } catch (error) {
      const failure = devErrorFrom(error);
      const line = `${failure.kind}: ${failure.message}`;
      if (line !== this.lastFailure) this.log(line);
      this.lastFailure = line;
    }
  }
}

/**
 * The `--save-state` file: written atomically, one write at a time, and only
 * after an operation wrote storage. A failed write is retried after the next
 * change and logged once until it succeeds or fails differently.
 */
class StateFile {
  private pending = Promise.resolve();
  private changed = false;
  private lastFailure: string | undefined;

  constructor(
    private readonly path: string | undefined,
    private readonly log: (line: string) => void,
  ) {}

  /** The dev host reported that an operation wrote storage. */
  markChanged(): void {
    this.changed = true;
  }

  /** Check the file's directory is writable without touching the file. */
  async prepare(host: DevHost): Promise<void> {
    if (!this.path) return;
    const temporary = this.temporaryPath();
    try {
      await writeFile(temporary, await this.serialize(host));
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
  }

  /** Save after a change, logging a failure instead of rejecting. */
  saveIfChanged(host: DevHost): Promise<void> {
    if (!this.changed) return Promise.resolve();
    return this.flush(host).catch((error: unknown) => {
      const line = `Could not write --save-state: ${error instanceof Error ? error.message : String(error)}. Retrying after the next change.`;
      if (line !== this.lastFailure) this.log(line);
      this.lastFailure = line;
    });
  }

  /** Save any unsaved change; rejects when the write fails. */
  flush(host: DevHost): Promise<void> {
    const path = this.path;
    this.pending = this.pending
      .catch(() => undefined)
      .then(async () => {
        if (!path || !this.changed) return;
        this.changed = false;
        const temporary = this.temporaryPath();
        try {
          await writeFile(temporary, await this.serialize(host));
          await rename(temporary, resolve(path));
          this.lastFailure = undefined;
        } catch (error) {
          this.changed = true;
          await unlink(temporary).catch(() => undefined);
          throw error;
        }
      });
    return this.pending;
  }

  private async serialize(host: DevHost): Promise<string> {
    return `${JSON.stringify(await host.dumpState(), null, 2)}\n`;
  }

  private temporaryPath(): string {
    return `${resolve(this.path ?? '')}.${process.pid}.tmp`;
  }
}

/** A running dev host behind the HTTP server: admits, serves, and drains requests. */
class DevSession {
  private closing = false;
  private saveQueued = false;
  private readonly inFlight = new Set<Promise<void>>();

  constructor(
    private readonly parts: {
      host: DevHost;
      binding: Binding;
      eventsPath: string;
      sources: SourceRefresher;
      stateFile: StateFile;
      shutdownGraceMs: number;
      log: (line: string) => void;
    },
  ) {}

  accept(request: IncomingMessage, response: ServerResponse): void {
    if (this.closing) {
      response.writeHead(503).end();
      return;
    }
    const url = admittedUrl(request, this.parts.binding);
    if (!(url instanceof URL)) {
      const { status, ...error } = url;
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ ok: false, error }));
      return;
    }
    const served = this.serve(request, response, url).catch((error: unknown) => {
      if (!isClientDisconnect(error, response)) {
        this.parts.log(`request failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (!response.headersSent) {
        response.writeHead(500, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            ok: false,
            error: { kind: 'operation_failed', message: 'The dev server could not answer.' },
          }),
        );
      } else {
        response.destroy();
      }
    });
    if (url.pathname !== this.parts.eventsPath) {
      this.inFlight.add(served);
      void served.finally(() => this.inFlight.delete(served));
    }
  }

  /**
   * A write with no request in flight comes from an operation already
   * answered (one that timed out), so save it now rather than after the next
   * request. Writes in the same tick share one save.
   */
  storageChangedInBackground(): void {
    if (this.closing || this.inFlight.size > 0 || this.saveQueued) return;
    this.saveQueued = true;
    setTimeout(() => {
      this.saveQueued = false;
      void this.parts.stateFile.saveIfChanged(this.parts.host);
    }, 0);
  }

  async close(server: Server): Promise<void> {
    this.closing = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const grace = new Promise<void>((resolveGrace) => {
      timer = setTimeout(resolveGrace, this.parts.shutdownGraceMs);
    });
    await Promise.race([Promise.allSettled([...this.inFlight]), grace]);
    clearTimeout(timer);
    this.parts.host.close();
    await closeServer(server);
    await this.parts.stateFile.flush(this.parts.host);
  }

  private async serve(
    request: IncomingMessage,
    response: ServerResponse,
    requestUrl: URL,
  ): Promise<void> {
    const { host, eventsPath, sources, stateFile, log } = this.parts;
    const method = (request.method ?? 'GET').toUpperCase();
    if (requestUrl.pathname !== eventsPath) await sources.refresh(host);
    const abort = new AbortController();
    response.on('close', () => abort.abort());
    const answer = await host.handle(
      new Request(requestUrl, {
        method,
        headers: requestHeaders(request),
        body: READ_METHODS.has(method)
          ? undefined
          : (Readable.toWeb(request) as unknown as ReadableStream<Uint8Array>),
        signal: abort.signal,
        duplex: 'half',
      } as RequestInit),
    );
    await stateFile.saveIfChanged(host);
    for (const [name, value] of answer.headers) {
      if (name !== 'set-cookie') response.setHeader(name, value);
    }
    const cookies = answer.headers.getSetCookie();
    if (cookies.length > 0) response.setHeader('set-cookie', cookies);
    response.writeHead(answer.status);
    if (answer.body && method !== 'HEAD') {
      await pipeline(Readable.fromWeb(answer.body as unknown as NodeReadableStream), response);
    } else {
      response.end();
    }
  }
}

function isClientDisconnect(error: unknown, response: ServerResponse): boolean {
  return (
    response.destroyed ||
    (error instanceof Error &&
      'code' in error &&
      (error.code === 'ERR_STREAM_PREMATURE_CLOSE' || error.code === 'ECONNRESET'))
  );
}

async function loadDevHostModule(): Promise<DevHostModule> {
  const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const bundle = join(packageRoot, 'vendor', 'dev-host.js');
  if (!existsSync(bundle)) {
    throw new DevError(
      'dev_host_missing',
      `This copy of the CLI has no local dev host (${bundle}). It ships in CLI releases published after the Charming server release that includes it; upgrade the CLI and retry. In the Charming monorepo, run \`bun run cli:dev-host:gen\`.`,
    );
  }
  let loaded: unknown;
  try {
    loaded = await import(pathToFileURL(bundle).href);
  } catch (error) {
    throw new DevError(
      'dev_host_missing',
      `Could not load the local dev host from ${bundle}: ${error instanceof Error ? error.message : String(error)}. Reinstall the CLI; in the Charming monorepo, run \`bun run cli:dev-host:gen\`.`,
    );
  }
  const api = loaded as Partial<Record<keyof DevHostModule | 'DEV_HOST_API_VERSION', unknown>>;
  if (
    api.DEV_HOST_API_VERSION !== DEV_HOST_API_VERSION ||
    typeof api.createDevHost !== 'function' ||
    typeof api.DEV_APP_ID !== 'string'
  ) {
    const found =
      typeof api.DEV_HOST_API_VERSION === 'number'
        ? `version ${api.DEV_HOST_API_VERSION}`
        : 'no version';
    throw new DevError(
      'dev_host_mismatch',
      `The local dev host in ${bundle} has ${found}, but this CLI needs version ${DEV_HOST_API_VERSION}. The CLI and its vendored dev host come from different releases; upgrade the CLI and retry. In the Charming monorepo, run \`bun run cli:dev-host:gen\`.`,
    );
  }
  return loaded as DevHostModule;
}

/**
 * The storage the session starts with: `--state` when given, else an existing
 * `--save-state` file, so state carries over from the previous session.
 */
async function initialState(
  options: Pick<DevServerOptions, 'state' | 'saveState' | 'log'>,
): Promise<Record<string, unknown> | undefined> {
  const saved =
    options.saveState && existsSync(resolve(options.saveState))
      ? await readStateFile(options.saveState, '--save-state')
      : undefined;
  if (!options.state) return saved;
  if (saved && options.saveState) {
    options.log(
      `--state seeds storage, so the first write replaces ${resolve(options.saveState)}. To resume from that file instead, drop --state.`,
    );
  }
  return readStateFile(options.state, '--state');
}

async function readStateFile(path: string, flag: string): Promise<Record<string, unknown>> {
  const value = await readJsonFile(path, flag);
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new DevError(
      'invalid_state',
      `${flag} ${path} must hold a JSON object of storage keys to values.`,
    );
  }
  return value as Record<string, unknown>;
}

async function readUserFile(path: string): Promise<DevUser> {
  const value = await readJsonFile(path, '--user');
  const user = value as Partial<Record<keyof DevUser, unknown>> | null;
  const optional = ['handle', 'name', 'image'] as const;
  if (
    typeof user !== 'object' ||
    user === null ||
    typeof user.id !== 'string' ||
    user.id.length === 0 ||
    optional.some((key) => user[key] !== undefined && typeof user[key] !== 'string')
  ) {
    throw new DevError(
      'invalid_user',
      `--user ${path} must hold {"id": string, "handle"?: string, "name"?: string, "image"?: string}.`,
    );
  }
  return {
    id: user.id,
    ...Object.fromEntries(
      optional.flatMap((key) => (user[key] === undefined ? [] : [[key, user[key]]])),
    ),
  };
}

async function readJsonFile(path: string, flag: string): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(resolve(path), 'utf8');
  } catch {
    throw new DevError('file_not_found', `Could not read ${flag} file: ${resolve(path)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new DevError('invalid_json', `${flag} file ${resolve(path)} is not valid JSON.`);
  }
}

function devErrorFrom(error: unknown): DevError {
  if (error instanceof DevError) return error;
  if (error instanceof Error && 'kind' in error && typeof error.kind === 'string') {
    return new DevError(error.kind, error.message);
  }
  return new DevError('cli_error', error instanceof Error ? error.message : String(error));
}

function requestHeaders(request: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) headers.append(name, item);
  }
  return headers;
}

function listen(server: Server, port: number, host: string): Promise<AddressInfo> {
  return new Promise((resolveListen, reject) => {
    server.once('error', (error: NodeJS.ErrnoException) => {
      reject(
        error.code === 'EADDRINUSE'
          ? new DevError(
              'port_in_use',
              `Port ${port} on ${host} is in use. Pass --port 0 for any free port.`,
            )
          : error,
      );
    });
    server.listen(port, host, () => resolveListen(server.address() as AddressInfo));
  });
}

function closeServer(server: Server): Promise<void> {
  server.closeAllConnections();
  return new Promise((resolveClose) => server.close(() => resolveClose()));
}

function bracketless(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
}
