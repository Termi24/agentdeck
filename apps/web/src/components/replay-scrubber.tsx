'use client';
import { useSession } from '@/components/session-context';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function ReplayScrubber() {
  const { totalEvents, scrubIndex, setScrubIndex, isLive } = useSession();

  if (totalEvents === 0) return null;

  const max = Math.max(0, totalEvents - 1);
  const value = scrubIndex ?? max;

  return (
    <div className="flex items-center gap-3 border-b border-border bg-card/60 px-6 py-2">
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Replay</span>
      <input
        type="range"
        min={0}
        max={max}
        value={value}
        onChange={(e) => setScrubIndex(Number(e.target.value))}
        className="flex-1 accent-primary"
      />
      <span className="shrink-0 font-mono text-xs text-muted-foreground">
        {value + 1} / {totalEvents}
      </span>
      <Button
        size="sm"
        variant={isLive ? 'secondary' : 'default'}
        onClick={() => setScrubIndex(null)}
        className={cn('shrink-0', isLive && 'pointer-events-none opacity-60')}
      >
        {isLive ? 'live' : '↩ back to live'}
      </Button>
    </div>
  );
}
