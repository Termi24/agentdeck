# Procedures

Test procedures available to agents via the MCP tool `run_test_procedure`.

Each procedure is a YAML or Markdown file at the root of this directory. The `name` used by `run_test_procedure` is the filename without extension.

## YAML format

```yaml
name: smoke-login
description: Basic login flow smoke test against the staging SaaS.
inputs:
  email: string
  password: string
steps:
  - visit: https://staging.example.com/login
  - fill: { selector: "#email", value: "{{ email }}" }
  - fill: { selector: "#password", value: "{{ password }}" }
  - click: "#submit"
  - expect_url: https://staging.example.com/dashboard
```

## Markdown format

A procedure can also be a Markdown runbook with free-form instructions for the agent. The agent reads it via `run_test_procedure` and decides how to execute it using its other tools (sandbox_exec, Playwright MCP, etc.).

Implementation of the runner arrives in **P3**.
