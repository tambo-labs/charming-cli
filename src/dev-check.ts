import { get } from 'node:http';

import type { CheckFinding, DevServer } from './dev.js';

/** What `charming dev --check` prints. Agents parse it; add fields, never rename them. */
export interface CheckReport {
  /** False when the page threw, rendered nothing, or a click failed. Findings do not fail the check. */
  ok: boolean;
  render: { ms: number; empty: boolean };
  /**
   * `page` is thrown or logged by the page, or thrown by the headless browser
   * for the page's code; `host` is thrown in this process outside the page, by
   * the App's server code, the dev host, or the headless browser itself;
   * `operation` and `runtime` are failures the dev host logged, and
   * `operation` is also a request to the dev server still running when the
   * check ended, more than REQUEST_TIMEOUT_MS after it started.
   */
  errors: Array<{ source: 'page' | 'runtime' | 'operation' | 'host'; message: string }>;
  clicks: Array<{ selector: string; ok: boolean; message?: string }>;
  findings: CheckFinding[];
}

const RENDER_TIMEOUT_MS = 5_000;
const PAGE_READ_TIMEOUT_MS = 10_000;
/**
 * A settle waits up to TASKS_TIMEOUT_MS for happy-dom's timers and requests,
 * which a runtime timer can hold open, then until the page stays quiet for
 * QUIET_MS, up to QUIET_TIMEOUT_MS. At that cap it still waits for each
 * request already in flight, until it ends or has run REQUEST_TIMEOUT_MS.
 */
const TASKS_TIMEOUT_MS = 2_000;
const QUIET_MS = 250;
const QUIET_TIMEOUT_MS = 3_000;
const REQUEST_TIMEOUT_MS = 5_000;
const POLL_MS = 50;

/** Dev host log lines where an operation failed or broke its output schema. */
const OPERATION_FAILURE_LINE = /^(?:operation_failed|invalid_output) for /;

/** Dev host log lines where the runtime reported a failure from the page. */
const RUNTIME_REPORT_LINE = /^browser (?:diag|load-error)\/report: /;

/**
 * The page as the dev server serves it. The dev host has replaced this
 * process's global fetch with the App's outbound policy, so read it over
 * plain HTTP.
 */
function readPage(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = get(url, (response) => {
      let body = '';
      response.setEncoding('utf8').on('data', (chunk: string) => (body += chunk));
      response.on('end', () => resolve(body));
    });
    request.setTimeout(PAGE_READ_TIMEOUT_MS, () =>
      request.destroy(
        new Error(`The dev server did not serve the page within ${PAGE_READ_TIMEOUT_MS}ms.`),
      ),
    );
    request.on('error', reject);
  });
}

/**
 * The exceptions and rejections that reach this process uncaught, from the
 * App's server code, the dev host, the headless browser, or the page.
 * `charming dev --check` starts recording before the dev server starts, so a
 * throw from the server code at startup lands in the report too.
 */
export interface ProcessFailures {
  readonly raised: ReadonlyArray<{ reason: unknown; uncaught: 'exception' | 'rejection' }>;
  /** Detach the listeners. */
  stop(): void;
}

export function recordProcessFailures(): ProcessFailures {
  const raised: Array<{ reason: unknown; uncaught: 'exception' | 'rejection' }> = [];
  const onRejection = (reason: unknown) => raised.push({ reason, uncaught: 'rejection' });
  const onException = (reason: unknown) => raised.push({ reason, uncaught: 'exception' });
  process.on('unhandledRejection', onRejection);
  process.on('uncaughtException', onException);
  return {
    raised,
    stop() {
      process.off('unhandledRejection', onRejection);
      process.off('uncaughtException', onException);
    },
  };
}

/**
 * Who raised `reason`. An Error from the page's realm is not an instance of
 * this realm's Error, while the App's server code and the dev host throw this
 * realm's. happy-dom builds the errors it throws for the page's calls, such as
 * a DOMException, in this realm too, so those count as the page's when
 * happy-dom's own class or a stack frame of the page marks them.
 */
function sourceOf(
  reason: unknown,
  otherwise: 'page' | 'host',
  page: { url: string; DOMException: abstract new (...args: never[]) => unknown },
): 'page' | 'host' {
  if (reason instanceof page.DOMException) return 'page';
  if (reason instanceof Error) {
    const frames = (reason.stack ?? '').split('\n').filter((line) => /^\s+at /.test(line));
    return frames.some((frame) => frame.includes(page.url)) ? 'page' : 'host';
  }
  return typeof reason === 'object' && reason !== null ? 'page' : otherwise;
}

function reasonText(reason: unknown): string {
  if (typeof reason === 'object' && reason !== null && 'message' in reason) {
    if (typeof reason.message === 'string') return reason.message;
  }
  if (typeof reason === 'string') return reason;
  return JSON.stringify(reason) ?? 'undefined';
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** A `<script>` that ends in a `//` comment swallows happy-dom's closing wrapper, so end each with a newline. */
function terminateTrailingComments(html: string): string {
  return html.replace(/(\/\/[^\n<]*)<\/script>/g, '$1\n</script>');
}

/**
 * Render the App page served at `server.url` in happy-dom, with no browser:
 * the production runtime and the App's ui run, operations reach the local
 * dev host, and every other origin answers empty. Then run each click, and
 * report thrown errors, an empty render, and the dev host's embed-breaker
 * findings. `logLines` reads the dev host log, so the check counts the
 * failures it logged during the run.
 */
export async function checkApp(
  server: DevServer,
  options: {
    clicks: readonly string[];
    /** The dev host log since before the dev server started, so `--run-op` failures count. */
    logLines: readonly string[];
    failures: ProcessFailures;
  },
): Promise<CheckReport> {
  const { failures } = options;
  const { Browser, DOMException, VirtualConsoleLogLevelEnum } = await import('happy-dom');
  const beforePage = failures.raised.length;
  const pageRealm = { url: `${server.url}/`, DOMException };
  const errors: CheckReport['errors'] = [];
  const addError = (source: CheckReport['errors'][number]['source'], message: string) => {
    if (!errors.some((error) => error.source === source && error.message === message)) {
      errors.push({ source, message });
    }
  };
  const pageError = (message: string) => addError('page', message);
  const local = (url: string) => url.startsWith(`${server.url}/`);
  // happy-dom skips afterAsyncResponse for a request that aborts, so an
  // aborted request leaves the set on its signal instead.
  const inFlight = new Map<{ readonly url: string }, number>();
  const browser = new Browser({
    settings: {
      enableJavaScriptEvaluation: true,
      suppressInsecureJavaScriptEnvironmentWarning: true,
      disableJavaScriptFileLoading: true,
      disableCSSFileLoading: true,
      handleDisabledFileLoadingAsSuccess: true,
      fetch: {
        interceptor: {
          beforeAsyncRequest: async ({ request, window }) => {
            if (!local(request.url)) return new window.Response('', { status: 200 });
            inFlight.set(request, performance.now());
            request.signal.addEventListener('abort', () => inFlight.delete(request));
            return undefined;
          },
          afterAsyncResponse: async ({ request }) => {
            inFlight.delete(request);
          },
          beforeSyncRequest: ({ request, window }) =>
            local(request.url)
              ? undefined
              : {
                  status: 200,
                  statusText: 'OK',
                  ok: true,
                  url: request.url,
                  redirected: false,
                  headers: new window.Headers(),
                  body: Buffer.alloc(0),
                },
        },
      },
    },
  });
  let observed: Pick<CheckReport, 'render' | 'clicks' | 'findings'>;
  let beforeClose = Number.POSITIVE_INFINITY;
  try {
    const page = browser.newPage();
    const window = page.mainFrame.window;
    window.addEventListener('error', (event) => {
      const { error, message } = event as unknown as { error?: unknown; message?: string };
      pageError(
        error != null
          ? reasonText(error)
          : message || 'The page dispatched an error event with no message.',
      );
    });
    window.addEventListener('unhandledrejection', (event) => {
      const reason = (event as unknown as { reason?: unknown }).reason;
      pageError(reasonText(reason));
    });

    const html = await readPage(`${server.url}/`);
    const started = performance.now();
    page.url = `${server.url}/`;
    page.content = terminateTrailingComments(html);

    const app = () => page.mainFrame.document.querySelector('#app');
    const failureLines = () =>
      options.logLines.filter(
        (line) => OPERATION_FAILURE_LINE.test(line) || RUNTIME_REPORT_LINE.test(line),
      ).length;
    /**
     * Wait for the page's pending tasks, then until no request to the dev
     * server is in flight and the DOM and the dev host's failure lines stay
     * unchanged for QUIET_MS. An async click handler or a late operation
     * failure then lands before the next click or the report. A poll's
     * success lines do not count, so an App that polls can still go quiet,
     * and one that never does stops at the cap.
     */
    const settle = async () => {
      const completed = await Promise.race([
        page.waitUntilComplete().then(() => true),
        delay(TASKS_TIMEOUT_MS).then(() => false),
      ]);
      // A request that errors leaves no trace, but none is in flight once every task is done.
      if (completed) inFlight.clear();
      const deadline = performance.now() + QUIET_TIMEOUT_MS;
      let snapshot = '';
      let quietSince = performance.now();
      for (;;) {
        const now = performance.now();
        const current = `${failureLines()}|${page.mainFrame.document.body?.innerHTML ?? ''}`;
        if (inFlight.size > 0 || current !== snapshot) {
          snapshot = current;
          quietSince = now;
        } else if (now - quietSince >= QUIET_MS) {
          return;
        }
        const waiting = [...inFlight.values()].some(
          (started) => started < deadline && now - started < REQUEST_TIMEOUT_MS,
        );
        if (now >= deadline && !waiting) return;
        await delay(POLL_MS);
      }
    };
    for (let waited = 0; waited < RENDER_TIMEOUT_MS && !app()?.children.length; waited += POLL_MS) {
      await delay(POLL_MS);
    }
    const render = { ms: Math.round(performance.now() - started), empty: !app()?.children.length };
    await settle();

    const clicks: CheckReport['clicks'] = [];
    for (const selector of options.clicks) {
      let target;
      try {
        target = page.mainFrame.document.querySelector(selector);
      } catch (error) {
        clicks.push({ selector, ok: false, message: `Invalid selector: ${reasonText(error)}` });
        continue;
      }
      if (!target) {
        clicks.push({ selector, ok: false, message: 'No element matches the selector.' });
        continue;
      }
      (target as unknown as { click(): void }).click();
      await settle();
      clicks.push({ selector, ok: true });
    }

    const ended = performance.now();
    for (const [request, started] of inFlight) {
      if (ended - started < REQUEST_TIMEOUT_MS) continue;
      addError(
        'operation',
        `${new URL(request.url).pathname} was still running when the check ended, more than ${REQUEST_TIMEOUT_MS}ms after it started, so whether it fails is unknown.`,
      );
    }
    for (const entry of page.virtualConsolePrinter.read()) {
      if (entry.level !== VirtualConsoleLogLevelEnum.error) continue;
      pageError(entry.message.map(String).join(' '));
    }
    observed = { render, clicks, findings: server.check(app()?.innerHTML ?? null) };
  } finally {
    beforeClose = failures.raised.length;
    await browser.close();
  }

  // A rejection the page leaves unhandled, such as an operation that failed
  // inside a click handler, surfaces on this process rather than the page,
  // beside those of the App's server code. One raised before the page
  // existed, or by the server code while the browser closed, is counted too.
  // Closing aborts the page's requests still in flight, such as a poll, so
  // what the page raises then is the check's doing and is skipped.
  failures.raised.forEach(({ reason, uncaught }, index) => {
    const source =
      index < beforePage
        ? 'host'
        : sourceOf(reason, uncaught === 'rejection' ? 'page' : 'host', pageRealm);
    if (index >= beforeClose && source === 'page') return;
    addError(source, reasonText(reason));
  });
  for (const line of options.logLines) {
    if (OPERATION_FAILURE_LINE.test(line)) {
      addError('operation', line.split('\n', 1)[0].replace(/ \([0-9a-f-]{36}\)/, ''));
    } else if (RUNTIME_REPORT_LINE.test(line)) {
      addError('runtime', line);
    }
  }
  const { render, clicks, findings } = observed;
  return {
    ok: errors.length === 0 && !render.empty && clicks.every((click) => click.ok),
    render,
    errors,
    clicks,
    findings,
  };
}
