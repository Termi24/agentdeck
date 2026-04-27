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
    <div className="glass ring-soft mt-3 flex items-center gap-3 rounded-2xl border border-white/10 px-4 py-2.5">
      <span className="font-mono shrink-0 text-[10px] font-semibold uppercase tracking-wider text-white/55">
        Replay
      </span>
      <input
        type="range"
        min={0}
        max={max}
        value={value}
        onChange={(e) => setScrubIndex(Number(e.target.value))}
        className="flex-1 accent-violet-400"
      />
      <span className="font-mono tabular shrink-0 text-[11.5px] text-white/55">
        {value + 1} / {totalEvents}
      </span>
      <Button
        size="sm"
        onClick={() => setScrubIndex(null)}
        className={cn(
          'h-7 shrink-0 rounded-full border-0 px-3 text-[11.5px] font-medium text-white shadow-soft-pop',
          isLive ? 'pointer-events-none bg-white/10 text-white/55 shadow-none' : 'grad-accent',
        )}
      >
        {isLive ? 'live' : '↩ back to live'}
      </Button>
    </div>
  );
}
