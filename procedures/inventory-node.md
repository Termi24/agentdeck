# inventory-node

Short audit procedure: report the current Node.js environment inside the sandbox and publish a markdown summary.

## Steps

1. Run `sandbox_exec` with `node -v` and capture the version.
2. Run `sandbox_exec` with `node -p "process.platform + ' ' + process.arch"` and capture the platform.
3. Run `sandbox_exec` with `node -p "Object.keys(process.versions).length"` and capture the count.
4. Call `publish_doc` at path `inventory.md` containing a short markdown report with the three findings.
5. Call `post_to_channel` announcing that `inventory.md` is ready.
