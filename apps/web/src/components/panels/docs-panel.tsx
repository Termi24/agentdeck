'use client';
import type { IDockviewPanelProps } from 'dockview-react';
import { useEffect, useMemo, useState } from 'react';
import { useSession } from '@/components/session-context';
import { fetchDoc } from '@/lib/session-api';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export function DocsPanel(_props: IDockviewPanelProps) {
  const { sessionId, events } = useSession();
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);

  const paths = useMemo(() => {
    const map = new Map<string, { path: string; at: string }>();
    for (const ev of events) {
      if (ev.type !== 'doc.published' && ev.type !== 'doc.updated') continue;
      map.set(ev.path, { path: ev.path, at: ev.at });
    }
    return Array.from(map.values()).sort((a, b) => a.path.localeCompare(b.path));
  }, [events]);

  useEffect(() => {
    if (!selectedPath && paths.length > 0 && paths[0]) setSelectedPath(paths[0].path);
  }, [paths, selectedPath]);

  useEffect(() => {
    if (!selectedPath) return;
    let cancelled = false;
    fetchDoc(sessionId, selectedPath)
      .then((doc) => {
        if (!cancelled) setContent(doc.content);
      })
      .catch(() => {
        if (!cancelled) setContent(null);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, selectedPath, events.length]);

  if (paths.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="max-w-sm text-center text-sm text-muted-foreground">
          No documents yet. Agents publish here via <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">publish_doc</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <aside className="w-56 shrink-0 overflow-auto border-r border-border p-2">
        <div className="mb-2 flex items-center gap-2 px-2">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Docs</h3>
          <Badge variant="secondary">{paths.length}</Badge>
        </div>
        <ul className="flex flex-col gap-0.5">
          {paths.map((p) => (
            <li key={p.path}>
              <button
                onClick={() => setSelectedPath(p.path)}
                className={cn(
                  'w-full truncate rounded px-2 py-1 text-left text-xs transition-colors',
                  selectedPath === p.path ? 'bg-secondary text-secondary-foreground' : 'hover:bg-muted',
                )}
              >
                {p.path}
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <div className="flex-1 overflow-auto p-4">
        {selectedPath && (
          <div className="mb-3 font-mono text-xs text-muted-foreground">{selectedPath}</div>
        )}
        <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed">{content ?? '…'}</pre>
      </div>
    </div>
  );
}
