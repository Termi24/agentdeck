'use client';
import type { IDockviewPanelProps } from 'dockview-react';
import { useEffect, useState } from 'react';
import { fetchProcedure, fetchProcedures, type ProcedureSummary } from '@/lib/session-api';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export function ProceduresPanel(_props: IDockviewPanelProps) {
  const [procs, setProcs] = useState<ProcedureSummary[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);

  useEffect(() => {
    fetchProcedures()
      .then((r) => setProcs(r.procedures))
      .catch(() => setProcs([]));
  }, []);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    fetchProcedure(selected)
      .then((p) => {
        if (!cancelled) setContent(p.content);
      })
      .catch(() => {
        if (!cancelled) setContent(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  if (procs === null) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading procedures…</div>;
  }

  if (procs.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="max-w-md text-center text-sm text-muted-foreground">
          No procedures yet. Drop YAML or Markdown runbooks in the <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">procedures/</code>{' '}
          directory. Agents call them via <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">run_test_procedure</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <aside className="w-64 shrink-0 overflow-auto border-r border-border p-2">
        <div className="mb-2 flex items-center gap-2 px-2">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Procedures</h3>
          <Badge variant="secondary">{procs.length}</Badge>
        </div>
        <ul className="flex flex-col gap-0.5">
          {procs.map((p) => (
            <li key={p.name}>
              <button
                onClick={() => setSelected(p.name)}
                className={cn(
                  'flex w-full flex-col gap-0.5 rounded px-2 py-1.5 text-left transition-colors',
                  selected === p.name ? 'bg-secondary text-secondary-foreground' : 'hover:bg-muted',
                )}
              >
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-xs font-medium">{p.name}</span>
                  <Badge variant="outline" className="text-[9px]">
                    {p.format}
                  </Badge>
                </span>
                {p.description && <span className="truncate text-[10px] text-muted-foreground">{p.description}</span>}
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <div className="flex-1 overflow-auto p-4">
        {selected && <div className="mb-3 font-mono text-xs text-muted-foreground">{selected}</div>}
        <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed">{content ?? 'Select a procedure on the left.'}</pre>
      </div>
    </div>
  );
}
