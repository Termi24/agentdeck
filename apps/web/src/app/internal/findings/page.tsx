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
  type LucideIcon,
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
import { cn } from '@/lib/utils';

const SEVERITY_TONE: Record<FindingSeverity, string> = {
  info: 'border-sky-300/30 bg-sky-400/10 text-sky-200',
  warn: 'border-amber-300/30 bg-amber-400/10 text-amber-200',
  error: 'border-rose-300/30 bg-rose-400/10 text-rose-200',
  critical: 'border-rose-300/40 bg-rose-400/20 text-rose-100',
};

const STATUS_TONE: Record<FindingStatus, string> = {
  open: 'border-amber-300/30 bg-amber-400/10 text-amber-200',
  triaged: 'border-sky-300/30 bg-sky-400/10 text-sky-200',
  fixed: 'border-emerald-300/30 bg-emerald-400/10 text-emerald-200',
  wontfix: 'border-white/15 bg-white/5 text-white/55',
};

const TONE_ORB = {
  amber: 'bg-amber-400/15',
  rose: 'bg-rose-400/15',
  cyan: 'bg-cyan-400/15',
  violet: 'bg-violet-500/15',
} as const;

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
    <main className="mx-auto flex min-h-screen max-w-[1400px] flex-col px-6">
      <header className="sticky top-0 z-30 -mx-6 px-6 pt-5">
        <div className="glass ring-soft flex h-14 items-center gap-3 rounded-2xl border border-white/10 px-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12.5px] text-white/70 hover:bg-white/5 hover:text-white"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            All projects
          </Link>
          <div className="h-5 w-px bg-white/10" />
          <div className="grid size-7 place-items-center rounded-lg border border-amber-300/30 bg-amber-400/10 text-amber-200">
            <Bug className="size-4" />
          </div>
          <div>
            <h1 className="text-[14px] font-semibold leading-tight">internal findings</h1>
            <p className="text-[10.5px] uppercase tracking-wider text-white/45">
              agentdeck self-bug-tracker
            </p>
          </div>
          <div className="flex-1" />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void refresh()}
            className="h-8 rounded-full px-3 text-[12px] text-white/70 hover:bg-white/5 hover:text-white"
          >
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </header>

      <SummaryStrip summary={summary} />

      <section className="mt-6 mb-5 flex flex-wrap items-center gap-3">
        <div className="glass ring-soft flex h-10 items-center rounded-full border border-white/10 p-1">
          {(['open', 'triaged', 'fixed', 'wontfix', 'all'] as const).map((k) => (
            <button
              type="button"
              key={k}
              onClick={() => setStatusFilter(k)}
              className={cn(
                'h-8 rounded-full px-3.5 text-[12.5px] capitalize transition-colors',
                statusFilter === k ? 'grad-accent text-white' : 'text-white/70 hover:text-white',
              )}
            >
              {k}
            </button>
          ))}
        </div>
        <div className="glass ring-soft flex h-10 items-center rounded-full border border-white/10 p-1">
          {(['all', 'critical', 'error', 'warn', 'info'] as const).map((k) => (
            <button
              type="button"
              key={k}
              onClick={() => setSeverityFilter(k)}
              className={cn(
                'h-8 rounded-full px-3.5 text-[12.5px] capitalize transition-colors',
                severityFilter === k ? 'bg-white/10 text-white' : 'text-white/55 hover:text-white',
              )}
            >
              {k}
            </button>
          ))}
        </div>
      </section>

      {loadError && (
        <div className="mb-4">
          <Card className="glass ring-soft rounded-2xl border-rose-300/30 bg-rose-500/5">
            <CardContent className="py-3 text-sm text-rose-200">
              Proxy unreachable: <code className="rounded bg-black/30 px-1 text-xs">{loadError}</code>
            </CardContent>
          </Card>
        </div>
      )}

      <section className="flex-1 pb-12">
        {findings.length === 0 ? (
          <div className="glass ring-soft rounded-2xl border border-dashed border-white/15 p-12">
            <div className="mx-auto flex max-w-md flex-col items-center gap-3 text-center">
              <div className="grad-accent grid size-12 place-items-center rounded-2xl shadow-soft-pop">
                <Bug className="size-5 text-white" />
              </div>
              <p className="text-[15px] font-medium">no findings match these filters</p>
              <p className="text-[13px] text-white/55">
                When agentdeck encounters an exception, a 5xx response, a Playwright crash, a zod
                refusal, or any uncaught error, the bug-tracker captures it here automatically.
                If the list is empty, the proxy is healthy.
              </p>
            </div>
          </div>
        ) : (
          <Card className="glass ring-soft overflow-hidden rounded-2xl border-white/10 bg-transparent">
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead className="border-b border-white/10 text-[10px] uppercase tracking-wider text-white/50">
                  <tr>
                    <th className="px-3 py-2.5 text-left font-medium">Severity</th>
                    <th className="px-3 py-2.5 text-left font-medium">Source</th>
                    <th className="px-3 py-2.5 text-left font-medium">Category</th>
                    <th className="px-3 py-2.5 text-left font-medium">Message</th>
                    <th className="px-3 py-2.5 text-right font-medium">Occurrences</th>
                    <th className="px-3 py-2.5 text-right font-medium">Last seen</th>
                    <th className="px-3 py-2.5 text-left font-medium">Status</th>
                    <th className="px-3 py-2.5 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {findings.map((f) => (
                    <tr
                      key={f.id}
                      className="cursor-pointer border-b border-white/5 transition-colors hover:bg-white/5"
                      onClick={() => setOpenFinding(f)}
                    >
                      <td className="px-3 py-2">
                        <SeverityBadge severity={f.severity} />
                      </td>
                      <td className="font-mono px-3 py-2 text-white/55">{f.source}</td>
                      <td className="font-mono px-3 py-2 text-white/85">{f.category}</td>
                      <td className="max-w-md truncate px-3 py-2 text-white/85">{f.message}</td>
                      <td className="font-mono px-3 py-2 text-right tabular text-white">{f.occurrences}</td>
                      <td className="font-mono px-3 py-2 text-right tabular text-white/55">
                        {relativeTime(f.lastSeenAt)}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className={`rounded-full px-2 py-0 text-[10px] capitalize ${STATUS_TONE[f.status]}`}>
                          {f.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                        {f.status === 'open' && (
                          <button
                            type="button"
                            onClick={() => void onMark(f.id, 'fixed')}
                            className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-2.5 py-1 text-[10.5px] text-emerald-200 hover:bg-emerald-400/20"
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
    <section className="grid grid-cols-2 gap-3 pt-8 md:grid-cols-4">
      <SummaryCard label="open" value={summary.open} icon={AlertTriangle} tone="amber" />
      <SummaryCard label="critical + error open" value={summary.openHighSeverity} icon={AlertOctagon} tone="rose" />
      <SummaryCard label="fixed" value={summary.fixed} icon={Info} tone="cyan" />
      <SummaryCard label="total" value={summary.total} icon={Bug} tone="violet" />
    </section>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  tone: keyof typeof TONE_ORB;
}) {
  return (
    <div className="glass ring-soft relative overflow-hidden rounded-2xl border border-white/10 p-4">
      <div className={cn('absolute -right-6 -top-6 size-24 rounded-full blur-2xl', TONE_ORB[tone])} aria-hidden />
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-white/55">
        <Icon className="size-3.5" />
        <span>{label}</span>
      </div>
      <div className="font-mono tabular mt-2 text-[28px] font-semibold leading-none tracking-tight text-white">
        {value.toString().padStart(2, '0')}
      </div>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: FindingSeverity }) {
  return (
    <Badge variant="outline" className={`rounded-full px-2 py-0 text-[10px] uppercase ${SEVERITY_TONE[severity]}`}>
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
      <SheetContent side="right" className="flex w-[90vw] flex-col gap-0 border-white/10 bg-[#0a0814] p-0 sm:max-w-2xl">
        {finding && (
          <>
            <SheetHeader className="border-b border-white/10 p-6 pb-4 text-left">
              <SheetTitle className="flex items-center gap-2 text-base">
                <SeverityBadge severity={finding.severity} />
                <span className="font-mono">{finding.category}</span>
              </SheetTitle>
              <SheetDescription className="text-xs text-white/55">
                {finding.source} · {finding.occurrences} occurrence{finding.occurrences > 1 ? 's' : ''} ·
                first seen {relativeTime(finding.firstSeenAt)} · last seen {relativeTime(finding.lastSeenAt)}
              </SheetDescription>
            </SheetHeader>
            <ScrollArea className="flex-1 px-6 py-4">
              <div className="flex flex-col gap-4 text-xs">
                <Section title="Message">
                  <pre className="font-mono whitespace-pre-wrap break-words rounded-2xl border border-white/10 bg-white/5 p-3 text-[11.5px] text-white/85">
                    {finding.message}
                  </pre>
                </Section>
                {finding.stack && (
                  <Section title="Stack">
                    <pre className="font-mono whitespace-pre-wrap break-words rounded-2xl border border-white/10 bg-white/5 p-3 text-[10.5px] text-white/55">
                      {finding.stack}
                    </pre>
                  </Section>
                )}
                {finding.context && Object.keys(finding.context).length > 0 && (
                  <Section title="Context">
                    <pre className="font-mono whitespace-pre-wrap break-words rounded-2xl border border-white/10 bg-white/5 p-3 text-[10.5px] text-white/55">
                      {JSON.stringify(finding.context, null, 2)}
                    </pre>
                  </Section>
                )}
                <Section title="Fingerprint">
                  <code className="font-mono rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] text-white/85">
                    {finding.fingerprint}
                  </code>
                </Section>
              </div>
            </ScrollArea>
            <footer className="flex flex-wrap items-center gap-2 border-t border-white/10 px-6 py-3">
              <Button
                size="sm"
                variant="outline"
                onClick={() => onMark('triaged')}
                className="h-8 rounded-full border-white/15 bg-white/5 px-3 text-[11.5px] text-white/85 hover:bg-white/10"
              >
                triage
              </Button>
              <Button
                size="sm"
                onClick={() => onMark('fixed')}
                className="h-8 rounded-full border-0 bg-emerald-500/20 px-3 text-[11.5px] text-emerald-200 ring-1 ring-emerald-300/30 hover:bg-emerald-500/30"
              >
                <XCircle className="mr-1 h-3.5 w-3.5" />
                mark fixed
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onMark('wontfix')}
                className="h-8 rounded-full border-white/15 bg-white/5 px-3 text-[11.5px] text-white/85 hover:bg-white/10"
              >
                wontfix
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={onDelete}
                className="ml-auto h-8 rounded-full px-3 text-[11.5px] text-rose-300 hover:bg-rose-500/15 hover:text-rose-200"
              >
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
      <p className="mb-1.5 text-[10px] uppercase tracking-wider text-white/45">{title}</p>
      {children}
    </div>
  );
}
