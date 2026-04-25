'use client';
import type { IDockviewPanelProps } from 'dockview-react';
import { useMemo } from 'react';
import { useSession } from '@/components/session-context';
import { Badge } from '@/components/ui/badge';

interface FileEntry {
  path: string;
  lastOp: 'create' | 'modify' | 'delete';
  at: string;
}

export function SandboxPanel(_props: IDockviewPanelProps) {
  const { events } = useSession();

  const entries = useMemo(() => {
    const map = new Map<string, FileEntry>();
    for (const ev of events) {
      if (ev.type !== 'sandbox.file.changed') continue;
      map.set(ev.path, { path: ev.path, lastOp: ev.op, at: ev.at });
    }
    return Array.from(map.values()).sort((a, b) => b.at.localeCompare(a.at));
  }, [events]);

  if (entries.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="max-w-md text-center text-sm text-muted-foreground">
          Isolated sandbox is empty. Agents read/write/exec here via{' '}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">sandbox_*</code> tools.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-4">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-sm font-semibold">Sandbox files</h3>
        <Badge variant="secondary">{entries.length}</Badge>
      </div>
      <ul className="flex flex-col gap-1.5">
        {entries.map((f) => (
          <li key={f.path} className="flex items-center gap-2 rounded-md border border-border bg-card p-2 font-mono text-xs">
            <Badge variant={f.lastOp === 'delete' ? 'destructive' : 'outline'}>{f.lastOp}</Badge>
            <span className="flex-1 truncate">{f.path}</span>
            <span className="text-muted-foreground">{fmt(f.at)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString();
  } catch {
    return iso;
  }
}
