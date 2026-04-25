# smoke-math

Basic smoke test runbook — sanity check that the sandbox can execute commands.

## Steps

1. Call `sandbox_exec` with `node -e "console.log(2+2)"` and verify stdout contains `4`.
2. Call `sandbox_write` to create `notes.txt` containing `"smoke-math passed"`.
3. Call `sandbox_read` on `notes.txt` and verify the content matches.
4. Call `post_to_channel` to announce the result (e.g. `"smoke-math: PASSED"` or `"smoke-math: FAILED (<reason>)"`)
5. Call `publish_doc` with path `smoke-math-report.md` describing what was checked and the outcome.
