'use client';
import { useEffect } from 'react';

/**
 * Polling primitive that pauses when the document is hidden (Page Visibility
 * API) and re-fires the load callback as soon as the tab returns to
 * foreground. Replaces ad-hoc `setInterval(() => load(), 2_500)` patterns
 * that hammered the proxy at >2 req/s sustained per panel — even when no
 * one was looking at the page.
 *
 * Defaults to 8 s — Socket.IO already pushes events in real time, so polling
 * exists only as a recovery channel when the WS reconnects or the user
 * scrubs replay.
 */
export function usePollingInterval(
  load: () => void | Promise<void>,
  intervalMs = 8_000,
  deps: ReadonlyArray<unknown> = [],
): void {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    let cancelled = false;
    let handle: ReturnType<typeof setInterval> | null = null;

    const run = () => {
      if (cancelled) return;
      void load();
    };

    const start = () => {
      if (handle !== null) return;
      run();
      handle = setInterval(run, intervalMs);
    };

    const stop = () => {
      if (handle !== null) {
        clearInterval(handle);
        handle = null;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') start();
      else stop();
    };

    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
    // deps are forwarded by the caller; intervalMs change re-arms cleanly
  }, [intervalMs, ...deps]);
}
