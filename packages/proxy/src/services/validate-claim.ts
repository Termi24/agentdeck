/**
 * `validate_claim` lets a sub-agent assert "I just did X and the backend
 * responded with Y". The proxy re-executes the HTTP call independently
 * (outside the sub-agent's browser context — no shared cookies, no shared
 * session) and reports whether the claim holds.
 *
 * This is the antidote to the false-positive pattern observed during the
 * IndusForge week: a sub-agent reports a bug based on its own contaminated
 * browser state, and the orchestrator has no cheap way to verify.
 *
 * 429 handling: many SaaS backends sit behind an IP-based rate limiter
 * (Flask-Limiter, Django Ratelimit, …). When an agent runs a matrix of
 * 80+ probes from a single proxy IP, the tail of the run predictably
 * hits 429 and would otherwise fail. We honour the `Retry-After` header
 * (seconds or HTTP-date) when present and fall back to an exponential
 * back-off, capped. The number of retries is reported back in the result
 * so agents can surface rate-limit friction.
 */
export interface ValidateClaimInput {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  /** Either an exact status or `2xx` / `4xx` / `5xx`. */
  expectStatus?: number | '2xx' | '3xx' | '4xx' | '5xx';
  /** JSON predicates on the response body: every pair must match (top-level key path via dot). */
  expectJsonContains?: Record<string, unknown>;
  /** String fragment that must appear in response body text. */
  expectBodyIncludes?: string;
  timeoutMs?: number;
  /** Max automatic retries on HTTP 429. Default 3. Set to 0 to disable. */
  maxRetries?: number;
  /** Cap (ms) for each back-off wait between retries. Default 30_000. */
  maxBackoffMs?: number;
}

export interface ValidateClaimResult {
  ok: boolean;
  status: number;
  statusMatches: boolean | null;
  jsonMatches: boolean | null;
  bodyMatches: boolean | null;
  mismatches: string[];
  sampleBody: string;
  durationMs: number;
  contentType: string | null;
  /** How many retries were performed before the final response. 0 = first try. */
  retries: number;
  /** Total time (ms) spent sleeping between retries. */
  backoffMs: number;
}

function getByPath(obj: unknown, path: string): unknown {
  if (obj === null || obj === undefined) return undefined;
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    if (typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function statusBucketMatches(status: number, bucket: string): boolean {
  if (bucket === '2xx') return status >= 200 && status < 300;
  if (bucket === '3xx') return status >= 300 && status < 400;
  if (bucket === '4xx') return status >= 400 && status < 500;
  if (bucket === '5xx') return status >= 500 && status < 600;
  return false;
}

/**
 * `Retry-After` is either a non-negative integer (seconds) or an HTTP-date.
 * Returns the delay in milliseconds, or `null` if the header is missing /
 * unparseable.
 */
function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (trimmed === '') return null;
  const asInt = Number(trimmed);
  if (Number.isFinite(asInt) && asInt >= 0) return Math.floor(asInt * 1000);
  const asDate = Date.parse(trimmed);
  if (Number.isFinite(asDate)) {
    const delta = asDate - Date.now();
    return delta > 0 ? delta : 0;
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function validateClaim(input: ValidateClaimInput): Promise<ValidateClaimResult> {
  const started = Date.now();
  const timeoutMs = input.timeoutMs ?? 20_000;
  const maxRetries = Math.max(0, input.maxRetries ?? 3);
  const maxBackoffMs = Math.max(0, input.maxBackoffMs ?? 30_000);

  const hasBody = input.body !== undefined && input.method !== 'GET';
  const headers: Record<string, string> = { ...(input.headers ?? {}) };
  if (hasBody && !Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) {
    headers['content-type'] = 'application/json';
  }
  const bodyStr = hasBody
    ? typeof input.body === 'string'
      ? input.body
      : JSON.stringify(input.body)
    : undefined;

  let res: Response | null = null;
  let networkErr: string | null = null;
  let retries = 0;
  let backoffAccum = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), timeoutMs);

    try {
      res = await fetch(input.url, {
        method: input.method,
        headers,
        body: bodyStr,
        signal: ctl.signal,
      });
    } catch (err) {
      clearTimeout(to);
      networkErr = err instanceof Error ? err.message : String(err);
      res = null;
      break;
    }
    clearTimeout(to);

    // Only 429 triggers the retry path. Everything else is the agent's signal.
    if (res.status !== 429 || attempt === maxRetries) break;

    // Drain the 429 body to release the socket before sleeping.
    try {
      await res.text();
    } catch {
      /* ignore */
    }

    const retryAfterMs = parseRetryAfter(res.headers.get('retry-after'));
    const backoffMs =
      retryAfterMs !== null
        ? Math.min(retryAfterMs, maxBackoffMs)
        : Math.min(maxBackoffMs, 1000 * 2 ** attempt);

    retries++;
    backoffAccum += backoffMs;
    res = null;
    if (backoffMs > 0) await sleep(backoffMs);
  }

  if (!res) {
    return {
      ok: false,
      status: 0,
      statusMatches: null,
      jsonMatches: null,
      bodyMatches: null,
      mismatches: [`network error: ${networkErr ?? 'unknown'}`],
      sampleBody: '',
      durationMs: Date.now() - started,
      contentType: null,
      retries,
      backoffMs: backoffAccum,
    };
  }

  const contentType = res.headers.get('content-type');
  const text = await res.text();
  const sample = text.slice(0, 4_000);
  const mismatches: string[] = [];

  let statusMatches: boolean | null = null;
  if (input.expectStatus !== undefined) {
    statusMatches =
      typeof input.expectStatus === 'number'
        ? res.status === input.expectStatus
        : statusBucketMatches(res.status, input.expectStatus);
    if (!statusMatches) mismatches.push(`status ${res.status} vs expected ${input.expectStatus}`);
  }

  let jsonMatches: boolean | null = null;
  if (input.expectJsonContains) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = undefined;
    }
    if (parsed === undefined) {
      jsonMatches = false;
      mismatches.push('response body is not valid JSON');
    } else {
      jsonMatches = true;
      for (const [k, v] of Object.entries(input.expectJsonContains)) {
        const got = getByPath(parsed, k);
        if (JSON.stringify(got) !== JSON.stringify(v)) {
          jsonMatches = false;
          mismatches.push(`json.${k}: got ${JSON.stringify(got)} expected ${JSON.stringify(v)}`);
        }
      }
    }
  }

  let bodyMatches: boolean | null = null;
  if (input.expectBodyIncludes) {
    bodyMatches = text.includes(input.expectBodyIncludes);
    if (!bodyMatches) mismatches.push(`body does not include ${JSON.stringify(input.expectBodyIncludes)}`);
  }

  return {
    ok: mismatches.length === 0,
    status: res.status,
    statusMatches,
    jsonMatches,
    bodyMatches,
    mismatches,
    sampleBody: sample,
    durationMs: Date.now() - started,
    contentType,
    retries,
    backoffMs: backoffAccum,
  };
}
