import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { errors as pwErrors } from 'playwright';
import {
  disposeAgentContext,
  getBrowserHeadlessMode,
  getPage,
  isBrowserLaunched,
  listAgentContexts,
  recordScreenshot,
  resetAgentContext,
  screenshotPath,
} from '../services/browser-manager.js';
import type { EventBus } from '../event-bus.js';
import { appendEvent } from '../persistence.js';

/**
 * Playwright raises `TimeoutError` for both selector misses and waitFor*
 * deadlines. Treat these as caller errors (the element/state really wasn't
 * there in the allotted window), not server errors — without this branch
 * every "selector not found" leaked as an HTTP 500 with a 30 s wall-clock,
 * which made probes look like proxy bugs in the agentdeck UX feedback.
 */
function isPlaywrightTimeout(err: unknown): boolean {
  if (err instanceof pwErrors.TimeoutError) return true;
  if (err instanceof Error && err.name === 'TimeoutError') return true;
  return false;
}

/**
 * Strip Playwright stack frames, ANSI escape sequences, and `file://` paths
 * out of error messages before they leave the proxy. Without this, 500 bodies
 * leak install paths + library versions to any local caller.
 */
function sanitizePlaywrightError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw
    // strip ANSI escape sequences
    // eslint-disable-next-line no-control-regex
    .replace(/\[[0-9;]*m/g, '')
    // drop `at file:///path/to/foo.js:line:col` stack frames
    .replace(/\s*at\s+(?:async\s+)?(?:file:\/\/|\/|[A-Za-z]:\\).*$/gm, '')
    // drop bare `file://...` URLs anywhere in the body
    .replace(/file:\/\/\S+/g, '<path>')
    // collapse repeated blank lines
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 1024);
}

const AgentIdField = z.string().min(1).optional();

// Default short timeout for "is the element here right now?" probes.
// Playwright's own default is 30 s, which is fine when you're driving a
// known UI but punishingly long for selector-existence checks (cookie
// banners, optional inputs, conditional buttons). Agents can override
// when they really mean "wait up to N seconds for this to appear".
const DEFAULT_LOCATOR_TIMEOUT_MS = 3_000;

const NavBody = z.object({ url: z.string().url(), agentId: AgentIdField });
const SnapQuery = z.object({ agentId: AgentIdField });
const ClickBody = z.object({
  selector: z.string().min(1),
  agentId: AgentIdField,
  timeoutMs: z.coerce.number().int().positive().max(60_000).default(DEFAULT_LOCATOR_TIMEOUT_MS),
});
const TypeBody = z.object({
  selector: z.string().min(1),
  text: z.string(),
  pressEnter: z.boolean().optional(),
  agentId: AgentIdField,
  timeoutMs: z.coerce.number().int().positive().max(60_000).default(DEFAULT_LOCATOR_TIMEOUT_MS),
});
const FillBody = z.object({
  fields: z.array(z.object({ selector: z.string().min(1), value: z.string() })).min(1),
  agentId: AgentIdField,
  timeoutMs: z.coerce.number().int().positive().max(60_000).default(DEFAULT_LOCATOR_TIMEOUT_MS),
});
const WaitBody = z.object({
  text: z.string().optional(),
  textGone: z.string().optional(),
  selector: z.string().optional(),
  timeoutMs: z.coerce.number().int().positive().max(120_000).default(15_000),
  agentId: AgentIdField,
});
const KeyBody = z.object({ key: z.string().min(1), agentId: AgentIdField });
const ShotBody = z.object({
  caption: z.string().optional(),
  fullPage: z.boolean().optional(),
  agentId: z.string().optional(),
});
const ContextBody = z.object({
  agentId: z.string().min(1),
  reset: z.boolean().optional(),
  /** UI launch mode for the session-level Browser. First call wins. */
  headless: z.boolean().optional(),
});

export const registerBrowserRoutes: FastifyPluginAsync<{ eventBus: EventBus }> = async (app, { eventBus }) => {
  app.post('/sessions/:id/browser/navigate', async (request, reply) => {
    const { id: sessionId } = request.params as { id: string };
    const parsed = NavBody.safeParse(request.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    try {
      const page = await getPage(sessionId, parsed.data.agentId);
      await page.goto(parsed.data.url, { waitUntil: 'domcontentloaded' });
      return { url: page.url(), title: await page.title() };
    } catch (err) {
      return reply.internalServerError(sanitizePlaywrightError(err));
    }
  });

  app.get('/sessions/:id/browser/snapshot', async (request, reply) => {
    const { id: sessionId } = request.params as { id: string };
    const parsed = SnapQuery.safeParse(request.query);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    try {
      const page = await getPage(sessionId, parsed.data.agentId);
      return {
        url: page.url(),
        title: await page.title(),
        text: (await page.innerText('body')).slice(0, 30_000),
      };
    } catch (err) {
      return reply.internalServerError(sanitizePlaywrightError(err));
    }
  });

  app.post('/sessions/:id/browser/click', async (request, reply) => {
    const { id: sessionId } = request.params as { id: string };
    const parsed = ClickBody.safeParse(request.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    try {
      const page = await getPage(sessionId, parsed.data.agentId);
      await page.click(parsed.data.selector, { timeout: parsed.data.timeoutMs });
      return { ok: true };
    } catch (err) {
      if (isPlaywrightTimeout(err)) {
        return reply.code(404).send({
          ok: false,
          error: 'element not found',
          selector: parsed.data.selector,
          timeoutMs: parsed.data.timeoutMs,
        });
      }
      return reply.internalServerError(sanitizePlaywrightError(err));
    }
  });

  app.post('/sessions/:id/browser/type', async (request, reply) => {
    const { id: sessionId } = request.params as { id: string };
    const parsed = TypeBody.safeParse(request.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    try {
      const page = await getPage(sessionId, parsed.data.agentId);
      await page.fill(parsed.data.selector, parsed.data.text, { timeout: parsed.data.timeoutMs });
      if (parsed.data.pressEnter) await page.press(parsed.data.selector, 'Enter', { timeout: parsed.data.timeoutMs });
      return { ok: true };
    } catch (err) {
      if (isPlaywrightTimeout(err)) {
        return reply.code(404).send({
          ok: false,
          error: 'element not found',
          selector: parsed.data.selector,
          timeoutMs: parsed.data.timeoutMs,
        });
      }
      return reply.internalServerError(sanitizePlaywrightError(err));
    }
  });

  app.post('/sessions/:id/browser/fill-form', async (request, reply) => {
    const { id: sessionId } = request.params as { id: string };
    const parsed = FillBody.safeParse(request.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    try {
      const page = await getPage(sessionId, parsed.data.agentId);
      let filled = 0;
      for (const f of parsed.data.fields) {
        try {
          await page.fill(f.selector, f.value, { timeout: parsed.data.timeoutMs });
          filled++;
        } catch (err) {
          if (isPlaywrightTimeout(err)) {
            return reply.code(404).send({
              ok: false,
              error: 'element not found',
              selector: f.selector,
              filled,
              total: parsed.data.fields.length,
              timeoutMs: parsed.data.timeoutMs,
            });
          }
          throw err;
        }
      }
      return { ok: true, filled };
    } catch (err) {
      return reply.internalServerError(sanitizePlaywrightError(err));
    }
  });

  app.post('/sessions/:id/browser/wait-for', async (request, reply) => {
    const { id: sessionId } = request.params as { id: string };
    const parsed = WaitBody.safeParse(request.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const { text, textGone, selector, timeoutMs } = parsed.data;
    if (!selector && !text && !textGone) {
      return reply.badRequest('provide one of: selector, text, textGone');
    }
    try {
      const page = await getPage(sessionId, parsed.data.agentId);
      type DomWindow = { document: { body: { innerText: string } } };
      if (selector) await page.waitForSelector(selector, { timeout: timeoutMs });
      else if (text) await page.waitForFunction((t: string) => (globalThis as unknown as DomWindow).document.body.innerText.includes(t), text, { timeout: timeoutMs });
      else if (textGone) await page.waitForFunction((t: string) => !(globalThis as unknown as DomWindow).document.body.innerText.includes(t), textGone, { timeout: timeoutMs });
      return { ok: true, satisfied: true };
    } catch (err) {
      if (isPlaywrightTimeout(err)) {
        // Returning 200 here (not 4xx) is intentional: a wait_for that
        // resolves "no, the condition was never met" is a normal probe
        // outcome, not a caller error. Agents branch on `satisfied`.
        return {
          ok: true,
          satisfied: false,
          reason: 'timeout',
          timeoutMs,
          waitedFor: selector ? { selector } : text ? { text } : { textGone },
        };
      }
      return reply.internalServerError(sanitizePlaywrightError(err));
    }
  });

  app.post('/sessions/:id/browser/press-key', async (request, reply) => {
    const { id: sessionId } = request.params as { id: string };
    const parsed = KeyBody.safeParse(request.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    try {
      const page = await getPage(sessionId, parsed.data.agentId);
      await page.keyboard.press(parsed.data.key);
      return { ok: true };
    } catch (err) {
      return reply.internalServerError(sanitizePlaywrightError(err));
    }
  });

  app.post('/sessions/:id/browser/screenshot', async (request, reply) => {
    const { id: sessionId } = request.params as { id: string };
    const parsed = ShotBody.safeParse(request.body ?? {});
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    try {
      const page = await getPage(sessionId, parsed.data.agentId);
      const name = `${Date.now()}-${randomUUID().slice(0, 8)}.png`;
      const full = screenshotPath(sessionId, name);
      await page.screenshot({ path: full, fullPage: parsed.data.fullPage ?? false });
      const id = recordScreenshot({
        sessionId,
        agentId: parsed.data.agentId ?? null,
        url: page.url(),
        imagePath: full,
        caption: parsed.data.caption ?? null,
      });
      const event = {
        type: 'browser.screenshot.taken' as const,
        sessionId,
        screenshotId: id,
        agentId: parsed.data.agentId ?? null,
        url: page.url(),
        imagePath: full,
        caption: parsed.data.caption ?? null,
        at: new Date().toISOString(),
      };
      appendEvent(event);
      eventBus.emit(event);
      return { screenshotId: id, path: full, url: page.url() };
    } catch (err) {
      return reply.internalServerError(sanitizePlaywrightError(err));
    }
  });

  // ---- Per-agent context lifecycle ----

  app.post('/sessions/:id/browser/context', async (request, reply) => {
    const { id: sessionId } = request.params as { id: string };
    const parsed = ContextBody.safeParse(request.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    try {
      const headlessOpt = parsed.data.headless;
      const beforeLaunched = isBrowserLaunched(sessionId);
      const page = parsed.data.reset
        ? await resetAgentContext(sessionId, parsed.data.agentId, { headless: headlessOpt })
        : await getPage(sessionId, parsed.data.agentId, { headless: headlessOpt });
      return {
        ok: true,
        agentId: parsed.data.agentId,
        url: page.url(),
        headless: getBrowserHeadlessMode(sessionId) ?? true,
        browserAlreadyLaunched: beforeLaunched,
      };
    } catch (err) {
      return reply.internalServerError(sanitizePlaywrightError(err));
    }
  });

  app.delete('/sessions/:id/browser/context/:agentId', async (request, reply) => {
    const { id: sessionId, agentId } = request.params as { id: string; agentId: string };
    try {
      const existed = await disposeAgentContext(sessionId, agentId);
      return { ok: true, existed };
    } catch (err) {
      return reply.internalServerError(sanitizePlaywrightError(err));
    }
  });

  app.get('/sessions/:id/browser/contexts', async (request, reply) => {
    const { id: sessionId } = request.params as { id: string };
    try {
      const agents = await listAgentContexts(sessionId);
      return { agents };
    } catch (err) {
      return reply.internalServerError(sanitizePlaywrightError(err));
    }
  });

  app.get('/sessions/:id/browser/screenshot/:sid', async (request, reply) => {
    const { sid } = request.params as { id: string; sid: string };
    const { getDb } = await import('../db.js');
    const { browserScreenshots } = await import('@agentdeck/shared');
    const { eq } = await import('drizzle-orm');
    const row = getDb().select().from(browserScreenshots).where(eq(browserScreenshots.id, sid)).get();
    if (!row) return reply.notFound(`screenshot ${sid} not found`);
    const { readFileSync, existsSync } = await import('node:fs');
    if (!existsSync(row.imagePath)) return reply.notFound(`image file missing`);
    reply.header('content-type', 'image/png');
    return reply.send(readFileSync(row.imagePath));
  });
};
