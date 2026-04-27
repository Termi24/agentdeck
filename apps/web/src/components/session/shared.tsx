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

/** Pill / badge classes per status — kept stable for back-compat across pages. */
export function statusClasses(s: SessionStatus): string {
  switch (s) {
    case 'running':
    case 'waiting_tool':
      return 'bg-emerald-400/15 text-emerald-200 border-emerald-300/30';
    case 'pending':
      return 'bg-sky-400/15 text-sky-200 border-sky-300/30';
    case 'completed':
      return 'bg-white/5 text-white/60 border-white/10';
    case 'failed':
      return 'bg-rose-400/15 text-rose-200 border-rose-300/30';
    case 'cancelled':
      return 'bg-amber-400/15 text-amber-200 border-amber-300/30';
  }
}

/** Outer-glow class per status — used on cards in the new style B redesign. */
export function statusGlow(s: SessionStatus, isLive = false): string {
  if (!isLive) return '';
  switch (s) {
    case 'running':
    case 'waiting_tool':
      return 'glow-emerald';
    case 'pending':
      return 'glow-cyan';
    case 'failed':
      return 'glow-rose';
    case 'cancelled':
      return 'glow-amber';
    case 'completed':
    default:
      return '';
  }
}

/** Accent dot color (per status, pulsing if live) for tiny indicators. */
export function statusDotClass(s: SessionStatus): string {
  switch (s) {
    case 'running':
    case 'waiting_tool':
      return 'bg-emerald-300';
    case 'pending':
      return 'bg-sky-300';
    case 'failed':
      return 'bg-rose-300';
    case 'cancelled':
      return 'bg-amber-300';
    case 'completed':
    default:
      return 'bg-white/40';
  }
}

/** Pulsing emerald dot — used to signal "live data within the last few seconds". */
export function LiveDot({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const cls = size === 'md' ? 'h-2.5 w-2.5' : 'h-2 w-2';
  return <span className={`pulse-dot inline-block rounded-full bg-emerald-300 ${cls}`} aria-hidden />;
}
