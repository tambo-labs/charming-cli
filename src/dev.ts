import { existsSync, watch, type FSWatcher } from 'node:fs';
import { readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { isIP, type AddressInfo } from 'node:net';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readAppBundle, readAppPackage } from './files.js';

/** A package App's file tree, or an App saved before packages as its three sources. */
type DevAppSource =
  | { files: Record<string, string> }
  | { module: string; ui?: string; styles?: string };

interface DevUser {
  id: string;
  handle?: string;
  name?: string;
  image?: string;
  email?: string;
  emailVerified?: boolean;
}

/** An embed-breaker `--check` reports; the dev host owns the rules. */
export interface CheckFinding {
  rule: string;
  path: string;
  line?: number;
  message: string;
}

interface DevHost {
  handle(request: Request): Promise<Response>;
  runOperation(op: string, input: unknown, origin: string): Promise<Response>;
  check(renderedHtml: string | null, pageOrigin: string): CheckFinding[];
  reload(source: DevAppSource): Promise<void>;
  dumpState(): Promise<Record<string, unknown>>;
  close(): void;
}

/** The share role `--as` names; the dev host maps each to the server's capability bundle. */
export const DEV_ROLES = ['owner', 'builder', 'editor', 'viewer'] as const;
type DevRole = (typeof DEV_ROLES)[number];

interface DevAssetSeed {
  key: string;
  bytes: Uint8Array;
  contentType: string;
}

interface DevHostModule {
  DEV_APP_ID: string;
  DEV_PANEL_PATH: string;
  DEV_STREAM_PATHS: readonly string[];
  createDevHost(options: {
    source: DevAppSource;
    assets?: DevAssetSeed[];
    role?: DevRole;
    fetchFixtures?: Record<string, unknown>;
    fetchAllow?: string[];
    secrets?: Record<string, string>;
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
  /** JSON file with the signed-in user (`id`, optional `handle`, `name`, `image`, `email`, `emailVerified`). */
  user?: string;
  /** The caller's role on the App. Defaults to owner. */
  role?: DevRole;
  /** Operations to run once at startup, as a Routine runs them: empty input, owner authority. */
  runOp?: string[];
  /** JSON file of canned outbound responses keyed by `[METHOD ]<origin><path>`. */
  fetch?: string;
  /** HTTPS origins the App may fetch beyond those it declares. */
  fetchAllow?: string[];
  /** `NAME=value` pairs, or `NAME` to read the value from the environment, for sealed fetch. */
  secret?: string[];
  log: (line: string) => void;
  /** How long `close` waits for running requests before stopping anyway. */
  shutdownGraceMs?: number;
  /** Wall-clock limit per operation; the dev host defaults to production's. */
  operationTimeoutMs?: number;
}

export interface DevServer {
  url: string;
  /** The dev panel: every operation with a Run button, and the call log. */
  panelUrl: string;
  /** The App id the page's API calls use: `<url>/app/<appId>/api/<op>`. */
  appId: string;
  /** The embed-breakers in the App's browser-side source and the given rendered markup. */
  check(renderedHtml: string | null): CheckFinding[];
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
export const DEV_HOST_API_VERSION = 3;
const READ_METHODS = new Set(['GET', 'HEAD']);
const SHUTDOWN_GRACE_MS = 5_000;
const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

/** Whether `--host` names a loopback interface, reachable from this machine only. */
export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTNAMES.has(bracketless(host));
}

export async function startDevServer(options: DevServerOptions): Promise<DevServer> {
  const readSource = (): Promise<DevAppSource> =>
    isPackageSource(options)
      ? readAppPackage(options.directory ?? '.').then((files) => ({ files }))
      : readAppBundle({
          directory: options.directory,
          module: options.module,
          ui: options.ui,
          styles: options.styles,
        });
  const [source, state, user, assets, fetchFixtures, devHostModule] = await Promise.all([
    readSource(),
    initialState(options),
    options.user ? readUserFile(options.user) : null,
    readAssetSeeds(assetsDirectory(options)),
    options.fetch ? readFetchFixtures(options.fetch) : undefined,
    loadDevHostModule(),
  ]);
  const fetchAllow = (options.fetchAllow ?? []).map(httpsOrigin);
  const secrets = parseSecrets(options.secret ?? []);
  if (fetchAllow.length > 0) {
    options.log(
      `--fetch-allow lets the app reach ${fetchAllow.join(', ')}. Charming refuses these until the app declares them in its fetch permissions.`,
    );
  }

  let session: DevSession | undefined;
  const server = createServer((request, response) => {
    if (session) session.accept(request, response);
    else response.writeHead(503).end();
  });
  const binding = bindingFor(await listen(server, options.port, options.host), options.host);
  if (!binding.loopback) {
    options.log(
      `Warning: listening on ${options.host}. Anyone who can reach this address can run the app's operations, including from the dev panel with owner authority whatever --as says, and the module runs in this process with your user's access.`,
    );
  }

  const stateFile = new StateFile(options.saveState, options.log);
  let host: DevHost;
  try {
    host = await devHostModule.createDevHost({
      source,
      assets,
      role: options.role,
      fetchFixtures,
      fetchAllow,
      secrets,
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
    streamPaths: new Set(devHostModule.DEV_STREAM_PATHS),
    sources: new SourceRefresher(readSource, options.log),
    stateFile,
    shutdownGraceMs: options.shutdownGraceMs ?? SHUTDOWN_GRACE_MS,
    log: options.log,
  });
  session = active;
  for (const op of options.runOp ?? []) {
    const response = await host.runOperation(op, {}, binding.url);
    if (response.ok) continue;
    const error = errorBody(await response.json().catch(() => null));
    // An App's own handler may answer 404 or 422 on purpose, even with
    // operation_not_found; only a name missing from the declared operations
    // means the flag was wrong. Any other failure is logged, as a Routine
    // tick's would be.
    if (error.kind !== 'operation_not_found' || !error.knownOps || error.knownOps.includes(op)) {
      continue;
    }
    await active.close(server);
    throw new DevError(
      'operation_not_found',
      `--run-op ${op}: ${error.message ?? `the dev host answered ${response.status}`} Declared operations: ${error.knownOps.join(', ')}.`,
    );
  }
  const watcher = watchSources(options, () => active.refresh());
  return {
    url: binding.url,
    panelUrl: `${binding.url}${devHostModule.DEV_PANEL_PATH}`,
    appId: devHostModule.DEV_APP_ID,
    check: (renderedHtml) => host.check(renderedHtml, new URL(binding.url).origin),
    close: async () => {
      watcher.close();
      await active.close(server);
    },
  };
}

const WATCH_DEBOUNCE_MS = 50;

/**
 * Watch the App's source for edits. A change anywhere under a package App's
 * directory, or to a file directly in the directory an App saved before
 * packages is read from or a file `--module`, `--ui`, or `--styles` names,
 * re-reads the source after a short pause, so a save of several files reloads
 * once. Hidden files, `node_modules`, and the state files `charming dev`
 * writes are ignored.
 */
export function watchSources(
  options: Pick<
    DevServerOptions,
    'directory' | 'module' | 'ui' | 'styles' | 'state' | 'saveState' | 'log'
  >,
  onChange: () => void,
): { close(): void } {
  const sources = [options.module, options.ui, options.styles];
  const named = sources
    .filter((path): path is string => path !== undefined)
    .map((path) => dirname(resolve(path)));
  // A source file no flag names is read from the directory, or the working directory.
  const readsDirectory = options.directory !== undefined || sources.includes(undefined);
  const roots = [
    ...new Set([...(readsDirectory ? [resolve(options.directory ?? '.')] : []), ...named]),
  ];
  const ignored = [options.saveState, options.state]
    .filter((path) => path !== undefined)
    .map((path) => resolve(path));
  /** A source edit, not a state file, a hidden file, or a dependency. */
  const isWatched = (root: string, file: string) => {
    const path = resolve(root, file);
    if (ignored.some((state) => path === state || path === stateTemporaryPath(state))) return false;
    const parts = relative(root, path).split(sep);
    return !parts.some((part) => part.startsWith('.') || part === 'node_modules');
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const watchers: FSWatcher[] = [];
  const warnUnwatched = (root: string, error: unknown) => {
    options.log(
      `Could not watch ${root} for changes (${error instanceof Error ? error.message : String(error)}); reload the page to pick up edits.`,
    );
  };
  // An App saved before packages reads only the top-level files of its directories.
  const recursive = isPackageSource(options);
  for (const root of roots) {
    try {
      const watcher = watch(root, { recursive }, (_event, file) => {
        if (file === null || !isWatched(root, file)) return;
        clearTimeout(timer);
        timer = setTimeout(onChange, WATCH_DEBOUNCE_MS);
      });
      watcher.on('error', (error) => {
        warnUnwatched(root, error);
        watcher.close();
      });
      watchers.push(watcher);
    } catch (error) {
      warnUnwatched(root, error);
    }
  }
  return {
    close() {
      clearTimeout(timer);
      for (const watcher of watchers) watcher.close();
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The fields of a dev host error body `--run-op` reads, each checked before use. */
function errorBody(body: unknown): { kind?: string; message?: string; knownOps?: string[] } {
  const error = isRecord(body) && isRecord(body.error) ? body.error : {};
  return {
    ...(typeof error.kind === 'string' ? { kind: error.kind } : {}),
    ...(typeof error.message === 'string' ? { message: error.message } : {}),
    ...(Array.isArray(error.knownOps) && error.knownOps.every((op) => typeof op === 'string')
      ? { knownOps: error.knownOps }
      : {}),
  };
}

/**
 * A directory with a package.json is a package App. `--module`, `--ui`, and
 * `--styles` name the sources of an App saved before packages.
 */
function isPackageSource(
  options: Pick<DevServerOptions, 'directory' | 'module' | 'ui' | 'styles'>,
): boolean {
  if (options.module || options.ui || options.styles) return false;
  return existsSync(join(resolve(options.directory ?? '.'), 'package.json'));
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
    loopback: isLoopbackHost(address.address),
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
  private readonly read: () => Promise<DevAppSource>;
  private readonly log: (line: string) => void;

  constructor(read: () => Promise<DevAppSource>, log: (line: string) => void) {
    this.read = read;
    this.log = log;
  }

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
  private readonly path: string | undefined;
  private readonly log: (line: string) => void;

  constructor(path: string | undefined, log: (line: string) => void) {
    this.path = path;
    this.log = log;
  }

  /** The dev host reported that an operation wrote storage. */
  markChanged(): void {
    this.changed = true;
  }

  /** Check the file's directory is writable without touching the file. */
  async prepare(host: DevHost): Promise<void> {
    if (!this.path) return;
    const temporary = stateTemporaryPath(this.path);
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
        const temporary = stateTemporaryPath(path);
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
}

/** Where this process writes a state file before renaming it into place. */
function stateTemporaryPath(path: string): string {
  return `${resolve(path)}.${process.pid}.tmp`;
}

interface DevSessionParts {
  host: DevHost;
  binding: Binding;
  /** Long-lived event streams: never waited for on close, never a reason to re-read the source. */
  streamPaths: ReadonlySet<string>;
  sources: SourceRefresher;
  stateFile: StateFile;
  shutdownGraceMs: number;
  log: (line: string) => void;
}

/** A running dev host behind the HTTP server: admits, serves, and drains requests. */
class DevSession {
  private closing = false;
  private saveQueued = false;
  private readonly inFlight = new Set<Promise<void>>();
  /** Refreshes the watcher started; kept apart so they do not hold back a background save. */
  private readonly refreshes = new Set<Promise<void>>();

  private readonly parts: DevSessionParts;

  constructor(parts: DevSessionParts) {
    this.parts = parts;
  }

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
    if (!this.parts.streamPaths.has(url.pathname)) {
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

  /**
   * Re-read the source after a file changed; an open page reloads when the
   * App does. Close waits for a running refresh, and none starts once it begins.
   */
  refresh(): void {
    if (this.closing) return;
    const refreshed = this.parts.sources.refresh(this.parts.host);
    this.refreshes.add(refreshed);
    void refreshed.finally(() => this.refreshes.delete(refreshed));
  }

  async close(server: Server): Promise<void> {
    this.closing = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const grace = new Promise<void>((resolveGrace) => {
      timer = setTimeout(resolveGrace, this.parts.shutdownGraceMs);
    });
    await Promise.race([Promise.allSettled([...this.inFlight, ...this.refreshes]), grace]);
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
    const { host, streamPaths, sources, stateFile, log } = this.parts;
    const method = (request.method ?? 'GET').toUpperCase();
    if (!streamPaths.has(requestUrl.pathname)) await sources.refresh(host);
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
    typeof api.DEV_APP_ID !== 'string' ||
    typeof api.DEV_PANEL_PATH !== 'string' ||
    !Array.isArray(api.DEV_STREAM_PATHS) ||
    !api.DEV_STREAM_PATHS.every((path) => typeof path === 'string')
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

/** `assets/` beside the source: in the App directory, or beside the file `--module` names. */
function assetsDirectory(options: DevServerOptions): string {
  const base = options.directory ?? (options.module ? dirname(resolve(options.module)) : '.');
  return resolve(base, 'assets');
}

/** Content types by extension for `./assets`; the dev host refuses any the server would. */
const ASSET_CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.avif': 'image/avif',
  '.css': 'text/css',
  '.csv': 'text/csv',
  '.gif': 'image/gif',
  '.html': 'text/html',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.md': 'text/markdown',
  '.mjs': 'text/javascript',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.ogg': 'audio/ogg',
  '.otf': 'font/otf',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain',
  '.wav': 'audio/wav',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

/**
 * The files in `assets/` beside the source, each stored under its file name
 * as the App's asset store holds an upload, read once at startup. A symlink
 * is followed. Asset keys have no `/`, so a nested directory is refused.
 */
async function readAssetSeeds(directory: string): Promise<DevAssetSeed[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const seeds: DevAssetSeed[] = [];
  for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (entry.name.startsWith('.')) continue;
    const path = join(directory, entry.name);
    const kind = entry.isSymbolicLink() ? await stat(path).catch(() => null) : entry;
    if (kind?.isDirectory()) {
      throw new DevError(
        'invalid_asset',
        `${join(directory, entry.name)} is a directory. Asset keys have no "/", so keep every asset directly in ${directory}.`,
      );
    }
    if (!kind?.isFile()) continue;
    seeds.push({
      key: entry.name,
      bytes: new Uint8Array(await readFile(path)),
      contentType:
        ASSET_CONTENT_TYPES[extname(entry.name).toLowerCase()] ?? 'application/octet-stream',
    });
  }
  return seeds;
}

const FIXTURE_KEY = /^(?:([A-Za-z]+) )?(\S+)$/;
const NULL_BODY_STATUSES = new Set([204, 205, 304]);

/**
 * Read `--fetch` and check every fixture now, so a mistake fails at startup
 * instead of during an operation or by silently reaching the network. Each
 * key is normalized to the `[METHOD ]<origin><path>` form the dev host
 * matches, so `https://API.test:443/items` and `https://api.test/items` agree.
 */
async function readFetchFixtures(path: string): Promise<Record<string, unknown>> {
  const value = await readJsonFile(path, '--fetch');
  const refuse = (detail: string) =>
    new DevError(
      'invalid_fetch_fixtures',
      `--fetch ${path}: ${detail} The file maps "[METHOD ]<origin><path>" keys to {"status"?, "headers"?, "body"? | "json"?} objects.`,
    );
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw refuse('it is not a JSON object.');
  }
  const fixtures: Record<string, unknown> = {};
  for (const [key, fixture] of Object.entries(value)) {
    const match = FIXTURE_KEY.exec(key);
    let url: URL | undefined;
    try {
      url = match ? new URL(match[2]) : undefined;
    } catch {
      url = undefined;
    }
    if (!match || !url || (url.protocol !== 'https:' && url.protocol !== 'http:')) {
      throw refuse(`"${key}" is not an optional method and an http(s) URL.`);
    }
    if (typeof fixture !== 'object' || fixture === null || Array.isArray(fixture)) {
      throw refuse(`"${key}" is not an object.`);
    }
    const { status, headers, body, json } = fixture as Record<string, unknown>;
    if (
      status !== undefined &&
      (!Number.isInteger(status) || (status as number) < 200 || (status as number) > 599)
    ) {
      throw refuse(`"${key}" has a status that is not an integer from 200 to 599.`);
    }
    if (
      headers !== undefined &&
      (typeof headers !== 'object' ||
        headers === null ||
        Array.isArray(headers) ||
        !Object.values(headers).every((header) => typeof header === 'string'))
    ) {
      throw refuse(`"${key}" has headers that are not an object of strings.`);
    }
    if (body !== undefined && typeof body !== 'string') {
      throw refuse(`"${key}" has a body that is not a string; use "json" for a JSON value.`);
    }
    if (body !== undefined && json !== undefined) {
      throw refuse(`"${key}" has both "body" and "json"; give one.`);
    }
    if ((body !== undefined || json !== undefined) && NULL_BODY_STATUSES.has(status as number)) {
      throw refuse(`"${key}" has a body, but status ${String(status)} carries none.`);
    }
    const method = match[1] ? `${match[1].toUpperCase()} ` : '';
    fixtures[`${method}${url.origin}${url.pathname}`] = fixture;
  }
  return fixtures;
}

function httpsOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new DevError('invalid_fetch_allow', `--fetch-allow ${value} is not a URL.`);
  }
  const bare = url.pathname === '/' && !url.search && !url.hash && !url.username && !url.password;
  if (url.protocol !== 'https:' || !bare) {
    throw new DevError(
      'invalid_fetch_allow',
      `--fetch-allow ${value} must be an HTTPS origin such as https://api.example.com, with no path.`,
    );
  }
  return url.origin;
}

const SECRET_NAME = /^[A-Z][A-Z0-9_]*$/;

/** `NAME=value`, or `NAME` alone to read the value from the environment so it stays out of shell history. */
export function parseSecrets(pairs: readonly string[]): Record<string, string> {
  const secrets: Record<string, string> = {};
  for (const pair of pairs) {
    const separator = pair.indexOf('=');
    const name = separator === -1 ? pair : pair.slice(0, separator);
    if (!SECRET_NAME.test(name)) {
      throw new DevError(
        'invalid_secret',
        '--secret takes NAME=value or NAME; names match [A-Z][A-Z0-9_]*.',
      );
    }
    const value = separator === -1 ? process.env[name] : pair.slice(separator + 1);
    if (value === '' && separator !== -1) {
      throw new DevError(
        'invalid_secret',
        '--secret NAME=value has an empty value; pass a value after "=".',
      );
    }
    if (!value) {
      throw new DevError(
        'invalid_secret',
        `--secret ${name} has no value: pass ${name}=value or set ${name} in the environment.`,
      );
    }
    secrets[name] = value;
  }
  return secrets;
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
  const optional = ['handle', 'name', 'image', 'email'] as const;
  if (
    typeof user !== 'object' ||
    user === null ||
    typeof user.id !== 'string' ||
    user.id.length === 0 ||
    optional.some((key) => user[key] !== undefined && typeof user[key] !== 'string') ||
    (user.emailVerified !== undefined && typeof user.emailVerified !== 'boolean')
  ) {
    throw new DevError(
      'invalid_user',
      `--user ${path} must hold {"id": string, "handle"?: string, "name"?: string, "image"?: string, "email"?: string, "emailVerified"?: boolean}.`,
    );
  }
  return {
    id: user.id,
    ...Object.fromEntries(
      optional.flatMap((key) => (user[key] === undefined ? [] : [[key, user[key]]])),
    ),
    ...(user.emailVerified === undefined ? {} : { emailVerified: user.emailVerified }),
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
