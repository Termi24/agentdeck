'use client';
import Link from 'next/link';
import { ArrowLeft, MoreHorizontal, Layout as LayoutIcon, X } from 'lucide-react';
import { useSession } from '@/components/session-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cancelSession, type SessionListItem } from '@/lib/api';
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
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border/60 bg-background/80 px-6 backdrop-blur">
      <div className="flex min-w-0 items-center gap-3">
        <Link
          href="/"
          aria-label="Back to hub"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          hub
        </Link>
        <div className="h-5 w-px bg-border/60" />
        <div className="flex min-w-0 items-center gap-2">
          {session && isLive && <LiveDot />}
          <h1 className="truncate text-sm font-medium">
            {session?.title ?? <span className="font-mono text-muted-foreground">{sessionId.slice(0, 8)}</span>}
          </h1>
        </div>
        {session && (
          <div className="flex shrink-0 items-center gap-1">
            <Badge variant="outline" className="font-mono text-[10px] uppercase">
              {session.projectId}
            </Badge>
            <Badge variant="outline" className={`text-[10px] ${statusClasses(session.status)}`}>
              {session.status}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {session.isBridge ? 'CLI bridge' : 'SDK'}
            </Badge>
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {session && (
          <span className="hidden text-xs text-muted-foreground md:inline">
            tokens {session.totalTokensIn.toLocaleString()} / {session.totalTokensOut.toLocaleString()}
          </span>
        )}
        <Badge variant="outline" className={connected ? 'text-emerald-400' : 'text-muted-foreground'}>
          <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-muted-foreground'}`} />
          {connected ? 'stream live' : 'stream offline'}
        </Badge>
        {session && !ended && session.status !== 'cancelled' && session.status !== 'completed' && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => void cancelSession(sessionId)}
            className="text-xs"
          >
            <X className="mr-1 h-3.5 w-3.5" />
            Cancel
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
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
