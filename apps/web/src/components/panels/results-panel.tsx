'use client';
import type { IDockviewPanelProps } from 'dockview-react';
import { useMemo } from 'react';
import { useSession } from '@/components/session-context';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface Row {
  id: string;
  suite: string;
  caseName: string;
  status: 'passed' | 'failed' | 'skipped';
  message: string | null;
  at: string;
}

export function ResultsPanel(_props: IDockviewPanelProps) {
  const { events } = useSession();

  const rows = useMemo(() => {
    const out: Row[] = [];
    for (const ev of events) {
      if (ev.type !== 'test.result.reported') continue;
      out.push({
        id: ev.resultId,
        suite: ev.suite,
        caseName: ev.caseName,
        status: ev.status,
        message: ev.message ?? null,
        at: ev.at,
      });
    }
    return out.sort((a, b) => b.at.localeCompare(a.at));
  }, [events]);

  const counts = useMemo(() => {
    const c = { passed: 0, failed: 0, skipped: 0 };
    for (const r of rows) c[r.status] += 1;
    return c;
  }, [rows]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold">Test results</h3>
        <div className="flex items-center gap-2 text-xs">
          <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 text-emerald-200">{counts.passed} passed</span>
          <span className="rounded-md bg-destructive/20 px-2 py-0.5 text-destructive-foreground">{counts.failed} failed</span>
          <span className="rounded-md bg-muted px-2 py-0.5 text-muted-foreground">{counts.skipped} skipped</span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="flex h-full items-center justify-center p-6">
          <p className="max-w-md text-center text-sm text-muted-foreground">
            No test results yet. Agents report them via{' '}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">report_test_result</code>.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card text-left">
              <tr className="border-b border-border">
                <th className="px-4 py-2 font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-2 font-medium text-muted-foreground">Suite</th>
                <th className="px-4 py-2 font-medium text-muted-foreground">Case</th>
                <th className="px-4 py-2 font-medium text-muted-foreground">Message</th>
                <th className="px-4 py-2 font-medium text-muted-foreground">At</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/60">
                  <td className="px-4 py-2">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-2 font-mono">{r.suite}</td>
                  <td className="px-4 py-2 font-mono">{r.caseName}</td>
                  <td className="px-4 py-2 max-w-md truncate text-muted-foreground" title={r.message ?? ''}>{r.message ?? '—'}</td>
                  <td className="px-4 py-2 font-mono text-muted-foreground">{fmt(r.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: Row['status'] }) {
  const cls: Record<Row['status'], string> = {
    passed: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40',
    failed: 'bg-destructive/20 text-destructive-foreground border-destructive/40',
    skipped: 'bg-muted text-muted-foreground border-border',
  };
  return (
    <span className={cn('rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase', cls[status])}>
      {status}
    </span>
  );
}

function fmt(iso: string): string {
  try { return new Date(iso).toLocaleTimeString(); } catch { return iso; }
}

export function ResultsBadge({ events }: { events: unknown[] }) {
  void events;
  return <Badge variant="secondary">R</Badge>;
}
