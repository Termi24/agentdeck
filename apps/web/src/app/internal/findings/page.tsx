'use client';
/**
 * Self-bug-tracker admin page (FB-10). Lists every captured `internal_finding`
 * with filters + per-row actions. Polls /internal/findings every 8s. Mark
 * fixed / wontfix triggers a PATCH and refreshes locally.
 */
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  Bug,
  ChevronLeft,
  Info,
  RefreshCw,
  Trash2,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  deleteInternalFinding,
  getFindingsSummary,
  listInternalFindings,
  patchInternalFinding,
  type FindingSeverity,
  type FindingStatus,
  type FindingsSummary,
  type InternalFinding,
} from '@/lib/api';
import { usePollingInterval } from '@/lib/use-polling';
import { relativeTime } from '@/components/session/shared';

const SEVERITY_TONE: Record<FindingSeverity, string> = {
  info: 'border-sky-500/30 bg-sky-500/10 text-sky-400',
  warn: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  error: 'border-red-500/30 bg-red-500/10 text-red-400',
  critical: 'border-red-500/40 bg-red-500/20 text-red-300',
};

const STATUS_TONE: Record<FindingStatus, string> = {
  open: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  triaged: 'border-sky-500/30 bg-sky-500/10 text-sky-400',
  fixed: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  wontfix: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-400',
};

export default function InternalFindingsPage() {
  const [findings, setFindings] = useState<InternalFinding[]>([]);
  const [summary, setSummary] = useState<FindingsSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<FindingStatus | 'all'>('open');
  const [severityFilter, setSeverityFilter] = useState<FindingSeverity | 'all'>('all');
  const [openFinding, setOpenFinding] = useState<InternalFinding | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [rows, sum] = await Promise.all([
        listInternalFindings({ status: statusFilter, severity: severityFilter, limit: 200 }),
        getFindingsSummary(),
      ]);
      setFindings(rows);
      setSummary(sum);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  }, [statusFilter, severityFilter]);

  usePollingInterval(refresh, 8_000, [refresh]);

  // Tick state to keep relative-time chips fresh.
  const [, setTick] = useState(0);
  useEffect(() => {
    const h = setInterval(() => setTick((t) => t + 1), 5_000);
    return () => clearInterval(h);
  }, []);

  const onMark = async (id: string, status: FindingStatus) => {
    try {
      await patchInternalFinding(id, { status });
      void refresh();
    } catch (err) {
      console.error(err);
    }
  };

  const onDelete = async (id: string) => {
    try {
      await deleteInternalFinding(id);
      setOpenFinding(null);
      void refresh();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <main className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border/60 bg-background/80 px-6 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted/40 hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            All projects
          </Link>
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-amber-500/10">
            <Bug className="h-4 w-4 text-amber-400" />
          </div>
          <div>
            <h1 className="text-sm font-semibold leading-tight">internal findings</h1>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              agentdeck self-bug-tracker
            </p>
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={() => void refresh()} className="h-8 text-xs">
          <RefreshCw className="mr-1 h-3.5 w-3.5" />
          Refresh
        </Button>
      </header>

      <SummaryStrip summary={summary} />

      <section className="flex flex-wrap items-center gap-2 px-6 py-4">
        <div className="flex items-center gap-1 rounded-md border border-border/60 p-0.5">
          {(['open', 'triaged', 'fixed', 'wontfix', 'all'] as const).map((k) => (
            <button
              type="button"
              key={k}
              onClick={() => setStatusFilter(k)}
              className={`rounded px-2 py-1 text-xs capitalize transition-colors ${
                statusFilter === k
                  ? 'bg-primary/15 text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {k}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-md border border-border/60 p-0.5">
          {(['all', 'critical', 'error', 'warn', 'info'] as const).map((k) => (
            <button
              type="button"
              key={k}
              onClick={() => setSeverityFilter(k)}
              className={`rounded px-2 py-1 text-xs capitalize transition-colors ${
                severityFilter === k
                  ? 'bg-primary/15 text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {k}
            </button>
          ))}
        </div>
      </section>

      {loadError && (
        <div className="mx-6 mb-4">
          <Card className="border-red-500/40 bg-red-500/5">
            <CardContent className="py-3 text-sm text-red-400">
              Proxy unreachable: <code className="rounded bg-background/40 px-1 text-xs">{loadError}</code>
            </CardContent>
          </Card>
        </div>
      )}

      <section className="flex-1 px-6 pb-10">
        {findings.length === 0 ? (
          <Card className="border-dashed border-border/60 bg-transparent">
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/30">
                <Bug className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">no findings match these filters</p>
              <p className="max-w-md text-xs text-muted-foreground">
                When agentdeck encounters an exception, a 5xx response, a Playwright crash, a zod
                refusal, or any uncaught error, the bug-tracker captures it here automatically.
                If the list is empty, the proxy is healthy.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="overflow-hidden border-border/60 bg-card/40">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b border-border/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Severity</th>
                    <th className="px-3 py-2 text-left font-medium">Source</th>
                    <th className="px-3 py-2 text-left font-medium">Category</th>
                    <th className="px-3 py-2 text-left font-medium">Message</th>
                    <th className="px-3 py-2 text-right font-medium">Occurrences</th>
                    <th className="px-3 py-2 text-right font-medium">Last seen</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                    <th className="px-3 py-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {findings.map((f) => (
                    <tr
                      key={f.id}
                      className="cursor-pointer border-b border-border/30 transition-colors hover:bg-muted/30"
                      onClick={() => setOpenFinding(f)}
                    >
                      <td className="px-3 py-2">
                        <SeverityBadge severity={f.severity} />
                      </td>
                      <td className="px-3 py-2 font-mono text-muted-foreground">{f.source}</td>
                      <td className="px-3 py-2 font-mono">{f.category}</td>
                      <td className="max-w-md truncate px-3 py-2 text-foreground/80">{f.message}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{f.occurrences}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {relativeTime(f.lastSeenAt)}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className={`text-[9px] ${STATUS_TONE[f.status]}`}>
                          {f.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                        {f.status === 'open' && (
                          <button
                            type="button"
                            onClick={() => void onMark(f.id, 'fixed')}
                            className="rounded px-1.5 py-0.5 text-[10px] text-emerald-400 hover:bg-emerald-500/10"
                          >
                            mark fixed
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>

      <FindingDetailSheet
        finding={openFinding}
        onClose={() => setOpenFinding(null)}
        onMark={(s) => openFinding && void onMark(openFinding.id, s)}
        onDelete={() => openFinding && void onDelete(openFinding.id)}
      />
    </main>
  );
}

function SummaryStrip({ summary }: { summary: FindingsSummary | null }) {
  if (!summary) return null;
  return (
    <section className="grid grid-cols-2 gap-3 px-6 pt-4 md:grid-cols-4">
      <SummaryCard label="open" value={summary.open} icon={AlertTriangle} highlight={summary.open > 0} />
      <SummaryCard label="critical + error open" value={summary.openHighSeverity} icon={AlertOctagon} highlight={summary.openHighSeverity > 0} />
      <SummaryCard label="fixed" value={summary.fixed} icon={Info} />
      <SummaryCard label="total" value={summary.total} icon={Bug} />
    </section>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  highlight,
}: {
  label: string;
  value: number;
  icon: typeof Bug;
  highlight?: boolean;
}) {
  return (
    <Card className="border-border/60 bg-card/40">
      <CardContent className="flex items-center gap-3 p-4">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md border ${
            highlight
              ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
              : 'border-border/60 bg-muted/20 text-muted-foreground'
          }`}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex flex-col">
          <span className={`text-2xl font-semibold tabular-nums ${highlight ? 'text-amber-400' : 'text-foreground'}`}>
            {value}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function SeverityBadge({ severity }: { severity: FindingSeverity }) {
  return (
    <Badge variant="outline" className={`text-[9px] uppercase ${SEVERITY_TONE[severity]}`}>
      {severity}
    </Badge>
  );
}

function FindingDetailSheet({
  finding,
  onClose,
  onMark,
  onDelete,
}: {
  finding: InternalFinding | null;
  onClose: () => void;
  onMark: (s: FindingStatus) => void;
  onDelete: () => void;
}) {
  return (
    <Sheet open={!!finding} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-[90vw] flex-col gap-0 p-0 sm:max-w-2xl">
        {finding && (
          <>
            <SheetHeader className="border-b border-border/40 p-6 pb-4 text-left">
              <SheetTitle className="flex items-center gap-2 text-base">
                <SeverityBadge severity={finding.severity} />
                <span className="font-mono">{finding.category}</span>
              </SheetTitle>
              <SheetDescription className="text-xs">
                {finding.source} · {finding.occurrences} occurrence{finding.occurrences > 1 ? 's' : ''} ·
                first seen {relativeTime(finding.firstSeenAt)} · last seen {relativeTime(finding.lastSeenAt)}
              </SheetDescription>
            </SheetHeader>
            <ScrollArea className="flex-1 px-6 py-4">
              <div className="flex flex-col gap-4 text-xs">
                <Section title="Message">
                  <pre className="whitespace-pre-wrap break-words rounded-md bg-muted/30 p-3 font-mono text-[11px]">
                    {finding.message}
                  </pre>
                </Section>
                {finding.stack && (
                  <Section title="Stack">
                    <pre className="whitespace-pre-wrap break-words rounded-md bg-muted/20 p-3 font-mono text-[10px] text-muted-foreground">
                      {finding.stack}
                    </pre>
                  </Section>
                )}
                {finding.context && Object.keys(finding.context).length > 0 && (
                  <Section title="Context">
                    <pre className="whitespace-pre-wrap break-words rounded-md bg-muted/20 p-3 font-mono text-[10px] text-muted-foreground">
                      {JSON.stringify(finding.context, null, 2)}
                    </pre>
                  </Section>
                )}
                <Section title="Fingerprint">
                  <code className="rounded bg-muted/30 px-2 py-1 font-mono text-[10px]">{finding.fingerprint}</code>
                </Section>
              </div>
            </ScrollArea>
            <footer className="flex flex-wrap items-center gap-2 border-t border-border/40 px-6 py-3">
              <Button size="sm" variant="outline" onClick={() => onMark('triaged')} className="text-xs">
                triage
              </Button>
              <Button size="sm" variant="outline" onClick={() => onMark('fixed')} className="text-xs">
                <XCircle className="mr-1 h-3.5 w-3.5" />
                mark fixed
              </Button>
              <Button size="sm" variant="outline" onClick={() => onMark('wontfix')} className="text-xs">
                wontfix
              </Button>
              <Button size="sm" variant="ghost" onClick={onDelete} className="ml-auto text-xs text-red-400 hover:text-red-300">
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                purge
              </Button>
            </footer>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}
