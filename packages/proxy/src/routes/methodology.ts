import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';

const Query = z.object({
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

export const registerMethodologyRoutes: FastifyPluginAsync = async (app) => {
  const path = resolve(config.REPO_ROOT, 'process', '10-methodologie-unifiee.md');

  app.get('/methodology', async (request, reply) => {
    const parsed = Query.safeParse(request.query);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    let full: string;
    try {
      full = await readFile(path, 'utf8');
    } catch (err) {
      return reply
        .code(404)
        .send({ error: 'methodology file not found', path, detail: String(err) });
    }
    const content = sliceSection(full, parsed.data.section);
    return {
      section: parsed.data.section,
      path,
      lineCount: content.split('\n').length,
      content,
    };
  });
};
