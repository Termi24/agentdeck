# BUG-UI-01a — backslash in fetch URL

**Status: NO-OP — bug not present in current source.**

## Verification

`apps/web/src/lib/api.ts:80` reads:

    const res = await fetch(`${PROXY_URL}/sessions/${sessionId}/agents`, { cache: 'no-store' });

Forward slash, no backslash. `grep -rn 'PROXY_URL.*sessions\\\\' apps/web/src/` returns nothing.

## Conclusion

Bug appears to have been triaged from a stale snapshot. **No patch authored.** Reclassify in next triage cycle.

## Test Plan

- `cd G:/agentdeck && grep -rn '\\sessions' apps/web/src/` should remain empty.
