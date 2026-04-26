'use client';
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, OctagonX } from 'lucide-react';
import { useSession } from '@/components/session-context';
import { requestAgentCancel, submitUserInput } from '@/lib/session-api';

const tickEvery = 1_000;

function fmtElapsed(ms: number): string {
  if (ms < 0) return '0s';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m${r.toString().padStart(2, '0')}s`;
}

/**
 * Bannière rouge sticky en haut de la page de session quand au moins un agent
 * appelle `await_user_input`. Utilise un dégradé pulse + icône animée pour ne
 * PAS passer inaperçue. Préfixe aussi le document.title avec un ⚠ tant qu'il
 * y a une attente, pour que l'utilisateur la voie même depuis un autre onglet.
 */
export function AwaitingInputBanner() {
  const { sessionId, pendingInputs } = useSession();
  const [now, setNow] = useState(() => Date.now());
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (pendingInputs.length === 0) return;
    const id = setInterval(() => setNow(Date.now()), tickEvery);
    return () => clearInterval(id);
  }, [pendingInputs.length]);

  const original = useMemo(() => (typeof document !== 'undefined' ? document.title : ''), []);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (pendingInputs.length === 0) {
      document.title = original;
      return;
    }
    const stripped = original.replace(/^⚠\s*/, '');
    document.title = `⚠ ${pendingInputs.length} attente${pendingInputs.length > 1 ? 's' : ''} — ${stripped}`;
    return () => {
      document.title = original;
    };
  }, [pendingInputs.length, original]);

  if (pendingInputs.length === 0) return null;

  const focusInput = () => {
    document.querySelector<HTMLInputElement>('form input[placeholder^="Inject"]')?.focus();
  };

  // Cancel every awaiting agent: fire request_agent_cancel for each agentId
  // we know about, then submit a clear stop message so the wait endpoint
  // returns to the MCP with cancelled=true. The MCP side translates that
  // into a halt directive for Claude. Idempotent — clicking twice does no
  // harm (cancel rows are deduped server-side).
  const stopAll = async () => {
    if (cancelling || pendingInputs.length === 0) return;
    setCancelling(true);
    try {
      for (const req of pendingInputs) {
        if (!req.agentId) continue;
        try { await requestAgentCancel(sessionId, req.agentId); } catch { /* keep going */ }
      }
      try { await submitUserInput(sessionId, 'stop'); } catch { /* fall back, banner will clear when wait resolves */ }
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="sticky top-14 z-30 border-b-2 border-red-700/80 bg-red-600 text-white shadow-lg"
    >
      <div className="flex items-start gap-3 px-6 py-3">
        <AlertTriangle
          className="mt-0.5 h-6 w-6 shrink-0 animate-pulse"
          aria-hidden
        />
        <div className="flex-1">
          <div className="flex items-baseline gap-2">
            <h2 className="text-base font-bold uppercase tracking-wide">
              Validation humaine requise
            </h2>
            <span className="text-xs font-semibold opacity-90">
              ({pendingInputs.length} agent{pendingInputs.length > 1 ? 's' : ''} en attente)
            </span>
          </div>
          <ul className="mt-2 space-y-1.5 text-sm">
            {pendingInputs.map((req) => {
              const elapsed = now - new Date(req.since).getTime();
              return (
                <li key={req.waitId} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold">
                    {req.agentName ?? req.agentId ?? 'agent inconnu'}
                  </span>
                  <span className="text-xs opacity-80">attend depuis {fmtElapsed(elapsed)}</span>
                  {req.prompt ? (
                    <span className="block w-full text-sm opacity-95 sm:inline sm:w-auto">
                      → {req.prompt}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
        <div className="ml-2 flex shrink-0 flex-col gap-1.5 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={focusInput}
            className="rounded-md bg-white/15 px-3 py-1.5 text-sm font-semibold ring-1 ring-white/30 transition hover:bg-white/25"
          >
            Répondre
          </button>
          <button
            type="button"
            onClick={stopAll}
            disabled={cancelling}
            className="inline-flex items-center gap-1.5 rounded-md bg-black/30 px-3 py-1.5 text-sm font-semibold ring-1 ring-white/40 transition hover:bg-black/50 disabled:opacity-60"
            title="Demande l'arrêt immédiat de tous les agents en attente (request_agent_cancel + submit 'stop')"
          >
            <OctagonX className="h-4 w-4" />
            {cancelling ? 'Stop…' : 'STOP agent'}
          </button>
        </div>
      </div>
    </div>
  );
}
