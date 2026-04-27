'use client';
import Link from 'next/link';
import { ArrowLeft, MoreHorizontal, Layout as LayoutIcon, X } from 'lucide-react';
import { useSession } from '@/components/session-context';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cancelSession, type SessionListItem } from '@/lib/api';
import { cn } from '@/lib/utils';
import { LiveDot, relativeTime, statusClasses } from './shared';

interface Props {
  session: SessionListItem | null;
  sessionId: string;
  isLive: boolean;
  lastActivityMs: number;
}

export function SessionHeader({ session, sessionId, isLive, lastActivityMs }: Props) {
  const { connected } = useSession();
  const ended = session?.endedAt !== null && session?.endedAt !== undefined;

  return (
    <header className="sticky top-0 z-30 -mx-6 px-6 pt-5">
      <div className="glass ring-soft flex h-14 items-center gap-3 rounded-2xl border border-white/10 px-4">
        <Link
          href="/"
          aria-label="Back to hub"
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] text-white/70 transition-colors hover:bg-white/5 hover:text-white"
        >
          <ArrowLeft className="size-4" />
          hub
        </Link>
        <div className="h-5 w-px bg-white/10" />
        <div className="flex min-w-0 items-center gap-2">
          {session && isLive && <LiveDot />}
          <h1 className="truncate text-[14px] font-medium">
            {session?.title ?? <span className="font-mono text-white/55">{sessionId.slice(0, 8)}</span>}
          </h1>
        </div>
        {session && (
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="font-mono inline-flex h-6 items-center rounded-full border border-white/10 bg-white/5 px-2 text-[10.5px] uppercase tracking-wider text-white/65">
              {session.projectId}
            </span>
            <span
              className={cn(
                'inline-flex h-6 items-center rounded-full border px-2 text-[10.5px] capitalize',
                statusClasses(session.status),
              )}
            >
              {session.status.replace('_', ' ')}
            </span>
            <span className="font-mono inline-flex h-6 items-center rounded-full border border-white/10 bg-white/5 px-2 text-[10.5px] text-white/55">
              {session.isBridge ? 'CLI bridge' : 'SDK'}
            </span>
          </div>
        )}

        <div className="flex-1" />

        {session && (
          <span className="font-mono tabular hidden text-[11.5px] text-white/55 md:inline">
            tokens {session.totalTokensIn.toLocaleString()} / {session.totalTokensOut.toLocaleString()}
          </span>
        )}
        <span
          className={cn(
            'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11.5px]',
            connected
              ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-200'
              : 'border-white/10 bg-white/5 text-white/55',
          )}
        >
          <span
            className={cn(
              'size-1.5 rounded-full',
              connected ? 'pulse-dot bg-emerald-300' : 'bg-white/40',
            )}
            aria-hidden
          />
          {connected ? 'stream live' : 'stream offline'}
        </span>
        {session && !ended && session.status !== 'cancelled' && session.status !== 'completed' && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => void cancelSession(sessionId)}
            className="h-8 rounded-full border-white/15 bg-white/5 px-3 text-[12px] text-white/85 hover:bg-white/10"
          >
            <X className="mr-1 size-3.5" />
            Cancel
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8 rounded-full text-white/60 hover:bg-white/5 hover:text-white">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/sessions/${sessionId}/dockview`}>
                <LayoutIcon className="mr-2 h-4 w-4" />
                Open classic dockview
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled className="text-xs text-muted-foreground">
              last event {relativeTime(session?.lastActivityAt)} ({Math.round(lastActivityMs / 1000)}s)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
