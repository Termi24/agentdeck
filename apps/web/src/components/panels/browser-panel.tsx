'use client';
import type { IDockviewPanelProps } from 'dockview-react';
import { useMemo, useState } from 'react';
import { useSession } from '@/components/session-context';
import { screenshotUrl } from '@/lib/session-api';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface Shot { id: string; url: string | null; caption: string | null; at: string; }

export function BrowserPanel(_props: IDockviewPanelProps) {
  const { events, sessionId } = useSession();

  const shots = useMemo(() => {
    const out: Shot[] = [];
    for (const ev of events) {
      if (ev.type !== 'browser.screenshot.taken') continue;
      out.push({ id: ev.screenshotId, url: ev.url ?? null, caption: ev.caption ?? null, at: ev.at });
    }
    return out.sort((a, b) => b.at.localeCompare(a.at));
  }, [events]);

  const [selected, setSelected] = useState<string | null>(null);
  const active = selected ?? shots[0]?.id ?? null;

  if (shots.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="max-w-md text-center text-sm text-muted-foreground">
          Browser panel is idle. Agents open pages via{' '}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">browser_navigate</code> and attach screenshots via{' '}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">browser_screenshot</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <aside className="w-64 shrink-0 overflow-auto border-r border-border p-2">
        <div className="mb-2 flex items-center gap-2 px-2">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Screenshots</h3>
          <Badge variant="secondary">{shots.length}</Badge>
        </div>
        <ul className="flex flex-col gap-0.5">
          {shots.map((s) => (
            <li key={s.id}>
              <button
                onClick={() => setSelected(s.id)}
                className={cn(
                  'flex w-full flex-col gap-0.5 rounded px-2 py-1.5 text-left transition-colors',
                  active === s.id ? 'bg-secondary text-secondary-foreground' : 'hover:bg-muted',
                )}
              >
                <span className="truncate font-mono text-[10px] text-muted-foreground">{fmt(s.at)}</span>
                {s.url && <span className="truncate text-xs">{s.url}</span>}
                {s.caption && <span className="truncate text-[10px] text-muted-foreground">{s.caption}</span>}
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <div className="flex-1 overflow-auto bg-black/50 p-4">
        {active && (
          <img
            src={screenshotUrl(sessionId, active)}
            alt="browser screenshot"
            className="mx-auto max-w-full rounded border border-border shadow-lg"
          />
        )}
      </div>
    </div>
  );
}

function fmt(iso: string): string {
  try { return new Date(iso).toLocaleTimeString(); } catch { return iso; }
}
