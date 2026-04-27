'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  List,
  useDynamicRowHeight,
  useListRef,
  type RowComponentProps,
} from 'react-window';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSession } from '@/components/session-context';
import {
  FeedRow,
  foldEvents,
  type FeedItem,
  type Filter,
} from './activity-feed';

// Drop-in virtualized replacement for <ActivityFeed/> from this same folder.
// Identical props + foldEvents output; trades the ScrollArea + plain map for
// a react-window v2 List with `useDynamicRowHeight`. Anticipates >5000 events
// stress where the non-virtualized version starts dropping frames on scroll.
// Stays opt-in so the production /sessions/[id] route is unchanged until the
// dashboard switches to it (a feature flag on the SessionProvider is the
// natural seam — see audit/12-final-summary.md recommendation #7).

const DEFAULT_ROW_HEIGHT = 60; // first-render estimate; useDynamicRowHeight
                              // re-measures via ResizeObserver after mount.

interface Props {
  agentFilterId: string | null;
  agentFilterName?: string | null;
  onClearAgentFilter: () => void;
}

interface RowProps {
  items: FeedItem[];
  observe: (elements: Element[] | NodeListOf<Element>) => () => void;
}

function VirtualizedRow({ index, style, items, observe }: RowComponentProps<RowProps>) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Measure each rendered row so subsequent layouts use the real height.
  // useDynamicRowHeight expects an Element[] / NodeList; we pass our single
  // wrapper. The cleanup is returned so the row stops being measured when
  // unmounted.
  useEffect(() => {
    if (!wrapperRef.current) return;
    const cleanup = observe([wrapperRef.current]);
    return cleanup;
  }, [observe]);

  const item = items[index];
  if (!item) return null;
  return (
    <div ref={wrapperRef} style={style} data-index={index}>
      <FeedRow item={item} />
    </div>
  );
}

export function ActivityFeedVirtualized({
  agentFilterId,
  agentFilterName,
  onClearAgentFilter,
}: Props) {
  const { events } = useSession();
  const [filter, setFilter] = useState<Filter>('all');
  const listRef = useListRef(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [newSinceScroll, setNewSinceScroll] = useState(0);

  const items = useMemo(() => foldEvents(events, agentFilterId), [events, agentFilterId]);
  const visible = useMemo(() => {
    if (filter === 'all') return items;
    return items.filter((it) => it.category === filter);
  }, [items, filter]);

  // Reset the height cache when the filter flips (new visible set means
  // different indices map to different items).
  const rowHeight = useDynamicRowHeight({
    defaultRowHeight: DEFAULT_ROW_HEIGHT,
    key: filter,
  });

  // Auto-scroll to tail when new items arrive AND user hasn't scrolled away.
  const prevCountRef = useRef(0);
  useEffect(() => {
    if (autoScroll && visible.length > 0) {
      listRef.current?.scrollToRow({ index: visible.length - 1, align: 'end', behavior: 'auto' });
      setNewSinceScroll(0);
    } else if (visible.length > prevCountRef.current) {
      setNewSinceScroll((n) => n + (visible.length - prevCountRef.current));
    }
    prevCountRef.current = visible.length;
    // listRef is stable, so safe to omit.
  }, [visible.length, autoScroll]);

  const onScroll: React.UIEventHandler<HTMLDivElement> = (e) => {
    const el = e.currentTarget;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    if (atBottom && !autoScroll) {
      setAutoScroll(true);
      setNewSinceScroll(0);
    } else if (!atBottom && autoScroll) {
      setAutoScroll(false);
    }
  };

  const jumpToLatest = () => {
    if (visible.length > 0) {
      listRef.current?.scrollToRow({ index: visible.length - 1, align: 'end', behavior: 'smooth' });
    }
    setAutoScroll(true);
    setNewSinceScroll(0);
  };

  const rowProps = useMemo<RowProps>(
    () => ({ items: visible, observe: rowHeight.observeRowElements }),
    [visible, rowHeight.observeRowElements],
  );

  return (
    <Card className="glass ring-soft flex h-full flex-col overflow-hidden rounded-2xl border-white/10 bg-transparent">
      <CardHeader className="space-y-2 border-b border-white/10 px-4 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[11px] font-medium uppercase tracking-wider text-white/55">
            Activity ({visible.length}
            {visible.length !== items.length && `/${items.length}`})
            <span className="ml-2 text-[10px] opacity-50">[virtualized]</span>
          </h2>
          {agentFilterId && (
            <button
              type="button"
              className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] text-white/70 hover:bg-white/10 hover:text-white"
              onClick={onClearAgentFilter}
            >
              filter: {agentFilterName ?? agentFilterId.slice(0, 6)} ×
            </button>
          )}
        </div>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList className="h-7 w-full justify-start gap-1 bg-transparent p-0">
            {(['all', 'channel', 'tools', 'docs', 'tests', 'agents'] as const).map((f) => (
              <TabsTrigger
                key={f}
                value={f}
                className="h-7 rounded-full border border-transparent bg-transparent px-2.5 text-[11px] capitalize text-white/55 data-[state=active]:border-white/15 data-[state=active]:bg-white/10 data-[state=active]:text-white data-[state=active]:shadow-none"
              >
                {f}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent className="relative flex-1 overflow-hidden p-0">
        {visible.length === 0 ? (
          <div className="p-6 text-center text-[12px] text-white/45">
            no activity yet — waiting for events…
          </div>
        ) : (
          <List<RowProps>
            listRef={listRef}
            rowComponent={VirtualizedRow}
            rowCount={visible.length}
            rowHeight={rowHeight}
            rowProps={rowProps}
            overscanCount={6}
            className="h-full w-full"
            onScroll={onScroll}
          />
        )}
        {!autoScroll && newSinceScroll > 0 && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
            <Button
              size="sm"
              variant="outline"
              className="grad-accent h-7 gap-1 rounded-full border-0 px-3 text-[11px] font-medium text-white shadow-soft-pop"
              onClick={jumpToLatest}
            >
              <ChevronDown className="h-3.5 w-3.5" />
              {newSinceScroll} new
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Helper for callers: pick the virtualized variant only when the dataset is
// large enough to win on perf. Below the threshold the original DOM-render
// stays smoother (no virtualization overhead, true browser smooth-scroll).
//
// Threshold tuned conservatively; adjust if perf-auditor measures otherwise.
export const VIRTUALIZE_THRESHOLD = 500;
