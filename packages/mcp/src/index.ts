#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { setTimeout as wait } from 'node:timers/promises';
import { TOOL_DEFINITIONS, type ToolName } from './tools.js';
import { ProxyClient } from './proxy-client.js';
import { config } from './config.js';

const SERVER_INSTRUCTIONS = `agentdeck — local QA orchestrator + 44 MCP tools for exhaustive
multi-persona test campaigns following the unified 9-phase methodology.
Web UI: http://127.0.0.1:3000

When the user asks to test, audit, QA, or "use agentdeck" on a project:

0a. URLs FIRST. The very first tool call (any tool) returns a header that
    contains the dashboard URL, the campaigns URL, and your bridged-session
    URL. RELAY these URLs to the user verbatim in your next message so they
    can open the dashboard and watch the campaign live. The dashboard port
    may differ between runs (auto-spawn picks the first free port from
    3000-3010 — same logic for proxy on 4317-4327), so do NOT hardcode them.

0b. IDENTITY. The bridge session that was just created for you has a
    placeholder name ("unnamed-cli" or similar). Before doing anything else
    intensive, ASK the user: "How should I be identified in the agentdeck
    hub? (e.g. 'claude-code-orchestrator', 'cursor-runner', 'desktop-claude'…)"
    Then call mcp__agentdeck__set_agent_identity({ name: <user-chosen>,
    role: <optional> }) so the hub UI shows a meaningful name. Skip this
    step ONLY if the user pre-supplied a name.

1. Call mcp__agentdeck__read_methodology({ section: "overview" }) to load the
   pipeline and the 9 non-negotiable principles. Then call
   read_methodology({ section: "pre-start" }) to verify the toolchain is ready.

2. Call mcp__agentdeck__start_qa_campaign({ projectName, cliSource, notes })
   to register a tracked campaign. Keep the returned campaignId for every
   subsequent record_campaign_metric / submit_campaign_retrospective / end_campaign call.

3. Walk the 9-phase pipeline (Phase 0..9). Before executing any phase, call
   read_methodology({ section: "phase-N" }) to load that phase's exact steps,
   gate criteria, anti-patterns and templates.

NON-NEGOTIABLE PRINCIPLES (read_methodology({section:"principles"}) for full text):
- 1 persona = 1 isolated BrowserContext (browser_new_context({reset:true}) on first call)
- Cartography before test (api_inventory)
- Claim validation before escalation (validate_claim)
- 2 targets/orgs minimum
- 3 distinct buckets BUG / UX / MISS
- Typed channel (post_to_channel) + DM (send_direct) — never freeform markdown
- Cleanup with prefix TEST-QA-<CAMPAIGN_ID>-

YOU ARE FREE to spawn as many sub-agents and define as many personas as you want
for the project at hand. Personas are project-specific (an ERP needs different
roles than a marketplace). The methodology imposes the principles, not the cast.

CLOSURE GATE: agentdeck refuses end_campaign without submit_campaign_retrospective.
Always submit a critical retrospective (whatWentWell / whatWentBadly / keyLearnings /
toolingFeedback / recommendations) before closing — it feeds cross-campaign learning.

If you ever need a quick reminder of one section, call read_methodology with
section ∈ {overview, principles, tooling, communication, pre-start, personas,
phase-0..7, phase-9, conventions, templates, troubleshooting, metrics, full}.`;

const server = new Server(
  { name: 'agentdeck', version: '0.0.1' },
  { capabilities: { tools: {} }, instructions: SERVER_INSTRUCTIONS },
);
const proxy = new ProxyClient();

const toolList: Tool[] = TOOL_DEFINITIONS.map((t) => ({
  name: t.name,
  description: t.description,
  inputSchema: z.toJSONSchema(t.inputSchema) as Tool['inputSchema'],
}));

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolList }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const name = request.params.name as ToolName;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;
  try {
    await proxy.ensureReady();
    const text = await dispatch(name, args);
    const banner = proxy.maybeSessionBanner();
    return { content: [{ type: 'text', text: banner ? `${banner}\n\n${text}` : text }] };
  } catch (err) {
    return { content: [{ type: 'text', text: err instanceof Error ? err.message : String(err) }], isError: true };
  }
});

async function dispatch(name: ToolName, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'list_procedures': {
      const { procedures } = await proxy.listProcedures();
      if (procedures.length === 0) return 'No procedures available.';
      return procedures.map((p) => `- ${p.name} (${p.format})${p.description ? ` — ${p.description}` : ''}`).join('\n');
    }
    case 'run_test_procedure': {
      const proc = await proxy.getProcedure(String(args.name ?? ''));
      const argsInfo = args.args ? `\n\nCaller arguments:\n${JSON.stringify(args.args, null, 2)}` : '';
      return `Procedure "${proc.name}" (${proc.format}):\n\n${proc.content}${argsInfo}\n\nExecute it using the available agentdeck tools and report_test_result at the end.`;
    }
    case 'post_to_channel': {
      const { messageId } = await proxy.postChannel(String(args.content ?? ''));
      return `Posted to channel (id ${messageId.slice(0, 8)}).`;
    }
    case 'read_channel': {
      const { messages } = await proxy.readChannel({
        since: typeof args.since === 'string' ? args.since : undefined,
        limit: typeof args.limit === 'number' ? args.limit : undefined,
      });
      if (messages.length === 0) return 'Channel is empty.';
      return messages.map((m) => `[${m.createdAt}] ${m.fromAgentName}: ${m.content}`).join('\n');
    }
    case 'publish_doc': {
      const { docId } = await proxy.publishDoc(String(args.path ?? ''), String(args.content ?? ''));
      return `Published doc "${args.path}" (id ${docId.slice(0, 8)}).`;
    }
    case 'sandbox_write': {
      const { bytes } = await proxy.sandboxWrite(String(args.path ?? ''), String(args.content ?? ''));
      return `Wrote ${bytes} bytes to sandbox:${args.path}.`;
    }
    case 'sandbox_read': {
      const { content } = await proxy.sandboxRead(String(args.path ?? ''));
      return content;
    }
    case 'sandbox_exec': {
      const timeoutMs = typeof args.timeoutMs === 'number' ? args.timeoutMs : undefined;
      const result = await proxy.sandboxExec(String(args.command ?? ''), timeoutMs);
      const header = `runId=${result.runId} exit=${result.exitCode} duration=${result.durationMs}ms${result.timedOut ? ' [TIMED OUT]' : ''}`;
      const parts = [header];
      if (result.stdout) parts.push(`--- stdout ---\n${result.stdout}`);
      if (result.stderr) parts.push(`--- stderr ---\n${result.stderr}`);
      return parts.join('\n');
    }
    case 'report_test_result': {
      const { resultId } = await proxy.reportTestResult({
        suite: String(args.suite ?? ''),
        caseName: String(args.caseName ?? ''),
        status: (args.status as 'passed' | 'failed' | 'skipped') ?? 'failed',
        message: typeof args.message === 'string' ? args.message : undefined,
        evidence: args.evidence,
      });
      return `Reported ${args.status} for ${args.suite} / ${args.caseName} (id ${resultId.slice(0, 8)}).`;
    }
    case 'project_memory_read': {
      try {
        const row = await proxy.memoryRead(String(args.key ?? ''));
        return row.value;
      } catch (err) {
        if (err instanceof Error && /404/.test(err.message)) return '';
        throw err;
      }
    }
    case 'project_memory_write': {
      await proxy.memoryWrite(String(args.key ?? ''), String(args.value ?? ''));
      return `Memory "${args.key}" saved.`;
    }
    case 'send_direct': {
      const { messageId } = await proxy.sendDirect(String(args.toAgentId ?? ''), String(args.content ?? ''));
      return `DM sent (id ${messageId.slice(0, 8)}).`;
    }
    case 'read_direct': {
      const { agentId: me } = await proxy.ensureReady();
      const { messages } = await proxy.readDirect(typeof args.limit === 'number' ? args.limit : undefined);
      const visible = messages.filter((m) => m.toAgentId === me);
      if (visible.length === 0) return 'No direct messages.';
      return visible.map((m) => `[${m.createdAt}] ${m.fromAgentName}: ${m.content}`).join('\n');
    }
    case 'secrets_get': {
      const { value } = await proxy.secretsGet(String(args.name ?? ''));
      return value;
    }
    case 'wait_for_channel': {
      const pattern = new RegExp(String(args.pattern ?? ''));
      const timeoutMs = typeof args.timeoutMs === 'number' ? args.timeoutMs : 120_000;
      const started = Date.now();
      let since: string | undefined;
      while (Date.now() - started < timeoutMs) {
        const { messages } = await proxy.readChannel({ since, limit: 200 });
        const hit = messages.find((m) => pattern.test(m.content));
        if (hit) return `[${hit.createdAt}] ${hit.fromAgentName}: ${hit.content}`;
        if (messages.length > 0) since = messages[messages.length - 1]!.createdAt;
        await wait(1000);
      }
      return `(timeout after ${timeoutMs}ms waiting for /${args.pattern}/)`;
    }
    case 'await_user_input': {
      const timeoutMs = typeof args.timeoutMs === 'number' ? args.timeoutMs : 120_000;
      const prompt = typeof args.prompt === 'string' ? args.prompt : null;
      if (prompt) await proxy.postChannel(`[await_user_input] ${prompt}`);
      const ctx = proxy.currentAgentContext();
      const sessionUrl = proxy.sessionUrl();
      // Surface the wait on stderr so CLI hosts that pipe MCP stderr show the
      // user a hint without needing the dashboard. Best-effort, ignored by
      // hosts that don't surface MCP stderr.
      try {
        process.stderr.write(`[agentdeck] ${ctx?.agentName ?? 'agent'} is awaiting your input — open ${sessionUrl}\n`);
      } catch {}
      const result = await proxy.awaitUserInput(timeoutMs, {
        agentId: ctx?.agentId ?? null,
        agentName: ctx?.agentName ?? null,
        prompt,
      });
      if (!result) {
        return `(no user input within ${timeoutMs}ms — tell the human user explicitly that you were waiting and timed out, then ask them how to proceed)`;
      }
      // The model reads this string. Tell it to relay clearly so the human in
      // the CLI knows the agent is unblocked even if they ignored the toast.
      return `[user replied via dashboard]: ${result.content}`;
    }
    case 'diff_exec': {
      const result = await proxy.diffExec(String(args.runIdA ?? ''), String(args.runIdB ?? ''));
      const parts = [
        `exit a=${result.a.exitCode} b=${result.b.exitCode} (changed: ${result.exitCodeChanged})`,
        `stdout +${result.stdoutDiff.added.length} -${result.stdoutDiff.removed.length}`,
      ];
      if (result.stdoutDiff.added.length) parts.push('added:\n' + result.stdoutDiff.added.map((l) => '+ ' + l).join('\n'));
      if (result.stdoutDiff.removed.length) parts.push('removed:\n' + result.stdoutDiff.removed.map((l) => '- ' + l).join('\n'));
      return parts.join('\n\n');
    }
    case 'request_agent_cancel': {
      const { agentId: aid, at } = await proxy.requestAgentCancel(String(args.agentId ?? ''));
      return `Cancel requested for ${aid} at ${at}.`;
    }
    case 'check_cancellation': {
      const { agentId } = await proxy.ensureReady();
      const r = await proxy.checkCancellation(agentId);
      return r.cancelled ? `CANCELLED (at ${r.requestedAt})` : 'not cancelled';
    }
    case 'browser_navigate': {
      const r = await proxy.browserNavigate(String(args.url ?? ''));
      return `Loaded ${r.url} — "${r.title}"`;
    }
    case 'browser_snapshot': {
      const r = await proxy.browserSnapshot();
      return `URL: ${r.url}\nTitle: ${r.title}\n---\n${r.text}`;
    }
    case 'browser_click': {
      const r = await proxy.browserClick(
        String(args.selector ?? ''),
        typeof args.timeoutMs === 'number' ? { timeoutMs: args.timeoutMs } : undefined,
      );
      if (r.ok) return `Clicked ${args.selector}`;
      return `Element not found: ${r.selector} (gave up after ${r.timeoutMs}ms). Increase timeoutMs or check the page state.`;
    }
    case 'browser_type': {
      const r = await proxy.browserType(
        String(args.selector ?? ''),
        String(args.text ?? ''),
        typeof args.pressEnter === 'boolean' ? args.pressEnter : undefined,
        typeof args.timeoutMs === 'number' ? { timeoutMs: args.timeoutMs } : undefined,
      );
      if (r.ok) return `Typed into ${args.selector}`;
      return `Element not found: ${r.selector} (gave up after ${r.timeoutMs}ms). Increase timeoutMs or check the page state.`;
    }
    case 'browser_fill_form': {
      const fields = (args.fields as Array<{ selector: string; value: string }>) ?? [];
      const r = await proxy.browserFillForm(
        fields,
        typeof args.timeoutMs === 'number' ? { timeoutMs: args.timeoutMs } : undefined,
      );
      if (r.ok) return `Filled ${r.filled} fields`;
      return `Filled ${r.filled}/${r.total} fields, then could not find: ${r.selector} (gave up after ${r.timeoutMs}ms).`;
    }
    case 'browser_wait_for': {
      const r = await proxy.browserWaitFor({
        text: typeof args.text === 'string' ? args.text : undefined,
        textGone: typeof args.textGone === 'string' ? args.textGone : undefined,
        selector: typeof args.selector === 'string' ? args.selector : undefined,
        timeoutMs: typeof args.timeoutMs === 'number' ? args.timeoutMs : undefined,
      });
      if (r.satisfied) return 'Wait condition satisfied.';
      const target = JSON.stringify(r.waitedFor);
      return `Wait NOT satisfied (${r.reason} after ${r.timeoutMs}ms): waiting for ${target}.`;
    }
    case 'browser_press_key': {
      await proxy.browserPressKey(String(args.key ?? ''));
      return `Pressed ${args.key}`;
    }
    case 'browser_screenshot': {
      const r = await proxy.browserScreenshot({
        caption: typeof args.caption === 'string' ? args.caption : undefined,
        fullPage: typeof args.fullPage === 'boolean' ? args.fullPage : undefined,
      });
      return `Screenshot saved (id ${r.screenshotId.slice(0, 8)}) for ${r.url}`;
    }
    case 'browser_new_context': {
      const r = await proxy.browserNewContext({
        agentId: typeof args.agentId === 'string' ? args.agentId : undefined,
        reset: typeof args.reset === 'boolean' ? args.reset : undefined,
      });
      return `Isolated browser context ready for agent ${r.agentId} (at ${r.url})`;
    }
    case 'browser_dispose_context': {
      const r = await proxy.browserDisposeContext({
        agentId: typeof args.agentId === 'string' ? args.agentId : undefined,
      });
      return r.existed ? 'Context disposed.' : 'No context to dispose.';
    }
    case 'validate_claim': {
      const r = await proxy.validateClaim({
        method: args.method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
        url: String(args.url ?? ''),
        headers: (args.headers as Record<string, string> | undefined) ?? undefined,
        body: args.body,
        expectStatus: args.expectStatus as number | '2xx' | '3xx' | '4xx' | '5xx' | undefined,
        expectJsonContains: (args.expectJsonContains as Record<string, unknown> | undefined) ?? undefined,
        expectBodyIncludes: typeof args.expectBodyIncludes === 'string' ? args.expectBodyIncludes : undefined,
        timeoutMs: typeof args.timeoutMs === 'number' ? args.timeoutMs : undefined,
        followRedirects: typeof args.followRedirects === 'boolean' ? args.followRedirects : undefined,
        maxRedirects: typeof args.maxRedirects === 'number' ? args.maxRedirects : undefined,
      });
      const lines = [
        `verdict: ${r.ok ? 'HOLDS' : 'REJECTED'}`,
        `status: ${r.status} (${r.durationMs}ms, ${r.contentType ?? 'no content-type'})`,
      ];
      if (r.redirectChain.length > 0) {
        lines.push(
          `redirects: ${r.redirectChain
            .map((h) => `${h.status} → ${h.to}${h.authorizationDropped ? ' [Authorization dropped]' : ''}`)
            .join('; ')}`,
        );
        if (r.finalUrl !== String(args.url ?? '')) lines.push(`final URL: ${r.finalUrl}`);
      }
      if (r.retries > 0) lines.push(`retries: ${r.retries} (slept ${r.backoffMs}ms total)`);
      if (r.mismatches.length) lines.push('mismatches:\n- ' + r.mismatches.join('\n- '));
      if (r.sampleBody) lines.push(`sample body (${r.sampleBody.length} chars):\n${r.sampleBody}`);
      return lines.join('\n');
    }
    case 'validate_claims_bulk': {
      const r = await proxy.validateClaimsBulk({
        claims: args.claims as Parameters<typeof proxy.validateClaimsBulk>[0]['claims'],
        parallelism: typeof args.parallelism === 'number' ? args.parallelism : undefined,
      });
      const head = `verdict: ${r.passed}/${r.total} claims hold (${r.durationMs}ms total)`;
      const failures = r.results
        .map((c, i) => ({ ...c, idx: i }))
        .filter((c) => !c.ok)
        .slice(0, 20);
      if (failures.length === 0) return head;
      const detail = failures
        .map((f) => {
          const claim = (args.claims as Array<{ method: string; url: string }>)[f.idx];
          const where = claim ? `${claim.method} ${claim.url}` : `claim[${f.idx}]`;
          if (f.error) return `  ✗ ${where}  error: ${f.error}`;
          const mm = (f.mismatches ?? []).join('; ') || `status=${f.status}`;
          return `  ✗ ${where}  ${mm}`;
        })
        .join('\n');
      return `${head}\n\nFailures (showing up to 20):\n${detail}`;
    }
    case 'schema_inventory': {
      const r = await proxy.schemaInventory({ rootPath: String(args.rootPath ?? '') });
      const lines = [
        `schema: scanned ${r.scannedFiles} file(s), ${r.tables.length} table(s) total`,
        '',
        ...r.tables.map(
          (t) =>
            `  ${t.name.padEnd(30)} cols=${String(t.columns.length).padStart(2)} idx=${String(t.indexes.length).padStart(2)} fk=${String(t.foreignKeys.length).padStart(2)}  [${t.file}:${t.line}]`,
        ),
      ];
      return lines.join('\n');
    }
    case 'events_inventory': {
      const r = await proxy.eventsInventory({ rootPath: String(args.rootPath ?? '') });
      const lines = [
        `events: scanned ${r.scannedFiles} file(s), ${r.events.length} event type(s)${r.discriminator ? ` (discriminator=${r.discriminator})` : ''}`,
        '',
        ...r.events.map((e) => `  ${e.type.padEnd(40)} fields=${e.fields.length}  [${e.file}:${e.line}]`),
      ];
      return lines.join('\n');
    }
    case 'mcp_tools_inventory': {
      const r = await proxy.mcpToolsInventory({ rootPath: String(args.rootPath ?? '') });
      const lines = [
        `mcp tools: ${r.tools.length} entries  [${r.file}]`,
        '',
        ...r.tools.map((t) => `  ${t.name.padEnd(38)} schema=${t.inputSchema}`),
      ];
      return lines.join('\n');
    }
    case 'react_hooks_inventory': {
      const r = await proxy.reactHooksInventory({ rootPath: String(args.rootPath ?? '') });
      const lines = [
        `react hooks: scanned ${r.scannedFiles} file(s), ${r.hooks.length} hook(s)`,
        '',
        ...r.hooks.map((h) => `  ${h.name.padEnd(38)} kind=${h.kind}  [${h.file}:${h.line}]`),
      ];
      return lines.join('\n');
    }
    case 'api_inventory': {
      const r = await proxy.apiInventory({
        framework: args.framework as 'flask' | 'express' | 'fastapi' | 'fastify',
        rootPath: String(args.rootPath ?? ''),
        summary: typeof args.summary === 'boolean' ? args.summary : undefined,
        filter: (args.filter as { method?: string; pathPrefix?: string; blueprint?: string } | undefined) ?? undefined,
        limit: typeof args.limit === 'number' ? args.limit : undefined,
        offset: typeof args.offset === 'number' ? args.offset : undefined,
      });

      // Summary mode: compact aggregate, no per-route list. Roughly 50×
      // smaller than the full payload — cheap first call on big codebases.
      if (r.summary && !r.routes) {
        const lines = [
          `framework=${r.framework} files=${r.scannedFiles} routes=${r.summary.total}`,
          `by method: ${Object.entries(r.summary.byMethod).map(([m, n]) => `${m}=${n}`).join(' ')}`,
          '',
          'by blueprint:',
          ...Object.entries(r.summary.byBlueprint)
            .sort(([, a], [, b]) => Object.values(b).reduce((s, n) => s + n, 0) - Object.values(a).reduce((s, n) => s + n, 0))
            .map(([bp, methods]) => {
              const total = Object.values(methods).reduce((s, n) => s + n, 0);
              const detail = Object.entries(methods).map(([m, n]) => `${m}=${n}`).join(' ');
              return `  ${bp.padEnd(30)} total=${String(total).padStart(4)}  ${detail}`;
            }),
          '',
          `Call again with filter={method,pathPrefix,blueprint} or summary:false + limit/offset for the per-route list.`,
        ];
        return lines.join('\n');
      }

      const routes = r.routes ?? [];
      const head = r.paging
        ? `framework=${r.framework} files=${r.scannedFiles} routes=${r.summary?.total ?? routes.length} (showing ${r.paging.returned} of ${r.paging.totalAfterFilter} after filter, offset=${r.paging.offset})`
        : `framework=${r.framework} files=${r.scannedFiles} routes=${routes.length}`;
      const rows = routes
        .map(
          (rt) =>
            `${rt.method.padEnd(6)} ${rt.path}  [${rt.file}:${rt.line}]${rt.permissionRequired ? ` perm=${rt.permissionRequired}` : ''}`,
        )
        .join('\n');
      return `${head}\n\n${rows}`;
    }
    case 'read_methodology': {
      const section = String(args.section ?? 'overview');
      const r = await proxy.readMethodology(section);
      return `# Methodology — section "${r.section}" (${r.lineCount} lines)\nSource: ${r.path}\n\n${r.content}`;
    }
    case 'start_qa_campaign': {
      const r = await proxy.startCampaign({
        projectName: String(args.projectName ?? ''),
        cliSource: String(args.cliSource ?? 'claude-code'),
        notes: typeof args.notes === 'string' ? args.notes : undefined,
      });
      return `Campaign ${r.campaignId} started at ${r.startedAt}.\n\nNext steps:\n1. Pass campaignId="${r.campaignId}" to record_campaign_metric calls\n2. At the end, submit_campaign_retrospective then end_campaign\n3. Browse history at http://127.0.0.1:3000/campaigns`;
    }
    case 'record_campaign_metric': {
      const campaignId = String(args.campaignId ?? '');
      const name = String(args.name ?? '');
      const value = args.value as number | string | boolean;
      const tags = args.tags as Record<string, string> | undefined;
      await proxy.recordCampaignMetric(campaignId, { name, value, tags });
      return `Metric "${name}" recorded for campaign ${campaignId}.`;
    }
    case 'submit_campaign_retrospective': {
      const campaignId = String(args.campaignId ?? '');
      const r = await proxy.submitCampaignRetrospective(campaignId, {
        whatWentWell: String(args.whatWentWell ?? ''),
        whatWentBadly: String(args.whatWentBadly ?? ''),
        keyLearnings: String(args.keyLearnings ?? ''),
        toolingFeedback: String(args.toolingFeedback ?? ''),
        recommendations: String(args.recommendations ?? ''),
      });
      return `Retrospective submitted for campaign ${campaignId} at ${r.submittedAt}. You may now call end_campaign.`;
    }
    case 'end_campaign': {
      const campaignId = String(args.campaignId ?? '');
      const status = (args.status as 'completed' | 'aborted' | 'failed') ?? 'completed';
      const r = await proxy.endCampaign(campaignId, status);
      return `Campaign ${campaignId} closed with status="${r.status}" at ${r.endedAt}.`;
    }
    case 'set_agent_identity': {
      const name = typeof args.name === 'string' ? args.name : undefined;
      const role = typeof args.role === 'string' ? args.role : undefined;
      const r = await proxy.setAgentIdentity({ name, role });
      return `Agent identity updated: name="${r.name ?? '(unchanged)'}"${r.role ? `, role="${r.role}"` : ''}. You now appear as such in the agentdeck hub.`;
    }
    case 'spawn_agent': {
      const r = await proxy.spawnAgent({
        name: String(args.name ?? ''),
        role: typeof args.role === 'string' ? args.role : undefined,
        prompt: typeof args.prompt === 'string' ? args.prompt : '',
        parentAgentId: typeof args.parentAgentId === 'string' ? args.parentAgentId : undefined,
        model: typeof args.model === 'string' ? args.model : undefined,
      });
      return `Spawned sub-agent "${args.name}" (id ${r.agentId}). Pass parentAgentId="${r.agentId}" to further nested agents, and call stop_agent({agentId:"${r.agentId}"}) when the work is done.`;
    }
    case 'stop_agent': {
      const r = await proxy.stopAgent({
        agentId: String(args.agentId ?? ''),
        status: (args.status as 'completed' | 'failed' | 'cancelled') ?? 'completed',
        tokensIn: typeof args.tokensIn === 'number' ? args.tokensIn : undefined,
        tokensOut: typeof args.tokensOut === 'number' ? args.tokensOut : undefined,
      });
      return `Sub-agent ${r.agentId} marked ${r.status}.`;
    }
    case 'task_plan': {
      const r = await proxy.taskPlan({
        agentId: String(args.agentId ?? ''),
        title: String(args.title ?? ''),
        description: typeof args.description === 'string' ? args.description : undefined,
        plannedStart: String(args.plannedStart ?? ''),
        plannedEnd: String(args.plannedEnd ?? ''),
        dependencies: Array.isArray(args.dependencies) ? (args.dependencies as string[]) : undefined,
      });
      return `Task ${r.taskId} planned.`;
    }
    case 'task_update_progress': {
      await proxy.taskUpdateProgress({
        taskId: String(args.taskId ?? ''),
        progressPct: typeof args.progressPct === 'number' ? args.progressPct : 0,
        status: args.status as 'planned' | 'in_progress' | 'blocked' | 'completed' | 'cancelled' | undefined,
      });
      return `Task ${args.taskId} progress=${args.progressPct}%${args.status ? ` status=${args.status}` : ''}.`;
    }
    case 'task_complete': {
      await proxy.taskComplete({
        taskId: String(args.taskId ?? ''),
        status: (args.status as 'completed' | 'cancelled' | undefined) ?? 'completed',
      });
      return `Task ${args.taskId} marked ${args.status ?? 'completed'}.`;
    }
    default: {
      const _exhaustive: never = name;
      void _exhaustive;
      throw new Error(`unknown tool: ${name as string}`);
    }
  }
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
