'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, FlaskConical } from 'lucide-react';
import { listCampaigns, type CampaignListItem } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const statusStyles: Record<CampaignListItem['status'], string> = {
  running: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30',
  completed: 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30',
  aborted: 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30',
  failed: 'bg-red-500/15 text-red-300 ring-1 ring-red-500/30',
};

function fmtDuration(start: string, end: string | null): string {
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const ms = e - s;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${m}m`;
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<CampaignListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      listCampaigns()
        .then((c) => {
          if (!cancelled) {
            setCampaigns(c);
            setLoading(false);
          }
        })
        .catch(() => setLoading(false));
    };
    load();
    const id = setInterval(load, 5_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <main className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border/60 bg-background/80 px-6 backdrop-blur">
        <Link
          href="/"
          aria-label="Back to hub"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          hub
        </Link>
        <h1 className="text-base font-semibold">QA Campaigns</h1>
        <span className="ml-auto text-xs text-muted-foreground">
          {campaigns.length} total
        </span>
      </header>

      <section className="flex-1 px-6 py-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : campaigns.length === 0 ? (
          <Card className="border-border/60 bg-card/40">
            <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
              <FlaskConical className="h-8 w-8 text-muted-foreground" />
              <div>
                <h2 className="text-base font-semibold">No campaigns yet</h2>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  Start one from any MCP-connected CLI by calling{' '}
                  <code className="rounded bg-muted/40 px-1 py-0.5 font-mono text-xs">
                    mcp__agentdeck__start_qa_campaign
                  </code>
                  . The unified methodology (process/10-methodologie-unifiee.md) explains the
                  9-phase pipeline.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <ul className="grid gap-3">
            {campaigns.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/campaigns/${c.id}`}
                  className="block rounded-lg border border-border/60 bg-card/40 p-4 transition hover:border-border hover:bg-card/60"
                >
                  <div className="flex flex-wrap items-baseline gap-3">
                    <span className="font-mono text-xs text-muted-foreground">{c.id}</span>
                    <span className={`rounded-md px-2 py-0.5 text-[10px] font-medium uppercase ${statusStyles[c.status]}`}>
                      {c.status}
                    </span>
                    <h3 className="text-sm font-semibold">{c.projectName}</h3>
                    <Badge variant="outline" className="text-[10px]">
                      {c.cliSource}
                    </Badge>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {new Date(c.startedAt).toLocaleString()} · {fmtDuration(c.startedAt, c.endedAt)}
                    </span>
                  </div>
                  {c.notes ? (
                    <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{c.notes}</p>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
