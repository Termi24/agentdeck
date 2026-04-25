'use client';
import type { IDockviewPanelProps } from 'dockview-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { deleteSecret, fetchSecrets, writeSecret, type SecretListEntry } from '@/lib/session-api';

interface SecretsPanelParams { projectId: string; }

export function SecretsPanel(props: IDockviewPanelProps<SecretsPanelParams>) {
  const { projectId } = props.params;
  const [rows, setRows] = useState<SecretListEntry[]>([]);
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = () => {
    fetchSecrets(projectId)
      .then((r) => setRows(r.secrets))
      .catch(() => setRows([]));
  };
  useEffect(reload, [projectId]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await writeSecret(projectId, name.trim(), value);
      setName('');
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
          <h3 className="text-sm font-semibold">Project secrets</h3>
          <Badge variant="secondary">{rows.length}</Badge>
          <span className="font-mono text-[10px] text-muted-foreground">{projectId}</span>
        </div>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-2 border-b border-border p-3">
        <Input placeholder="secret name (e.g. STAGING_API_KEY)" value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="value (never displayed after save)" type="password" value={value} onChange={(e) => setValue(e.target.value)} />
        <Button type="submit" size="sm" disabled={busy || !name.trim()}>Save encrypted</Button>
        <p className="text-[10px] text-muted-foreground">AES-256-GCM with master key in ~/.agentdeck/master.key (or AGENTDECK_SECRETS_KEY env).</p>
      </form>

      <div className="flex-1 overflow-auto p-3">
        {rows.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">No secrets. Agents read them via secrets_get.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {rows.map((r) => (
              <li key={r.name} className="flex items-center gap-2 rounded-md border border-border bg-card p-2 font-mono text-xs">
                <span className="flex-1 truncate">{r.name}</span>
                <span className="text-muted-foreground">{fmt(r.updatedAt)}</span>
                <button
                  className="text-[10px] text-destructive hover:underline"
                  onClick={async () => { await deleteSecret(projectId, r.name); reload(); }}
                >delete</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function fmt(iso: string): string {
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}
