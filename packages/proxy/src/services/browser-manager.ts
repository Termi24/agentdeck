import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { getDb } from '../db.js';
import { browserScreenshots, sessions } from '@agentdeck/shared';
import { eq } from 'drizzle-orm';

interface SessionBrowser {
  browser: Browser;
  /** Default context shared when no agentId is supplied (back-compat). */
  defaultContext: BrowserContext;
  defaultPage: Page;
  /** Per-agent isolated contexts — each with its own cookies/localStorage/SW. */
  agentContexts: Map<string, { context: BrowserContext; page: Page }>;
}

const sessionsMap = new Map<string, Promise<SessionBrowser>>();

async function tryLaunch(): Promise<Browser> {
  const errors: Error[] = [];
  for (const channel of ['chrome', 'msedge', undefined]) {
    try {
      return await chromium.launch({ headless: true, channel });
    } catch (err) {
      errors.push(err instanceof Error ? err : new Error(String(err)));
    }
  }
  throw new Error(`failed to launch any chromium channel: ${errors.map((e) => e.message).join(' | ')}`);
}

async function openFor(sessionId: string): Promise<SessionBrowser> {
  const existing = sessionsMap.get(sessionId);
  if (existing) return existing;
  const promise = (async () => {
    const browser = await tryLaunch();
    const defaultContext = await browser.newContext();
    const defaultPage = await defaultContext.newPage();
    return { browser, defaultContext, defaultPage, agentContexts: new Map() };
  })();
  sessionsMap.set(sessionId, promise);
  try {
    return await promise;
  } catch (err) {
    sessionsMap.delete(sessionId);
    throw err;
  }
}

/**
 * Get or create a Page for a given agent within a session. When `agentId` is
 * provided, the agent gets a dedicated BrowserContext — cookies, localStorage,
 * service workers, and cache are isolated from every other agent in the same
 * session. Without `agentId`, falls back to the session-level default page
 * (back-compat with the original single-context behaviour).
 */
export async function getPage(sessionId: string, agentId?: string): Promise<Page> {
  const b = await openFor(sessionId);
  if (!agentId) return b.defaultPage;
  const existing = b.agentContexts.get(agentId);
  if (existing) return existing.page;
  const context = await b.browser.newContext();
  const page = await context.newPage();
  b.agentContexts.set(agentId, { context, page });
  return page;
}

/**
 * Force-recreate a fresh isolated context for an agent, discarding any
 * previous cookies/localStorage. Useful when impersonating a different
 * persona between test phases.
 */
export async function resetAgentContext(sessionId: string, agentId: string): Promise<Page> {
  const b = await openFor(sessionId);
  const existing = b.agentContexts.get(agentId);
  if (existing) {
    try {
      await existing.context.close();
    } catch {
      /* ignore */
    }
    b.agentContexts.delete(agentId);
  }
  const context = await b.browser.newContext();
  const page = await context.newPage();
  b.agentContexts.set(agentId, { context, page });
  return page;
}

export async function disposeAgentContext(sessionId: string, agentId: string): Promise<boolean> {
  const existing = sessionsMap.get(sessionId);
  if (!existing) return false;
  const b = await existing;
  const agentCtx = b.agentContexts.get(agentId);
  if (!agentCtx) return false;
  try {
    await agentCtx.context.close();
  } catch {
    /* ignore */
  }
  b.agentContexts.delete(agentId);
  return true;
}

export async function listAgentContexts(sessionId: string): Promise<string[]> {
  const existing = sessionsMap.get(sessionId);
  if (!existing) return [];
  const b = await existing;
  return [...b.agentContexts.keys()];
}

export async function closeFor(sessionId: string): Promise<void> {
  const existing = sessionsMap.get(sessionId);
  if (!existing) return;
  sessionsMap.delete(sessionId);
  try {
    const b = await existing;
    for (const { context } of b.agentContexts.values()) {
      try {
        await context.close();
      } catch {
        /* ignore */
      }
    }
    b.agentContexts.clear();
    await b.defaultContext.close();
    await b.browser.close();
  } catch {
    /* ignore */
  }
}

export function screenshotPath(sessionId: string, name: string): string {
  const session = getDb().select().from(sessions).where(eq(sessions.id, sessionId)).get();
  if (!session) throw new Error(`session ${sessionId} not found`);
  const dir = resolve(session.workspacePath, 'screenshots');
  mkdirSync(dir, { recursive: true });
  return join(dir, name);
}

export function recordScreenshot(args: { sessionId: string; agentId: string | null; url: string | null; imagePath: string; caption: string | null }) {
  const id = randomUUID();
  getDb().insert(browserScreenshots).values({ id, ...args }).run();
  return id;
}
