import type { SessionStatus } from '@/lib/api';

export const ACTIVE_STATUSES: ReadonlyArray<SessionStatus> = ['running', 'pending', 'waiting_tool'];

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return iso;
  const diff = Date.now() - then;
  const sec = Math.floor(diff / 1000);
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m${s.toString().padStart(2, '0')}s`;
}

export function statusClasses(s: SessionStatus): string {
  switch (s) {
    case 'running':
    case 'waiting_tool':
      return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    case 'pending':
      return 'bg-sky-500/15 text-sky-400 border-sky-500/30';
    case 'completed':
      return 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30';
    case 'failed':
      return 'bg-red-500/15 text-red-400 border-red-500/30';
    case 'cancelled':
      return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
  }
}

export function LiveDot({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const cls = size === 'md' ? 'h-2.5 w-2.5' : 'h-2 w-2';
  return (
    <span className={`relative inline-block ${cls}`}>
      <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500/70" />
      <span className="absolute inset-0 rounded-full bg-emerald-500" />
    </span>
  );
}
