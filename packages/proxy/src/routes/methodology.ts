import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { getTemplate, listTemplateNames } from '../services/test-targets-loader.js';
import { synthesizeTargetSection, targetFromSectionName } from '../services/target-section-synth.js';

const STATIC_SECTIONS = [
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
] as const;

const STATIC_SECTION_SET = new Set<string>(STATIC_SECTIONS);

const Query = z.object({
  section: z
    .string()
    .min(1)
    .default('overview')
    .describe(
      'Either a known section (overview, principles, phase-0..9, …) or `target-<name>` to fetch a synthesized brief for a test-target template (api, ui, regression, …).',
    ),
});

// Maps a section enum to a regex matching the corresponding heading in the
// methodology markdown. The slice runs from that heading to the next heading
// at the same level (or end-of-file).
const SECTION_HEADINGS: Record<string, RegExp> = {
  overview: /^##\s+0\.\s+/m,
  principles: /^##\s+2\.\s+/m,
  tooling: /^##\s+3\.\s+/m,
  communication: /^##\s+3bis\.\s+/m,
  'pre-start': /^##\s+3ter\.\s+/m,
  personas: /^##\s+4\.\s+/m,
  'phase-0': /^##\s+6\.\s+Phase 0\b/m,
  'phase-1': /^##\s+7\.\s+Phase 1\b/m,
  'phase-2': /^##\s+8\.\s+Phase 2\b/m,
  'phase-3': /^##\s+9\.\s+Phase 3\b/m,
  'phase-4': /^##\s+10\.\s+Phase 4\b/m,
  'phase-5': /^##\s+11\.\s+Phase 5\b/m,
  'phase-6': /^##\s+12\.\s+Phase 6\b/m,
  'phase-7': /^##\s+13\.\s+Phase 7\b/m,
  'phase-9': /^##\s+15\.\s+Phase 9\b/m,
  conventions: /^##\s+16\.\s+/m,
  templates: /^##\s+17\.\s+/m,
  troubleshooting: /^##\s+19\.\s+/m,
  metrics: /^##\s+20\.\s+/m,
};

function sliceSection(full: string, section: string): string {
  if (section === 'full') return full;
  const start = SECTION_HEADINGS[section];
  if (!start) return full;
  const m = start.exec(full);
  if (!m) return full;
  const startIdx = m.index;
  // next H2 after startIdx
  const nextH2 = /\n##\s+/g;
  nextH2.lastIndex = startIdx + 1;
  const nextMatch = nextH2.exec(full);
  const endIdx = nextMatch ? nextMatch.index : full.length;
  return full.slice(startIdx, endIdx).trimEnd();
}

// Methodology Principe 10 — every phase-4 / principles fetch ships with the
// canonical UI-only runbook glued to the response so orchestrators discover it
// without a second tool call.
const UI_DEFAULT_PROCEDURE_PATH = 'procedures/isolated-ui-smoke.md';

async function readUiDefaultProcedure(repoRoot: string): Promise<string | null> {
  try {
    const body = await readFile(resolve(repoRoot, UI_DEFAULT_PROCEDURE_PATH), 'utf8');
    return body.trim();
  } catch {
    return null;
  }
}

function attachUiProcedure(content: string, runbook: string | null): string {
  if (!runbook) return content;
  const banner = [
    '',
    '---',
    '',
    '## Procédure par défaut Phase 4 (Principe 10 — UI-only)',
    '',
    "Cette procédure est le runbook canonique pour tout persona Phase 4. Elle est",
    "annexée automatiquement à `read_methodology({section:'phase-4'})` et",
    "`read_methodology({section:'principles'})` afin que les orchestrators",
    "n'aient pas à la chercher. **Ne pas dévier sans waiver explicite** dans la",
    "rétro (`UI-EXEMPT: <persona>: <raison>`).",
    '',
    `Source : \`${UI_DEFAULT_PROCEDURE_PATH}\``,
    '',
    runbook,
  ].join('\n');
  return content + banner;
}

export const registerMethodologyRoutes: FastifyPluginAsync = async (app) => {
  const path = resolve(config.REPO_ROOT, 'process', '10-methodologie-unifiee.md');

  app.get('/methodology', async (request, reply) => {
    const parsed = Query.safeParse(request.query);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const section = parsed.data.section;

    // 1. Synthetic target-* section: generate from JSON template (no markdown read).
    const targetName = targetFromSectionName(section);
    if (targetName) {
      const tpl = getTemplate(targetName);
      if (!tpl) {
        return reply.code(404).send({
          error: 'unknown_target',
          message: `No template for target "${targetName}". Available: ${listTemplateNames().join(', ') || '(none)'}`,
          section,
          availableTargets: listTemplateNames(),
        });
      }
      const content = await synthesizeTargetSection(tpl, config.REPO_ROOT);
      return {
        section,
        path: `process/test-targets/${targetName}.json`,
        lineCount: content.split('\n').length,
        content,
      };
    }

    // 2. Static section: only enumerated names allowed (rejects typos).
    if (!STATIC_SECTION_SET.has(section)) {
      return reply.code(404).send({
        error: 'unknown_section',
        message:
          `Unknown section "${section}". Use one of: ${STATIC_SECTIONS.join(', ')}, ` +
          `or "target-<name>" with name in: ${listTemplateNames().join(', ') || '(no targets)'}.`,
        section,
        availableStaticSections: [...STATIC_SECTIONS],
        availableTargets: listTemplateNames(),
      });
    }
    let full: string;
    try {
      full = await readFile(path, 'utf8');
    } catch (err) {
      return reply.code(404).send({ error: 'methodology file not found', path, detail: String(err) });
    }
    let content = sliceSection(full, section);
    if (section === 'phase-4' || section === 'principles') {
      const runbook = await readUiDefaultProcedure(config.REPO_ROOT);
      content = attachUiProcedure(content, runbook);
    }
    return {
      section,
      path,
      lineCount: content.split('\n').length,
      content,
    };
  });
};
