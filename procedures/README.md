# Procedures

Test procedures available to agents via the MCP tool `run_test_procedure`.

Each procedure is a YAML or Markdown file at the root of this directory. The `name` used by `run_test_procedure` is the filename without extension.

## Format

YAML or Markdown. Markdown runbooks are free-form instructions the agent reads via `run_test_procedure` and executes using its other tools (`sandbox_exec`, `browser_*`, `validate_claim`, etc.). YAML runbooks have a stricter shape with `inputs:` and `steps:`.

Minimal YAML example:

```yaml
name: smoke-login
description: Basic login flow smoke test against the staging SaaS.
inputs:
  email: string
  password: string
steps:
  - visit: https://staging.example.com/login
  - fill: { selector: "#email", value: "{{ email }}" }
  - fill: { selector: "#password", value: "{{ password }}" }
  - click: "#submit"
  - expect_url: https://staging.example.com/dashboard
```

## Index — what each runbook is for

### Cross-cutting (read these first)

| File | Phase | Purpose |
|---|---|---|
| `SAAS-PREREQS.md` | 0 | Pre-campaign checklist. Skipping any item is the #1 cause of a campaign burning its first hour on environmental friction. **Run before every new SaaS target.** |
| `METHODOLOGY-REVIEW.md` | meta | Post-mortems (IndusForge, eyeot ERP). Where the 10 non-negotiable principles came from. |
| `agentdeck-review-plan.md` | meta | 7-day self-audit campaign plan (orchestrator + 9 specialists + claim-validator + patch-agent). |

### Campaign on a target SaaS

| File | Phase | Purpose |
|---|---|---|
| `exhaustive-campaign.md` | 0-9 | **Meta-runbook** chaining all phases of the unified 9-phase methodology end to end. |
| `exhaustive-crud-test.md` | 2-3 | Full CRUD matrix, zero-omission. Driven by `api_inventory`. |
| `isolated-ui-smoke.md` | 4 | **Default Phase 4 runbook** (since v0.0.7, Principe 10). Parallel UI personas through `browser_new_context` — no contamination. Auto-attached to `read_methodology({section:'phase-4' \| 'principles'})`. |
| `rbac-probe.md` | 4-5 | Privilege matrix audit (allow-should-deny + deny-should-allow). |
| `claim-validator.md` | 5 | Background triage of sub-agent bug reports via `validate_claim` — anti-hallucination. |
| `browser-smoke.md` | 1 | Sanity check of the Playwright tool surface (run before a UI campaign). |
| `smoke-math.md` | 0 | Minimal SDK loop sanity check (no SaaS target needed). |
| `inventory-node.md` | 1 | Reference template for cartographying a Node/Fastify backend. |

### Self-audit (target = agentdeck itself)

Each maps to a specialist sub-agent type defined in `~/.claude/agents/`.

| File | Specialist | Scope |
|---|---|---|
| `audit-rest.md` | rest-auditor | Every Fastify route in `packages/proxy/src/routes/`. Happy-path + 1-per-class failure-path. |
| `audit-schema.md` | schema-auditor | 19 Drizzle tables × 25 zod events × `z.toJSONSchema()` round-trip. |
| `audit-mcp.md` | mcp-auditor | Every one of the 47 MCP tools called at least once with effect verified. |
| `audit-event-replay.md` | event-replay-auditor | Event-sourcing invariant: REST counts == events fold. UI scrubber consistency. |
| `audit-perf.md` | perf-auditor | Event-bus throughput, REST p50/p95, UI render with ≥ 5000 synthetic events, scrubber responsiveness. |
| `audit-ui-playwright.md` | ui-playwright-auditor | Dashboard `/`, `/sessions/[id]`, `/sessions/[id]/dockview`, 9 fixed tabs, scrubber, UserInputBar, a11y pass. |
| `audit-sdk-translator.md` | sdk-translator-auditor | Black-box of the 3 maps in `sdk-translator.ts` via probe session with nested `Task` sub-agents. |
| `audit-security.md` | security-auditor | AES-256-GCM round-trip, sandbox path-traversal, no-auth proxy surface, install-claude idempotency, master-key rotation. |
| `audit-integration.md` | integration-auditor | Full E2E: real non-bridge SDK session that itself spawns Task sub-agents, every event lands in the UI, cancel mid-flight, replay matches pre-cancel state. |
| `audit-regression.md` | regression-tester | Re-runs `_qa/regression-suite.jsonl` (≤ 2 min). Daily / per-commit health check. |

### Implementation memos

| File | Status | Purpose |
|---|---|---|
| `design-memo-B-TRANS-1.md` | accepted | SDK translator hard problem (subagent message attribution). |
| `session-handover-2026-04-25.md` | archived | Snapshot of in-flight work at 2026-04-25 (round-1 self-audit). |

## How agents discover procedures

`mcp__agentdeck__list_procedures` returns the registered set; `mcp__agentdeck__run_test_procedure({name})` returns the runbook content so the calling agent can execute it. Both tools hit the proxy DB cache (`procedures` table), populated at boot from this directory.
