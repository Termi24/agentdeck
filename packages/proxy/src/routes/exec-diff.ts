import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { execRuns } from '@agentdeck/shared';
import { getDb } from '../db.js';

const DiffQuery = z.object({ a: z.string().min(1), b: z.string().min(1) });

export const registerExecDiffRoutes: FastifyPluginAsync = async (app) => {
  app.get('/sessions/:id/exec-runs/:rid', async (request, reply) => {
    const { id: sessionId, rid } = request.params as { id: string; rid: string };
    const row = getDb()
      .select()
      .from(execRuns)
      .where(and(eq(execRuns.sessionId, sessionId), eq(execRuns.id, rid)))
      .get();
    if (!row) return reply.notFound(`exec run ${rid} not found`);
    return { ...row, createdAt: toIsoTimestamp(row.createdAt) };
  });

  app.get('/sessions/:id/exec-diff', async (request, reply) => {
    const { id: sessionId } = request.params as { id: string };
    const parsed = DiffQuery.safeParse(request.query);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const [rowA, rowB] = [parsed.data.a, parsed.data.b].map((rid) =>
      getDb().select().from(execRuns).where(and(eq(execRuns.sessionId, sessionId), eq(execRuns.id, rid))).get(),
    );
    if (!rowA) return reply.notFound(`exec run ${parsed.data.a} not found`);
    if (!rowB) return reply.notFound(`exec run ${parsed.data.b} not found`);
    return {
      a: { id: rowA.id, command: rowA.command, exitCode: rowA.exitCode, stdout: rowA.stdout, stderr: rowA.stderr },
      b: { id: rowB.id, command: rowB.command, exitCode: rowB.exitCode, stdout: rowB.stdout, stderr: rowB.stderr },
      exitCodeChanged: rowA.exitCode !== rowB.exitCode,
      stdoutDiff: simpleLineDiff(rowA.stdout, rowB.stdout),
      stderrDiff: simpleLineDiff(rowA.stderr, rowB.stderr),
    };
  });
};

// Mirror persistence.ts:toIso() — SQLite stores "YYYY-MM-DD HH:MM:SS" with no
// timezone, which Chrome parses as local time. Force ISO 8601 UTC at the boundary.
function toIsoTimestamp(dt: string): string {
  if (dt.includes('T')) return dt;
  return dt.replace(' ', 'T') + 'Z';
}

function simpleLineDiff(a: string, b: string): { added: string[]; removed: string[] } {
  const linesA = new Set(a.split('\n'));
  const linesB = new Set(b.split('\n'));
  const added: string[] = [];
  const removed: string[] = [];
  for (const line of linesB) if (!linesA.has(line)) added.push(line);
  for (const line of linesA) if (!linesB.has(line)) removed.push(line);
  return { added, removed };
}
