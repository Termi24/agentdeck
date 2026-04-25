'use client';
import type { IDockviewPanelProps } from 'dockview-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { deleteMemory, fetchMemory, writeMemory, type MemoryRow } from '@/lib/session-api';
import { useSession } from '@/components/session-context';

interface MemoryPanelParams { projectId: string; }

export function MemoryPanel(props: IDockviewPanelProps<MemoryPanelParams>) {
  const { projectId } = props.params;
  const { events } = useSession();
  const [rows, setRows] = useState<MemoryRow[]>([]);
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = () => {
    fetchMemory(projectId)
      .then((r) => setRows(r.entries))
      .catch(() => setRows([]));
  };

  useEffect(reload, [projectId]);

  useEffect(() => {
    const hasUpdate = events.some((e) => e.type === 'memory.updated' && e.projectId === projectId);
    if (hasUpdate) reload();
  }, [events, projectId]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!key.trim()) return;
    setBusy(true);
    try {
      await writeMemory(projectId, key.trim(), value);
      setKey('');
      setValue('');
      reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Project memory</h3>
          <Badge variant="secondary">{rows.length}</Badge>
          <span className="font-mono text-[10px] text-muted-foreground">{projectId}</span>
        </div>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-2 border-b border-border p-3">
        <Input placeholder="key" value={key} onChange={(e) => setKey(e.target.value)} />
        <Textarea placeholder="value" rows={3} value={value} onChange={(e) => setValue(e.target.value)} />
        <Button type="submit" size="sm" disabled={busy || !key.trim()}>Save</Button>
      </form>

      <div className="flex-1 overflow-auto p-3">
        {rows.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">Empty. Agents persist knowledge here via project_memory_write.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((r) => (
              <li key={r.key} className="rounded-md border border-border bg-card p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold">{r.key}</span>
                  <button
                    className="text-[10px] text-destructive hover:underline"
                    onClick={async () => { await deleteMemory(projectId, r.key); reload(); }}
                  >delete</button>
                </div>
                <pre className="whitespace-pre-wrap font-mono text-xs text-muted-foreground">{r.value}</pre>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
