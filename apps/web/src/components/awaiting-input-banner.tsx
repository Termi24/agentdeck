'use client';
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useSession } from '@/components/session-context';

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
  const { pendingInputs } = useSession();
  const [now, setNow] = useState(() => Date.now());

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
        <button
          type="button"
          onClick={focusInput}
          className="ml-2 shrink-0 rounded-md bg-white/15 px-3 py-1.5 text-sm font-semibold ring-1 ring-white/30 transition hover:bg-white/25"
        >
          Répondre maintenant
        </button>
      </div>
    </div>
  );
}
