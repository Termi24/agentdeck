import { z } from 'zod';

export const ListProceduresInput = z.object({});
export const RunTestProcedureInput = z.object({
  name: z.string().min(1),
  args: z.record(z.string(), z.unknown()).optional(),
});
export const PostToChannelInput = z.object({
  content: z.string().min(1),
});
export const ReadChannelInput = z.object({
  since: z.iso.datetime().optional(),
  limit: z.number().int().positive().max(200).default(50),
});
export const PublishDocInput = z.object({
  path: z.string().min(1),
  content: z.string(),
});
export const SandboxWriteInput = z.object({
  path: z.string().min(1),
  content: z.string(),
});
export const SandboxReadInput = z.object({
  path: z.string().min(1),
});
export const SandboxExecInput = z.object({
  command: z.string().min(1),
  timeoutMs: z.number().int().positive().max(600_000).default(120_000),
});

export const ReportTestResultInput = z.object({
  suite: z.string().min(1),
  caseName: z.string().min(1),
  status: z.enum(['passed', 'failed', 'skipped']),
  message: z.string().optional(),
  evidence: z.unknown().optional(),
});

export const ProjectMemoryReadInput = z.object({ key: z.string().min(1) });
export const ProjectMemoryWriteInput = z.object({ key: z.string().min(1), value: z.string() });

export const SendDirectInput = z.object({
  toAgentId: z.string().min(1),
  content: z.string().min(1),
});
export const ReadDirectInput = z.object({
  limit: z.number().int().positive().max(200).default(50),
});

export const SecretsGetInput = z.object({ name: z.string().min(1) });

export const WaitForChannelInput = z.object({
  pattern: z.string().min(1),
  timeoutMs: z.number().int().positive().max(600_000).default(120_000),
});

export const AwaitUserInputInput = z.object({
  prompt: z.string().optional(),
  timeoutMs: z.number().int().positive().max(600_000).default(120_000),
});

export const ReadMethodologyInput = z.object({
  section: z
    .enum([
      'overview',
      'principles',
      'tooling',
      'communication',
      'pre-start',
      'personas',
      'phase-0',
      'phase-1',
      'phase-2',
      'phase-3',
      'phase-4',
      'phase-5',
      'phase-6',
      'phase-7',
      'phase-9',
      'conventions',
      'templates',
      'troubleshooting',
      'metrics',
      'full',
    ])
    .default('overview'),
});

export const StartQaCampaignInput = z.object({
  projectName: z.string().min(1),
  cliSource: z.string().min(1).default('claude-code'),
  notes: z.string().optional(),
});

export const RecordCampaignMetricInput = z.object({
  campaignId: z.string().min(1),
  name: z.string().min(1),
  value: z.union([z.number(), z.string(), z.boolean()]),
  tags: z.record(z.string(), z.string()).optional(),
});

export const SubmitCampaignRetrospectiveInput = z.object({
  campaignId: z.string().min(1),
  whatWentWell: z.string().min(1),
  whatWentBadly: z.string().min(1),
  keyLearnings: z.string().min(1),
  toolingFeedback: z.string().min(1),
  recommendations: z.string().min(1),
});

export const EndCampaignInput = z.object({
  campaignId: z.string().min(1),
  status: z.enum(['completed', 'aborted', 'failed']).default('completed'),
});

export const SetAgentIdentityInput = z.object({
  name: z
    .string()
    .min(1)
    .max(100)
    .describe(
      'Display name for this CLI/agent in the agentdeck hub. Should be user-chosen, descriptive (e.g. "claude-code-orchestrator", "cursor-runner"). Ask the user if you do not have one.',
    ),
  role: z.string().min(1).max(100).optional(),
});

// Sub-agent registration. CLI bridges (Claude Code, Cursor, custom CLIs) fan
// out work via Task() / per-persona patterns that the proxy cannot observe
// from the outside — without explicit registration, a 9-specialist run
// appears as a single noisy agent in the AgentTree. spawn_agent fixes this
// by letting the orchestrator declare each sub-agent up front.
export const SpawnAgentInput = z.object({
  name: z.string().min(1).max(100).describe(
    'Display name for the sub-agent (e.g. "schema-auditor", "buyer-persona", "researcher").',
  ),
  role: z.string().min(1).max(100).optional().describe('Short role label rendered as a badge.'),
  prompt: z
    .string()
    .default('')
    .describe(
      'The agent\'s context / skill / persona description. Rendered as the "context" tile in the Agents & context tab.',
    ),
  parentAgentId: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .describe('Parent agent UUID. Defaults to the calling agent (the bridge root).'),
  model: z.string().optional(),
});

export const StopAgentInput = z.object({
  agentId: z.string().uuid(),
  status: z.enum(['completed', 'failed', 'cancelled']).default('completed'),
  tokensIn: z.number().int().nonnegative().optional(),
  tokensOut: z.number().int().nonnegative().optional(),
});

export const DiffExecInput = z.object({
  runIdA: z.string().min(1),
  runIdB: z.string().min(1),
});

export const RequestAgentCancelInput = z.object({ agentId: z.string().min(1) });
export const CheckCancellationInput = z.object({});

export const BrowserNavigateInput = z.object({ url: z.string().url() });
export const BrowserSnapshotInput = z.object({});
export const BrowserClickInput = z.object({
  selector: z.string().min(1),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .max(60_000)
    .default(3_000)
    .describe(
      'Per-locator wait in ms. Default 3000 — keeps optional/missing elements fail-fast instead of blocking 30 s on Playwright defaults. Bump if the element legitimately needs more time to mount.',
    ),
});
export const BrowserTypeInput = z.object({
  selector: z.string().min(1),
  text: z.string(),
  pressEnter: z.boolean().optional(),
  timeoutMs: z.number().int().positive().max(60_000).default(3_000),
});
export const BrowserFillFormInput = z.object({
  fields: z.array(z.object({ selector: z.string().min(1), value: z.string() })).min(1),
  timeoutMs: z.number().int().positive().max(60_000).default(3_000),
});
export const BrowserWaitForInput = z.object({
  text: z.string().optional(),
  textGone: z.string().optional(),
  selector: z.string().optional(),
  timeoutMs: z.number().int().positive().max(120_000).default(15_000),
});
export const BrowserPressKeyInput = z.object({ key: z.string().min(1) });
export const BrowserScreenshotInput = z.object({
  caption: z.string().optional(),
  fullPage: z.boolean().optional(),
});

export const BrowserNewContextInput = z.object({
  /** Override the agentId isolation key. Defaults to the calling agent's id. */
  agentId: z.string().min(1).optional(),
  /** When true, destroy any existing context for this agent before creating a new one. */
  reset: z.boolean().optional(),
});
export const BrowserDisposeContextInput = z.object({
  /** Override the agentId to dispose. Defaults to the calling agent's id. */
  agentId: z.string().min(1).optional(),
});

export const ValidateClaimInput = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  url: z.string().url(),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.unknown().optional(),
  expectStatus: z.union([z.number().int(), z.enum(['2xx', '3xx', '4xx', '5xx'])]).optional(),
  expectJsonContains: z.record(z.string(), z.unknown()).optional(),
  expectBodyIncludes: z.string().optional(),
  timeoutMs: z.number().int().positive().max(120_000).optional(),
  maxRetries: z.number().int().min(0).max(10).optional(),
  maxBackoffMs: z.number().int().min(0).max(300_000).optional(),
  followRedirects: z
    .boolean()
    .optional()
    .describe(
      'Follow 3xx redirects (default true). Set false to surface a trailing-slash 308 directly instead of silently following — useful when diagnosing "401 after auth-stripping redirect" issues.',
    ),
  maxRedirects: z.number().int().min(0).max(20).optional(),
});

export const ValidateClaimsBulkInput = z.object({
  claims: z.array(ValidateClaimInput).min(1).max(100),
  parallelism: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(8)
    .describe(
      'Server-side concurrency. Default 8. Bump to 20 for fast localhost targets; drop to 1 for IP-rate-limited public SaaS where you risk 429.',
    ),
});

export const SchemaInventoryInput = z.object({
  rootPath: z.string().min(1).describe('Directory to scan for Drizzle sqliteTable() / pgTable() definitions.'),
});

export const EventsInventoryInput = z.object({
  rootPath: z.string().min(1).describe('Directory to scan for zod discriminatedUnion event types.'),
});

export const McpToolsInventoryInput = z.object({
  rootPath: z
    .string()
    .min(1)
    .describe('Path to a packages/mcp/src/tools.ts (or equivalent) that exports a TOOL_DEFINITIONS array.'),
});

export const ReactHooksInventoryInput = z.object({
  rootPath: z
    .string()
    .min(1)
    .describe('Directory to scan recursively for React hooks (export function/const useXxx).'),
});

export const ApiInventoryInput = z.object({
  framework: z.enum(['flask', 'express', 'fastapi', 'fastify']),
  rootPath: z.string().min(1),
  selfCheck: z
    .object({
      baseUrl: z.string().url(),
      sampleSize: z.number().int().positive().max(50).optional(),
      timeoutMs: z.number().int().positive().max(60_000).optional(),
      threshold: z.number().min(0).max(1).optional(),
    })
    .optional(),
  summary: z
    .boolean()
    .optional()
    .describe(
      'When true, omit the per-route list and return only aggregated counts (per blueprint × method). Use for first-pass exploration on large codebases (>200 routes) to avoid blowing the token budget; then call again with `filter` to drill in.',
    ),
  filter: z
    .object({
      method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional(),
      pathPrefix: z.string().min(1).optional(),
      blueprint: z.string().min(1).optional(),
    })
    .optional()
    .describe('Restrict the returned routes[] to entries matching all given criteria.'),
  limit: z.number().int().positive().max(2000).optional(),
  offset: z.number().int().min(0).optional(),
});

export const TOOL_DEFINITIONS = [
  { name: 'list_procedures', description: 'List all test procedures available.', inputSchema: ListProceduresInput },
  { name: 'run_test_procedure', description: 'Fetch a procedure runbook so you can execute it.', inputSchema: RunTestProcedureInput },
  { name: 'post_to_channel', description: 'Broadcast a message to the shared project channel.', inputSchema: PostToChannelInput },
  { name: 'read_channel', description: 'Read recent messages from the shared project channel.', inputSchema: ReadChannelInput },
  { name: 'publish_doc', description: 'Publish a markdown document in the session doc space.', inputSchema: PublishDocInput },
  { name: 'sandbox_write', description: 'Write a file into the session sandbox.', inputSchema: SandboxWriteInput },
  { name: 'sandbox_read', description: 'Read a file from the session sandbox.', inputSchema: SandboxReadInput },
  { name: 'sandbox_exec', description: 'Run a shell command in the sandbox. Returns stdout/stderr/exit and a runId for later diffing.', inputSchema: SandboxExecInput },
  { name: 'report_test_result', description: 'Report a structured test result (PASS/FAIL/SKIP) with optional evidence.', inputSchema: ReportTestResultInput },
  { name: 'project_memory_read', description: 'Read a long-lived note keyed by name for this project (survives across sessions).', inputSchema: ProjectMemoryReadInput },
  { name: 'project_memory_write', description: 'Persist a long-lived note keyed by name for this project (available to future sessions).', inputSchema: ProjectMemoryWriteInput },
  { name: 'send_direct', description: 'Send a private direct message to another agent in the same session.', inputSchema: SendDirectInput },
  { name: 'read_direct', description: 'Read direct messages addressed to you in this session.', inputSchema: ReadDirectInput },
  { name: 'secrets_get', description: 'Retrieve a named secret for this project (returns plaintext; scoped to the current project).', inputSchema: SecretsGetInput },
  { name: 'wait_for_channel', description: 'Block until a channel message matches the given regex pattern, or timeoutMs elapses.', inputSchema: WaitForChannelInput },
  { name: 'await_user_input', description: 'Block until the human user sends a message via the UI input, or timeoutMs elapses.', inputSchema: AwaitUserInputInput },
  { name: 'diff_exec', description: 'Diff two sandbox_exec runs by their runIds.', inputSchema: DiffExecInput },
  { name: 'request_agent_cancel', description: 'Request cancellation of a specific agent; the target agent must poll check_cancellation to honor it.', inputSchema: RequestAgentCancelInput },
  { name: 'check_cancellation', description: 'Check whether a cancellation has been requested for the calling agent. Call this in long loops.', inputSchema: CheckCancellationInput },
  { name: 'browser_navigate', description: 'Open the given URL in the session browser.', inputSchema: BrowserNavigateInput },
  { name: 'browser_snapshot', description: 'Return URL, title and visible body text of the current page.', inputSchema: BrowserSnapshotInput },
  { name: 'browser_click', description: 'Click an element by CSS selector.', inputSchema: BrowserClickInput },
  { name: 'browser_type', description: 'Fill an input or textarea with the given text.', inputSchema: BrowserTypeInput },
  { name: 'browser_fill_form', description: 'Fill multiple form fields in one call.', inputSchema: BrowserFillFormInput },
  { name: 'browser_wait_for', description: 'Wait for a selector, a text, or a text to disappear.', inputSchema: BrowserWaitForInput },
  { name: 'browser_press_key', description: 'Press a single keyboard key (e.g. Enter, Escape, Tab).', inputSchema: BrowserPressKeyInput },
  { name: 'browser_screenshot', description: 'Take a screenshot of the current page and attach it to the Browser panel.', inputSchema: BrowserScreenshotInput },
  {
    name: 'browser_new_context',
    description:
      'Create or reset a dedicated, isolated BrowserContext for the calling agent — separate cookies, localStorage, service workers and cache from every other agent in the session. Call this once at the start of persona tests to eliminate cross-agent identity contamination.',
    inputSchema: BrowserNewContextInput,
  },
  {
    name: 'browser_dispose_context',
    description: 'Dispose the calling agent\'s isolated BrowserContext (fire-and-forget cleanup at end of run).',
    inputSchema: BrowserDisposeContextInput,
  },
  {
    name: 'validate_claim',
    description:
      'Re-execute an HTTP call from the proxy (no browser, no shared cookies) to independently verify a claim about a backend response. Use this to confirm "I saw X" reports from sub-agents before escalating as a bug — it eliminates false positives caused by contaminated browser state. Automatically retries on HTTP 429 (honours Retry-After header or exponential back-off, capped) so IP-based rate limits do not break large probe matrices; the response reports how many retries were used.',
    inputSchema: ValidateClaimInput,
  },
  {
    name: 'validate_claims_bulk',
    description:
      'Execute up to 100 validate_claim probes server-side with bounded parallelism (default 8). One MCP roundtrip instead of N — collapse a 32-67 probe REST audit matrix from 1-3 s of serial latency to ~500 ms. Each result carries its own ok/status; partial failures don\'t short-circuit the batch. Set parallelism=1 for IP-rate-limited public SaaS, leave default 8 for localhost targets.',
    inputSchema: ValidateClaimsBulkInput,
  },
  {
    name: 'schema_inventory',
    description:
      'Scan a directory for Drizzle ORM table definitions (sqliteTable / pgTable) and return every table with its columns, indexes, foreign keys. Pair with events_inventory to verify the "every event type has a matching table write" invariant exhaustively, with no manual grep.',
    inputSchema: SchemaInventoryInput,
  },
  {
    name: 'events_inventory',
    description:
      'Parse a directory for zod discriminatedUnion event types and return every event variant with its fields. Use to enumerate the event surface before testing the event-replay invariant — guarantees zero-omission coverage even when the union is split across files.',
    inputSchema: EventsInventoryInput,
  },
  {
    name: 'mcp_tools_inventory',
    description:
      'Parse a packages/mcp/src/tools.ts (or equivalent) and return every entry of TOOL_DEFINITIONS with name + description + input schema reference. Use to validate that every published MCP tool has a runtime handler (no documented-but-unwired tools) and that the allowedTools list of an SDK orchestrator matches the served set.',
    inputSchema: McpToolsInventoryInput,
  },
  {
    name: 'react_hooks_inventory',
    description:
      'Recursively scan a React app directory for exported hooks (export function/const useXxx). Use as the cartography step for UI auditors so they know exactly how many hooks exist and can target each one with at least one render-test.',
    inputSchema: ReactHooksInventoryInput,
  },
  {
    name: 'api_inventory',
    description:
      'Scan a codebase directory and return every declared HTTP route (method, path, source file, line, permission decorator if any). Supports flask, fastapi, express, fastify. Use to build an exhaustive test matrix with zero route omissions. Pass `selfCheck: { baseUrl }` to probe a handful of GET routes against the live backend and detect parsing bugs (suspicious 3xx / 404 / 5xx ratios) BEFORE you build a test matrix on a broken inventory.',
    inputSchema: ApiInventoryInput,
  },
  {
    name: 'read_methodology',
    description:
      '[QA METHODOLOGY ENTRY POINT — call this FIRST before launching any campaign] Returns the unified QA methodology (process/10-methodologie-unifiee.md). Pass `section` to fetch only one part (overview, principles, phase-0..9, etc.) — useful to avoid loading the whole 3000-line doc at once. Defaults to `overview` which gives the 9-phase pipeline + the 9 non-negotiable principles. Pair with start_qa_campaign to begin a tracked run.',
    inputSchema: ReadMethodologyInput,
  },
  {
    name: 'start_qa_campaign',
    description:
      'Start a tracked QA campaign. Returns a campaignId you must pass to record_campaign_metric, submit_campaign_retrospective and end_campaign. Stores cliSource (claude-code, cursor, anthropic-cli, custom CLI…) so historical analytics work across heterogeneous tools. Always call this after read_methodology.',
    inputSchema: StartQaCampaignInput,
  },
  {
    name: 'record_campaign_metric',
    description:
      'Record a numeric/string/boolean metric for an ongoing campaign (coverage, faux positifs %, durée phase, etc.). Used by the orchestrator at each phase boundary to feed the analytics dashboard at /campaigns.',
    inputSchema: RecordCampaignMetricInput,
  },
  {
    name: 'submit_campaign_retrospective',
    description:
      'OBLIGATOIRE before end_campaign. Submit the orchestrator\'s retrospective — what went well, what went badly, key learnings, tooling feedback, recommendations for next time. Persisted alongside the campaign for cross-campaign learning.',
    inputSchema: SubmitCampaignRetrospectiveInput,
  },
  {
    name: 'end_campaign',
    description:
      'Close a campaign. Will REFUSE if no retrospective has been submitted (call submit_campaign_retrospective first). Records the final status and timestamps the closure.',
    inputSchema: EndCampaignInput,
  },
  {
    name: 'set_agent_identity',
    description:
      '[CALL EARLY] Replace the placeholder name of this bridged CLI session with a user-chosen identifier so it appears clearly in the hub. Ask the user "How should I be identified in the agentdeck hub?" before calling. Idempotent — safe to call again to update.',
    inputSchema: SetAgentIdentityInput,
  },
  {
    name: 'spawn_agent',
    description:
      'Register a sub-agent in the current session so it shows up in the AgentTree with its own activity feed, tool-call count and DM thread. CLI-bridge orchestrators (Claude Code Task fan-out, Cursor multi-persona skills, custom Python runners) MUST call this before delegating work — the proxy has no other way to learn the sub-agent exists. Pass the returned agentId as `parentAgentId` of further nested agents to render the tree correctly. Pair with stop_agent at the end of each run.',
    inputSchema: SpawnAgentInput,
  },
  {
    name: 'stop_agent',
    description:
      'Mark a sub-agent (previously created via spawn_agent) as completed/failed/cancelled. The AgentTree status badge flips off the live "running" state and tokensIn/tokensOut totals roll up to the session KPI strip.',
    inputSchema: StopAgentInput,
  },
] as const;

export type ToolName = (typeof TOOL_DEFINITIONS)[number]['name'];
