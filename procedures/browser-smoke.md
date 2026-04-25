# browser-smoke

End-to-end browser smoke test: load a URL, verify the page rendered, capture a screenshot, and log a structured test result.

## Required secret

- `STAGING_URL` — the URL to probe. Set it via the Secrets panel before running.

## Steps

1. `secrets_get` with name=`STAGING_URL` to retrieve the URL.
2. `browser_navigate` to that URL.
3. `browser_snapshot` to capture the current page (url, title, body text).
4. `browser_screenshot` with `caption='landing'` and `fullPage=false`.
5. If the title is non-empty and the body text is >100 chars, call `report_test_result` with `suite='smoke'`, `caseName='landing_page'`, `status='passed'`, `message='rendered OK'`. Otherwise `status='failed'` with the reason.
6. `post_to_channel` announcing the outcome.
7. `publish_doc` at path `smoke-report.md` with the title, URL, and screenshot reference.
8. `project_memory_write` with `key='last_smoke_run'` and `value=<ISO timestamp>:<status>`.
