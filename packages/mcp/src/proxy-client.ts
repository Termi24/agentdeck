import { config } from './config.js';
import { ensureProxyReachable, type EnsureProxyResult } from './proxy-spawner.js';

interface BootstrapInfo {
  sessionId: string;
  agentId: string;
  firstCall: boolean;
}

const HEARTBEAT_INTERVAL_MS = 30 * 1000;

export class ProxyClient {
  private baseUrl: string;
  private webBaseUrl: string;
  private readonly projectId: string;
  private sessionId: string | null;
  private agentId: string | null;
  private bootstrapPromise: Promise<BootstrapInfo> | null = null;
  private announcedFirstCall = false;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private spawnInfo: EnsureProxyResult | null = null;

  constructor() {
    // Provisional values — replaced by ensureProxyReachable() before any HTTP call.
    this.baseUrl = config.AGENTDECK_PROXY_URL ?? 'http://127.0.0.1:4317';
    this.webBaseUrl = 'http://127.0.0.1:3000';
    this.projectId = config.AGENTDECK_PROJECT_ID;
    this.sessionId = config.AGENTDECK_SESSION_ID ?? null;
    this.agentId = config.AGENTDECK_AGENT_ID ?? null;
  }

  /**
   * Starts a 30 s heartbeat loop that proves to the proxy the owning CLI
   * is still alive. The proxy's bridge watchdog auto-finalizes any bridge
   * session whose last heartbeat is older than ~90 s, so when the CLI
   * process exits (and this MCP stdio process dies with it) the session
   * closes itself cleanly within a minute or two.
   *
   * The timer is unref'd so it never keeps the Node event loop alive.
   */
  private startHeartbeat(sessionId: string): void {
    if (this.heartbeatTimer) return;
    const ping = async () => {
      try {
        await fetch(`${this.baseUrl}/sessions/${encodeURIComponent(sessionId)}/heartbeat`, {
          method: 'POST',
        });
      } catch {
        // Proxy down or network blip — the watchdog will reap the session
        // on the server side regardless, no need to surface this to the CLI.
      }
    };
    // Fire once immediately so a freshly-bootstrapped session does not
    // wait 30 s before its first proof-of-life.
    void ping();
    this.heartbeatTimer = setInterval(ping, HEARTBEAT_INTERVAL_MS);
    this.heartbeatTimer.unref?.();
  }

  get needsBootstrap(): boolean {
    return !this.sessionId;
  }

  async ensureReady(): Promise<BootstrapInfo> {
    if (this.sessionId && this.agentId) {
      return { sessionId: this.sessionId, agentId: this.agentId, firstCall: false };
    }
    if (!this.bootstrapPromise) {
      this.bootstrapPromise = this.bootstrap();
    }
    return this.bootstrapPromise;
  }

  private async bootstrap(): Promise<BootstrapInfo> {
    // Step 1: ensure the proxy is reachable. Auto-spawns the launcher if no
    // proxy is up. Picks free ports if 4317/3000 are taken.
    this.spawnInfo = await ensureProxyReachable({ explicitProxyUrl: config.AGENTDECK_PROXY_URL });
    this.baseUrl = `http://127.0.0.1:${this.spawnInfo.proxyPort}`;
    this.webBaseUrl = `http://127.0.0.1:${this.spawnInfo.webPort}`;

    // Step 2: bootstrap the bridge session against the (now-reachable) proxy.
    const title = `${config.AGENTDECK_AGENT_NAME} @ ${new Date().toISOString().slice(0, 19)}`;
    const prompt = 'External CLI session bridged via agentdeck MCP.';
    const res = await fetch(`${this.baseUrl}/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId: this.projectId,
        prompt,
        title,
        bridge: true,
        rootAgentName: config.AGENTDECK_AGENT_NAME,
        rootAgentRole: 'bridge',
      }),
    });
    if (!res.ok) {
      throw new Error(`agentdeck proxy reachable on :${this.spawnInfo.proxyPort} but session create returned ${res.status}.`);
    }
    const data = (await res.json()) as { sessionId: string; rootAgentId: string };
    this.sessionId = data.sessionId;
    this.agentId = data.rootAgentId;
    this.startHeartbeat(data.sessionId);
    return { sessionId: data.sessionId, agentId: data.rootAgentId, firstCall: true };
  }

  sessionUrl(): string {
    return `${this.webBaseUrl}/sessions/${this.sessionId ?? ''}`;
  }

  maybeSessionBanner(): string | null {
    if (this.announcedFirstCall) return null;
    this.announcedFirstCall = true;
    const lines: string[] = [];
    if (this.spawnInfo?.freshSpawn) {
      lines.push(`[agentdeck] auto-spawned proxy on :${this.spawnInfo.proxyPort} and dashboard on :${this.spawnInfo.webPort}`);
    }
    lines.push(`[agentdeck] dashboard: ${this.webBaseUrl}`);
    lines.push(`[agentdeck] campaigns: ${this.webBaseUrl}/campaigns`);
    lines.push(`[agentdeck] bridged session: ${this.sessionUrl()}`);
    lines.push(`[agentdeck] tell the human these URLs at the start of the conversation so they can supervise live.`);
    return lines.join('\n');
  }

  currentAgentContext(): { agentId: string | null; agentName: string | null } | null {
    if (!this.agentId) return null;
    return { agentId: this.agentId, agentName: config.AGENTDECK_AGENT_NAME ?? null };
  }

  private requireSession(): string {
    if (!this.sessionId) throw new Error('session not bootstrapped — call ensureReady() first');
    return this.sessionId;
  }

  private requireAgent(): string {
    if (!this.agentId) throw new Error('agent not bootstrapped');
    return this.agentId;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      if (res.status === 204) return undefined as T;
      const text = await res.text();
      throw new Error(`${method} ${path} → ${res.status}: ${text}`);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  /**
   * Like `request` but treats 404 as a soft outcome — returns the parsed
   * body instead of throwing. Used for browser_click / browser_type / …
   * where "element not found" is expected information for the agent, not
   * a transport error.
   */
  private async requestSoft<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204) return undefined as T;
    if (res.ok || res.status === 404) {
      return (await res.json()) as T;
    }
    const text = await res.text();
    throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  }

  listProcedures() {
    return this.request<{ procedures: Array<{ name: string; format: 'yaml' | 'md'; description: string | null }> }>(
      'GET',
      '/procedures',
    );
  }
  getProcedure(name: string) {
    return this.request<{ name: string; format: 'yaml' | 'md'; content: string; description: string | null }>(
      'GET',
      `/procedures/${encodeURIComponent(name)}`,
    );
  }

  postChannel(content: string) {
    return this.request<{ messageId: string; at: string }>('POST', `/sessions/${this.requireSession()}/channel`, {
      fromAgentId: this.requireAgent(),
      fromAgentName: config.AGENTDECK_AGENT_NAME,
      content,
    });
  }
  readChannel(params: { since?: string; limit?: number }) {
    const qs = new URLSearchParams();
    if (params.since) qs.set('since', params.since);
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    const query = qs.toString();
    return this.request<{ messages: Array<{ fromAgentName: string; content: string; createdAt: string }> }>(
      'GET',
      `/sessions/${this.requireSession()}/channel${query ? '?' + query : ''}`,
    );
  }

  publishDoc(path: string, content: string) {
    return this.request<{ docId: string; at: string }>('POST', `/sessions/${this.requireSession()}/docs`, {
      path,
      content,
      byAgentId: this.requireAgent(),
    });
  }

  sandboxWrite(path: string, content: string) {
    return this.request<{ path: string; bytes: number }>('POST', `/sessions/${this.requireSession()}/sandbox/write`, { path, content });
  }
  sandboxRead(path: string) {
    return this.request<{ path: string; content: string }>(
      'GET',
      `/sessions/${this.requireSession()}/sandbox/read?path=${encodeURIComponent(path)}`,
    );
  }
  sandboxExec(command: string, timeoutMs?: number) {
    return this.request<{
      runId: string;
      exitCode: number;
      stdout: string;
      stderr: string;
      durationMs: number;
      timedOut: boolean;
    }>('POST', `/sessions/${this.requireSession()}/sandbox/exec`, {
      command,
      timeoutMs: timeoutMs ?? 120_000,
      agentId: this.requireAgent(),
    });
  }

  reportTestResult(args: { suite: string; caseName: string; status: 'passed' | 'failed' | 'skipped'; message?: string; evidence?: unknown }) {
    return this.request<{ resultId: string; at: string }>('POST', `/sessions/${this.requireSession()}/test-results`, {
      agentId: this.requireAgent(),
      ...args,
    });
  }

  memoryRead(key: string) {
    return this.request<{ projectId: string; key: string; value: string; updatedAt: string }>(
      'GET',
      `/projects/${encodeURIComponent(this.projectId)}/memory/${encodeURIComponent(key)}`,
    );
  }
  memoryWrite(key: string, value: string) {
    return this.request<{ projectId: string; key: string; at: string }>(
      'POST',
      `/projects/${encodeURIComponent(this.projectId)}/memory/${encodeURIComponent(key)}`,
      { value, updatedByAgentId: this.requireAgent() },
    );
  }

  sendDirect(toAgentId: string, content: string) {
    return this.request<{ messageId: string; at: string }>('POST', `/sessions/${this.requireSession()}/dm`, {
      fromAgentId: this.requireAgent(),
      fromAgentName: config.AGENTDECK_AGENT_NAME,
      toAgentId,
      content,
    });
  }
  readDirect(limit?: number) {
    const qs = new URLSearchParams({ agentId: this.requireAgent() });
    if (limit !== undefined) qs.set('limit', String(limit));
    return this.request<{ messages: Array<{ fromAgentName: string; toAgentId: string; content: string; createdAt: string }> }>(
      'GET',
      `/sessions/${this.requireSession()}/dm?${qs.toString()}`,
    );
  }

  secretsGet(name: string) {
    return this.request<{ name: string; value: string }>(
      'GET',
      `/projects/${encodeURIComponent(this.projectId)}/secrets/${encodeURIComponent(name)}`,
    );
  }

  awaitUserInput(
    timeoutMs: number,
    opts: { agentId?: string | null; agentName?: string | null; prompt?: string | null } = {},
  ) {
    const qs = new URLSearchParams({ timeoutMs: String(timeoutMs) });
    if (opts.agentId) qs.set('agentId', opts.agentId);
    if (opts.agentName) qs.set('agentName', opts.agentName);
    if (opts.prompt) qs.set('prompt', opts.prompt);
    return this.request<{ inputId: string; content: string; at: string } | undefined>(
      'POST',
      `/sessions/${this.requireSession()}/user-input/wait?${qs.toString()}`,
    );
  }

  diffExec(a: string, b: string) {
    const qs = new URLSearchParams({ a, b }).toString();
    return this.request<{
      a: { id: string; command: string; exitCode: number; stdout: string; stderr: string };
      b: { id: string; command: string; exitCode: number; stdout: string; stderr: string };
      exitCodeChanged: boolean;
      stdoutDiff: { added: string[]; removed: string[] };
      stderrDiff: { added: string[]; removed: string[] };
    }>('GET', `/sessions/${this.requireSession()}/exec-diff?${qs}`);
  }

  requestAgentCancel(agentId: string) {
    return this.request<{ agentId: string; at: string }>(
      'POST',
      `/sessions/${this.requireSession()}/agents/${encodeURIComponent(agentId)}/cancel`,
      { requestedByAgentId: this.requireAgent() },
    );
  }
  checkCancellation(agentId: string) {
    return this.request<{ cancelled: boolean; requestedAt: string | null }>(
      'GET',
      `/sessions/${this.requireSession()}/agents/${encodeURIComponent(agentId)}/cancel`,
    );
  }

  browserNavigate(url: string) {
    return this.request<{ url: string; title: string }>('POST', `/sessions/${this.requireSession()}/browser/navigate`, {
      url,
      agentId: this.requireAgent(),
    });
  }
  browserSnapshot() {
    const qs = new URLSearchParams({ agentId: this.requireAgent() }).toString();
    return this.request<{ url: string; title: string; text: string }>(
      'GET',
      `/sessions/${this.requireSession()}/browser/snapshot?${qs}`,
    );
  }
  browserClick(selector: string, opts?: { timeoutMs?: number }) {
    return this.requestSoft<
      { ok: true } | { ok: false; error: 'element not found'; selector: string; timeoutMs: number }
    >('POST', `/sessions/${this.requireSession()}/browser/click`, {
      selector,
      agentId: this.requireAgent(),
      ...opts,
    });
  }
  browserType(selector: string, text: string, pressEnter?: boolean, opts?: { timeoutMs?: number }) {
    return this.requestSoft<
      { ok: true } | { ok: false; error: 'element not found'; selector: string; timeoutMs: number }
    >('POST', `/sessions/${this.requireSession()}/browser/type`, {
      selector,
      text,
      pressEnter,
      agentId: this.requireAgent(),
      ...opts,
    });
  }
  browserFillForm(fields: Array<{ selector: string; value: string }>, opts?: { timeoutMs?: number }) {
    return this.requestSoft<
      | { ok: true; filled: number }
      | { ok: false; error: 'element not found'; selector: string; filled: number; total: number; timeoutMs: number }
    >('POST', `/sessions/${this.requireSession()}/browser/fill-form`, {
      fields,
      agentId: this.requireAgent(),
      ...opts,
    });
  }
  browserWaitFor(opts: { text?: string; textGone?: string; selector?: string; timeoutMs?: number }) {
    return this.request<
      | { ok: true; satisfied: true }
      | { ok: true; satisfied: false; reason: 'timeout'; timeoutMs: number; waitedFor: Record<string, string> }
    >('POST', `/sessions/${this.requireSession()}/browser/wait-for`, {
      ...opts,
      agentId: this.requireAgent(),
    });
  }
  browserPressKey(key: string) {
    return this.request<{ ok: true }>('POST', `/sessions/${this.requireSession()}/browser/press-key`, {
      key,
      agentId: this.requireAgent(),
    });
  }
  browserScreenshot(args: { caption?: string; fullPage?: boolean }) {
    return this.request<{ screenshotId: string; path: string; url: string }>(
      'POST',
      `/sessions/${this.requireSession()}/browser/screenshot`,
      { ...args, agentId: this.requireAgent() },
    );
  }

  browserNewContext(opts: { agentId?: string; reset?: boolean }) {
    return this.request<{ ok: true; agentId: string; url: string }>(
      'POST',
      `/sessions/${this.requireSession()}/browser/context`,
      { agentId: opts.agentId ?? this.requireAgent(), reset: opts.reset ?? false },
    );
  }
  browserDisposeContext(opts: { agentId?: string }) {
    const target = opts.agentId ?? this.requireAgent();
    return this.request<{ ok: true; existed: boolean }>(
      'DELETE',
      `/sessions/${this.requireSession()}/browser/context/${encodeURIComponent(target)}`,
    );
  }

  validateClaim(input: {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    url: string;
    headers?: Record<string, string>;
    body?: unknown;
    expectStatus?: number | '2xx' | '3xx' | '4xx' | '5xx';
    expectJsonContains?: Record<string, unknown>;
    expectBodyIncludes?: string;
    timeoutMs?: number;
    followRedirects?: boolean;
    maxRedirects?: number;
  }) {
    return this.request<{
      ok: boolean;
      status: number;
      statusMatches: boolean | null;
      jsonMatches: boolean | null;
      bodyMatches: boolean | null;
      mismatches: string[];
      sampleBody: string;
      durationMs: number;
      contentType: string | null;
      retries: number;
      backoffMs: number;
      redirectChain: Array<{ status: number; from: string; to: string; authorizationDropped: boolean }>;
      finalUrl: string;
    }>('POST', `/sessions/${this.requireSession()}/validate-claim`, input);
  }

  validateClaimsBulk(input: {
    claims: Array<{
      method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
      url: string;
      headers?: Record<string, string>;
      body?: unknown;
      expectStatus?: number | '2xx' | '3xx' | '4xx' | '5xx';
      expectJsonContains?: Record<string, unknown>;
      expectBodyIncludes?: string;
      timeoutMs?: number;
      followRedirects?: boolean;
      maxRedirects?: number;
    }>;
    parallelism?: number;
  }) {
    return this.request<{
      results: Array<{
        ok: boolean;
        status?: number;
        statusMatches?: boolean | null;
        durationMs?: number;
        sampleBody?: string;
        mismatches?: string[];
        error?: string;
      }>;
      total: number;
      passed: number;
      durationMs: number;
    }>('POST', `/sessions/${this.requireSession()}/validate-claims/bulk`, input);
  }

  apiInventory(input: {
    framework: 'flask' | 'express' | 'fastapi' | 'fastify';
    rootPath: string;
    summary?: boolean;
    filter?: { method?: string; pathPrefix?: string; blueprint?: string };
    limit?: number;
    offset?: number;
  }) {
    return this.request<{
      framework: string;
      rootPath: string;
      scannedFiles: number;
      routes?: Array<{
        method: string;
        path: string;
        file: string;
        line: number;
        handler?: string;
        permissionRequired?: string;
        blueprint?: string;
      }>;
      summary?: {
        total: number;
        totalAfterFilter: number;
        byMethod: Record<string, number>;
        byBlueprint: Record<string, Record<string, number>>;
      };
      paging?: { offset: number; limit: number | null; returned: number; totalAfterFilter: number };
      blueprintPrefixes?: Record<string, string>;
    }>('POST', `/sessions/${this.requireSession()}/api-inventory`, input);
  }

  schemaInventory(input: { rootPath: string }) {
    return this.request<{
      rootPath: string;
      scannedFiles: number;
      tables: Array<{
        name: string;
        file: string;
        line: number;
        columns: Array<{ name: string; type: string; primary: boolean; notNull: boolean; autoIncrement: boolean }>;
        indexes: string[];
        foreignKeys: string[];
      }>;
    }>('POST', `/sessions/${this.requireSession()}/schema-inventory`, input);
  }

  eventsInventory(input: { rootPath: string }) {
    return this.request<{
      rootPath: string;
      scannedFiles: number;
      discriminator: string | null;
      events: Array<{ type: string; fields: string[]; file: string; line: number }>;
    }>('POST', `/sessions/${this.requireSession()}/events-inventory`, input);
  }

  mcpToolsInventory(input: { rootPath: string }) {
    return this.request<{
      file: string;
      tools: Array<{ name: string; description: string; inputSchema: string }>;
    }>('POST', `/sessions/${this.requireSession()}/mcp-tools-inventory`, input);
  }

  reactHooksInventory(input: { rootPath: string }) {
    return this.request<{
      rootPath: string;
      scannedFiles: number;
      hooks: Array<{ name: string; kind: 'function' | 'const'; file: string; line: number }>;
    }>('POST', `/sessions/${this.requireSession()}/react-hooks-inventory`, input);
  }

  readMethodology(section: string) {
    const qs = new URLSearchParams({ section }).toString();
    return this.request<{ section: string; path: string; lineCount: number; content: string }>(
      'GET',
      `/methodology?${qs}`,
    );
  }

  startCampaign(input: { projectName: string; cliSource: string; notes?: string }) {
    return this.request<{ campaignId: string; startedAt: string }>('POST', '/campaigns', input);
  }

  recordCampaignMetric(
    campaignId: string,
    input: { name: string; value: number | string | boolean; tags?: Record<string, string> },
  ) {
    return this.request<{ ok: true }>(
      'POST',
      `/campaigns/${encodeURIComponent(campaignId)}/metrics`,
      input,
    );
  }

  submitCampaignRetrospective(
    campaignId: string,
    input: {
      whatWentWell: string;
      whatWentBadly: string;
      keyLearnings: string;
      toolingFeedback: string;
      recommendations: string;
    },
  ) {
    return this.request<{ ok: true; submittedAt: string }>(
      'PUT',
      `/campaigns/${encodeURIComponent(campaignId)}/retrospective`,
      input,
    );
  }

  endCampaign(campaignId: string, status: 'completed' | 'aborted' | 'failed') {
    return this.request<{ ok: true; status: string; endedAt: string }>(
      'POST',
      `/campaigns/${encodeURIComponent(campaignId)}/end`,
      { status },
    );
  }

  setAgentIdentity(input: { name?: string; role?: string }) {
    return this.request<{ ok: true; agentId: string; name?: string; role?: string }>(
      'PATCH',
      `/sessions/${this.requireSession()}/agents/${encodeURIComponent(this.requireAgent())}`,
      input,
    );
  }
}
