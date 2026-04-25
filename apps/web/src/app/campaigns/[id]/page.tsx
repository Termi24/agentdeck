'use client';
import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { getCampaign, type CampaignDetail } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const statusStyles: Record<string, string> = {
  running: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30',
  completed: 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30',
  aborted: 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30',
  failed: 'bg-red-500/15 text-red-300 ring-1 ring-red-500/30',
};

function fmtValue(json: string): string {
  try {
    const v = JSON.parse(json);
    if (typeof v === 'number') return v.toString();
    if (typeof v === 'boolean') return v ? '✓' : '✗';
    return String(v);
  } catch {
    return json;
  }
}

export default function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<CampaignDetail | null | 'missing'>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      getCampaign(id).then((d) => {
        if (cancelled) return;
        setData(d ?? 'missing');
      });
    };
    load();
    const t = setInterval(load, 5_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [id]);

  if (data === null) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }
  if (data === 'missing') {
    return (
      <main className="p-6">
        <Link href="/campaigns" className="text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="mr-1 inline h-4 w-4" /> campaigns
        </Link>
        <p className="mt-4 text-sm">Campaign not found.</p>
      </main>
    );
  }

  const { campaign, metrics, retrospective } = data;

  return (
    <main className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border/60 bg-background/80 px-6 backdrop-blur">
        <Link
          href="/campaigns"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          campaigns
        </Link>
        <span className="font-mono text-xs text-muted-foreground">{campaign.id}</span>
        <span className={`rounded-md px-2 py-0.5 text-[10px] font-medium uppercase ${statusStyles[campaign.status] ?? ''}`}>
          {campaign.status}
        </span>
      </header>

      <section className="flex-1 space-y-6 px-6 py-6">
        <Card>
          <CardContent className="space-y-2 py-4">
            <h2 className="text-base font-semibold">{campaign.projectName}</h2>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className="text-[10px]">{campaign.cliSource}</Badge>
              <span>started {new Date(campaign.startedAt).toLocaleString()}</span>
              {campaign.endedAt ? <span>· ended {new Date(campaign.endedAt).toLocaleString()}</span> : null}
            </div>
            {campaign.notes ? <p className="text-sm text-muted-foreground">{campaign.notes}</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4">
            <h3 className="mb-3 text-sm font-semibold">Metrics ({metrics.length})</h3>
            {metrics.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No metrics yet. The orchestrator should call{' '}
                <code className="rounded bg-muted/40 px-1 py-0.5 font-mono text-[11px]">
                  record_campaign_metric
                </code>{' '}
                at each phase boundary.
              </p>
            ) : (
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-3">when</th>
                    <th className="py-1 pr-3">name</th>
                    <th className="py-1 pr-3">value</th>
                    <th className="py-1">tags</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.map((m) => (
                    <tr key={m.id} className="border-t border-border/40">
                      <td className="py-1 pr-3 font-mono text-[11px] text-muted-foreground">
                        {new Date(m.recordedAt).toLocaleTimeString()}
                      </td>
                      <td className="py-1 pr-3 font-medium">{m.name}</td>
                      <td className="py-1 pr-3 font-mono">{fmtValue(m.valueJson)}</td>
                      <td className="py-1 text-muted-foreground">{m.tagsJson ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 py-4">
            <h3 className="text-sm font-semibold">Orchestrator retrospective</h3>
            {!retrospective ? (
              <p className="text-xs text-muted-foreground">
                Not submitted yet.{' '}
                {campaign.status === 'running'
                  ? 'The orchestrator must call submit_campaign_retrospective before end_campaign — agentdeck refuses to close the campaign without it.'
                  : 'This campaign was closed without a retrospective (legacy state).'}
              </p>
            ) : (
              <div className="space-y-3 text-sm">
                <p className="text-[11px] text-muted-foreground">
                  Submitted {new Date(retrospective.submittedAt).toLocaleString()}
                </p>
                <Section title="What went well" body={retrospective.whatWentWell} />
                <Section title="What went badly" body={retrospective.whatWentBadly} />
                <Section title="Key learnings" body={retrospective.keyLearnings} />
                <Section title="Tooling feedback (agentdeck)" body={retrospective.toolingFeedback} />
                <Section title="Recommendations for next time" body={retrospective.recommendations} />
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

function Section({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      <p className="mt-1 whitespace-pre-wrap text-sm">{body}</p>
    </div>
  );
}
