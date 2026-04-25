# claim-validator

Triage inbound bug reports from sub-agents **before** escalating to the
human. Re-executes the claimed backend call independently from outside
any contaminated browser context and confirms whether the reported
behaviour actually happens.

## Why

During the IndusForge week, ~30% of reported bugs turned out to be false
positives caused by cross-agent browser contamination (stale JWT cookie
from another persona, SW cache from a prior test, autofill re-filling an
old email). Validating each claim before forwarding reduces noise by
roughly that same factor.

## Steps

1. **Intake.** Listen on the channel with `wait_for_channel` for messages matching `/^🚨 BUG/`. When one arrives, parse:
   - `method` (default GET)
   - `url` (full URL including path)
   - `persona` (whose session observed it)
   - `expected` (what the agent expected, free-text)
   - `actual` (what they saw, free-text)
2. **Re-login the persona independently.** Call `validate_claim` POST `{BASE}/api/v1/auth/login` with the persona's credentials (from `PERSONAS_JSON`). Extract the token.
3. **Replay the claimed call.** Call `validate_claim` with the claimed method + url + `Authorization: Bearer <token>`. Set `expectStatus` to what the sub-agent reported.
4. **Compare.**
   - If `ok: true` and the status matches: the sub-agent was right — forward to the human with `post_to_channel` prefixed `✅ CONFIRMED:` and `report_test_result` status=failed.
   - If `ok: false` and the status is 2xx where sub-agent said 4xx/5xx: **false positive**. Reply on the channel with `post_to_channel` prefixed `⚠️ FALSE-POSITIVE:` explaining that the backend returned 2xx cleanly when called fresh, so the sub-agent's observation is likely a contaminated browser context. Suggest the sub-agent run `browser_new_context {reset: true}` and retry.
   - If both disagree with the sub-agent but in a third way (e.g. 500 instead of 403): treat as a **new bug**, forward with `🔀 DIFFERENT:` prefix.
5. **Log** every triage outcome to `claims-triage.jsonl` in the sandbox for audit.

## Notes

- Runs cheap — a single `validate_claim` is a plain `fetch`, no browser boot.
- Spin one instance of this procedure per session and let it run in background alongside the test agents.
- Doesn't replace human judgment on UX/visual bugs (this one only covers backend-observable claims).
