export type RequestOptions = {
  body?: unknown;
  headers?: Record<string, string>;
  rawBody?: BodyInit;
  timeoutMs?: number;
};

export type ClientOptions = {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  token?: string;
};

type ErrorBody = {
  error?: {
    kind?: string;
    message?: string;
    reason?: string;
    recovery?: unknown;
  };
  // A handful of internal routes (e.g. `/account/apps/:id/name`) reply with a
  // flat `{ ok: false, reason, message }` envelope instead of the standard
  // `{ error: { kind, message } }` one from `jsonError`. Fall back to these so
  // the CLI still surfaces a real reason instead of a generic HTTP-status message.
  message?: string;
  reason?: string;
};

export class ApiError extends Error {
  readonly body: unknown;
  readonly kind: string;
  readonly recovery: unknown;
  readonly status: number;

  constructor(status: number, body: unknown) {
    const parsed = body as ErrorBody | null;
    const error = parsed?.error;
    super(
      error?.message ??
        (typeof parsed?.message === 'string' ? parsed.message : undefined) ??
        `Charming API request failed with HTTP ${status}`,
    );
    this.name = 'ApiError';
    this.status = status;
    this.kind = error?.kind ?? (typeof parsed?.reason === 'string' ? parsed.reason : 'http_error');
    this.recovery = error?.recovery;
    this.body = body;
  }
}

export const DEFAULT_TIMEOUT_MS = 10_000;

export class TimeoutError extends Error {
  readonly kind = 'timeout';
  readonly status = 0;
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(
      `Request timed out after ${timeoutMs}ms. Increase it with --timeout <ms>, e.g. --timeout ${timeoutMs * 2}.`,
    );
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

export class CharmingClient {
  readonly baseUrl: string;
  readonly fetchImpl: typeof fetch;
  readonly token?: string;

  constructor(options: ClientOptions) {
    this.baseUrl = safeBaseUrl(options.baseUrl);
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.token = options.token;
  }

  async request(
    method: string,
    path: string,
    options: RequestOptions = {},
  ): Promise<{ data: unknown; etag: string | null; status: number }> {
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';

    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers,
        body:
          options.rawBody ??
          (options.body === undefined ? undefined : JSON.stringify(options.body)),
        signal: controller.signal,
      });
      const text = await response.text();
      const data =
        text.length === 0 ? null : parseResponse(text, response.headers.get('content-type'));
      if (!response.ok) throw new ApiError(response.status, data);
      return { data, etag: response.headers.get('etag'), status: response.status };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw new TimeoutError(timeoutMs);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function safeBaseUrl(value: string): string {
  const url = new URL(value);
  if (!isTrustedOrigin(url)) {
    throw new Error('The API origin must use HTTPS. Plain HTTP is allowed only for loopback.');
  }
  return value.replace(/\/+$/, '');
}

function isTrustedOrigin(url: URL): boolean {
  const isLoopback =
    url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  return url.protocol === 'https:' || (url.protocol === 'http:' && isLoopback);
}

// A server response (e.g. a device-pairing verification URL) is untrusted input.
// Only open it if it uses an allowed scheme and matches the origin we asked.
export function isOpenableUrl(url: string, baseUrl: string): boolean {
  try {
    const target = new URL(url);
    return isTrustedOrigin(target) && target.origin === new URL(baseUrl).origin;
  } catch {
    return false;
  }
}

function parseResponse(text: string, contentType: string | null): unknown {
  if (contentType?.includes('json')) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}
