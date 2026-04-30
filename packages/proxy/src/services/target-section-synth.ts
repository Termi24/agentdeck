/**
 * Synthesize the markdown brief for a `read_methodology({section:"target-<x>"})`
 * call. The brief is auto-generated from the JSON template (process/test-targets/<x>.json)
 * so a single source of truth drives both the gate engine and the orchestrator
 * brief. Drift between the two is impossible by construction.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Gate, TestTargetTemplate } from '@agentdeck/shared';
import { config } from '../config.js';

function fmtGate(g: Gate): string {
  switch (g.source) {
    case 'ui-coverage-principe-10': {
      const hard = g.hardFloor ?? 0.5;
      const warn = g.warnFloor ?? 0.7;
      return `Per-persona UI coverage ratio ≥ ${hard} (warning <${warn}). Waiver: \`UI-EXEMPT: <persona>: <reason>\``;
    }
    case 'metric-min':
      return `\`${g.metric}\` ≥ ${g.minimum}`;
    case 'metric-max':
      return `\`${g.metric}\` ≤ ${g.maximum}`;
    case 'metric-ratio-min':
      return `\`${g.numeratorMetric} / ${g.denominatorMetric}\` ≥ ${g.minimum}`;
  }
}

async function tryReadRunbook(repoRoot: string, name: string): Promise<string | null> {
  try {
    return (await readFile(resolve(repoRoot, 'procedures', name), 'utf8')).trim();
  } catch {
    return null;
  }
}

export async function synthesizeTargetSection(tpl: TestTargetTemplate, repoRoot: string): Promise<string> {
  const lines: string[] = [];
  lines.push(`## Target — \`${tpl.target}\``);
  lines.push('');
  lines.push(tpl.description);
  lines.push('');

  // Phase matrix
  lines.push('### Phase weights (9-phase pipeline)');
  lines.push('');
  lines.push('| Phase | Weight |');
  lines.push('|---|---|');
  for (const phase of [
    'phase-0',
    'phase-1',
    'phase-2',
    'phase-3',
    'phase-4',
    'phase-5',
    'phase-6',
    'phase-7',
    'phase-9',
  ] as const) {
    const w = (tpl.phaseMatrix as Record<string, string | undefined>)[phase] ?? 'full';
    lines.push(`| ${phase} | ${w} |`);
  }
  lines.push('');
  lines.push(
    'Phase weights tell the orchestrator how deep to go on each step. `full` means execute the phase entirely; `light` means do the minimum to satisfy the gate; `skip` means omit (still call out in the retrospective).',
  );
  lines.push('');

  // Specialists
  lines.push('### Specialists to fan out');
  lines.push('');
  if (tpl.specialists.length === 0) {
    lines.push('_No specialist roster. The orchestrator runs solo._');
  } else {
    for (const s of tpl.specialists) {
      lines.push(`- **${s}** — definition at \`.claude/agents/${s}.md\``);
    }
  }
  lines.push('');

  // Runbooks
  lines.push('### Runbooks attached');
  lines.push('');
  if (tpl.runbooks.length === 0) {
    lines.push('_No specific runbook. Apply general methodology phases._');
  } else {
    for (const r of tpl.runbooks) {
      lines.push(`- \`procedures/${r}\``);
    }
  }
  lines.push('');

  // Gates
  lines.push('### Blocking gates (verified at end_campaign)');
  lines.push('');
  if (tpl.gates.length === 0) {
    lines.push('_No gate. end_campaign always passes for this target — use only for ad-hoc explorations._');
  } else {
    lines.push('| Gate | Blocking | Threshold | Source |');
    lines.push('|---|---|---|---|');
    for (const g of tpl.gates) {
      lines.push(`| \`${g.name}\` | ${g.blocking ? 'yes' : 'no'} | ${fmtGate(g)} | \`${g.source}\` |`);
    }
    lines.push('');
    lines.push('**For each gate**, the orchestrator (or the spécialiste it delegates to) MUST call `record_campaign_metric` with the metric name(s) referenced above. Missing metric = gate failure (no silent pass). Add waivers via `<GATE-NAME>-EXEMPT: <subject>: <reason>` lines in `retrospective.toolingFeedback`.');
  }
  lines.push('');

  // How-to
  lines.push('### How to run this target');
  lines.push('');
  lines.push(`\`\`\``);
  lines.push(`# 1. Start the campaign`);
  lines.push(`mcp__agentdeck__start_qa_campaign({ projectName: "<your-project>", target: "${tpl.target}" })`);
  lines.push(`# → returns campaignId`);
  lines.push(``);
  lines.push(`# 2. (As orchestrator) spawn each spécialiste declared above with`);
  lines.push(`#    spawn_agent({ name: "<specialist>", role: "auditor", prompt: "<full skill text>", parentAgentId: <root> })`);
  lines.push(``);
  lines.push(`# 3. After each spécialiste completes, record its metrics:`);
  lines.push(`#    record_campaign_metric({ campaignId, name: "<metric-from-table>", value: <number> })`);
  lines.push(``);
  lines.push(`# 4. Submit the retrospective:`);
  lines.push(`mcp__agentdeck__submit_campaign_retrospective({ campaignId, ... })`);
  lines.push(``);
  lines.push(`# 5. Close (gate engine evaluates here — 422 if any blocking gate fails):`);
  lines.push(`mcp__agentdeck__end_campaign({ campaignId, status: "completed" })`);
  lines.push(`\`\`\``);
  lines.push('');

  // Inline runbooks for convenience (full text appended at end)
  for (const r of tpl.runbooks) {
    const body = await tryReadRunbook(repoRoot, r);
    if (!body) continue;
    lines.push('---');
    lines.push('');
    lines.push(`### Runbook: \`procedures/${r}\``);
    lines.push('');
    lines.push(body);
    lines.push('');
  }

  return lines.join('\n');
}

export function targetFromSectionName(section: string): string | null {
  const m = /^target-(.+)$/.exec(section);
  return m && m[1] ? m[1] : null;
}
