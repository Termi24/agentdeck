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
  /**
   * Whether to follow 3xx redirects. Default `true` (mirrors curl/fetch
   * defaults). Set to `false` to make the first 3xx response the final
   * one — useful for diagnosing trailing-slash 308s that strip
   * Authorization headers (BUG-CARTOGRAPHIE-001 in the eyeot ERP run).
   */
  followRedirects?: boolean;
  /** Cap on the number of redirect hops. Default 5. */
  maxRedirects?: number;
}

export interface RedirectHop {
  status: number;
  /** The URL that produced this 3xx, BEFORE following. */
  from: string;
  /** The Location header value the server returned, after URL resolution. */
  to: string;
  /**
   * True when the next hop will not carry the original Authorization header.
   * Mirrors browser behavior: when the redirect leaves the original
   * scheme+host (or any cross-origin hop), `Authorization` is dropped.
   */
  authorizationDropped: boolean;
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
  /**
   * Ordered chain of 3xx hops actually traversed before reaching the
   * final status. Empty when no redirect occurred. Always populated
   * even when `followRedirects: false` (in which case the chain has at
   * most one entry — the first 3xx that was NOT followed).
   */
  redirectChain: RedirectHop[];
  /** Final URL after all redirects (or the request URL if none). */
  finalUrl: string;
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

/**
 * Resolve a Location header value against the URL that issued the redirect.
 * Handles relative ("/foo"), scheme-relative ("//host/foo") and absolute URLs.
 */
function resolveLocation(from: string, location: string): string {
  try {
    return new URL(location, from).toString();
  } catch {
    return location;
  }
}

/**
 * `Authorization` is dropped on cross-origin redirects (browser default,
 * matches Fetch spec § "HTTP-redirect fetch"). Same scheme+host = kept.
 */
function authIsKept(from: string, to: string): boolean {
  try {
    const a = new URL(from);
    const b = new URL(to);
    return a.origin === b.origin;
  } catch {
    return false;
  }
}

export async function validateClaim(input: ValidateClaimInput): Promise<ValidateClaimResult> {
  const started = Date.now();
  const timeoutMs = input.timeoutMs ?? 20_000;
  const maxRetries = Math.max(0, input.maxRetries ?? 3);
  const maxBackoffMs = Math.max(0, input.maxBackoffMs ?? 30_000);
  const followRedirects = input.followRedirects ?? true;
  const maxRedirects = Math.max(0, input.maxRedirects ?? 5);

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
  let currentUrl = input.url;
  let currentMethod = input.method;
  // We always issue requests with `redirect: 'manual'` so we can build a
  // visible redirect chain (the original implementation followed silently
  // and threw away the 308 hops, hiding BUG-CARTOGRAPHIE-001-style auth-
  // dropping redirects from agents).
  const redirectChain: RedirectHop[] = [];

  for (let hop = 0; hop <= maxRedirects; hop++) {
    res = null;
    retries = 0;

    // Inner retry loop on 429 for this hop.
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const ctl = new AbortController();
      const to = setTimeout(() => ctl.abort(), timeoutMs);

      try {
        res = await fetch(currentUrl, {
          method: currentMethod,
          headers,
          body: bodyStr,
          signal: ctl.signal,
          redirect: 'manual',
        });
      } catch (err) {
        clearTimeout(to);
        networkErr = err instanceof Error ? err.message : String(err);
        res = null;
        break;
      }
      clearTimeout(to);

      if (res.status !== 429 || attempt === maxRetries) break;

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

    if (!res) break; // network error — propagated below.

    if (res.status < 300 || res.status >= 400) break; // terminal status.

    const location = res.headers.get('location');
    if (!location) break; // 3xx without Location — treat as terminal.

    const nextUrl = resolveLocation(currentUrl, location);
    const authKept = authIsKept(currentUrl, nextUrl);
    redirectChain.push({
      status: res.status,
      from: currentUrl,
      to: nextUrl,
      authorizationDropped: !authKept && Object.keys(headers).some((k) => k.toLowerCase() === 'authorization'),
    });

    if (!followRedirects) break;
    if (hop === maxRedirects) break;

    // Drain the redirect body before reissuing.
    try {
      await res.text();
    } catch {
      /* ignore */
    }

    // 301/302/303 on POST/PUT/etc historically downgrade to GET (browser
    // behaviour). 307/308 preserve method + body.
    if ((res.status === 301 || res.status === 302 || res.status === 303) && currentMethod !== 'GET') {
      currentMethod = 'GET';
    }

    // Strip Authorization on cross-origin hops to match browser behaviour
    // and surface what the agent's curl/axios would have done.
    if (!authKept) {
      for (const k of Object.keys(headers)) {
        if (k.toLowerCase() === 'authorization') delete headers[k];
      }
    }

    currentUrl = nextUrl;
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
      redirectChain,
      finalUrl: currentUrl,
    };
  }

  const contentType = res.headers.get('content-type');
  const text = await res.text();
  const sample = text.slice(0, 4_000);
  const mismatches: string[] = [];

  if (redirectChain.some((h) => h.authorizationDropped)) {
    mismatches.push(
      `Authorization header was dropped on a cross-origin redirect (${redirectChain
        .filter((h) => h.authorizationDropped)
        .map((h) => `${h.status} ${h.from} → ${h.to}`)
        .join(', ')}). The final response may show 401 because of this, not because the credentials are wrong.`,
    );
  }

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
    redirectChain,
    finalUrl: currentUrl,
  };
}
