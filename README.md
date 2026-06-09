# mcp-gateway-scan

> Read-only static scanner for **MCP / agent-gateway production-readiness anti-patterns.**
> Point it at a repo, get a 7-dimension red/yellow/green score in seconds.

```bash
npx mcp-gateway-scan ./path/to/your/gateway
```

It scans your code and config for the failure modes that turn an MCP gateway from a demo
into an incident — authorization decided by the model, error handlers that fail _open_,
unpinned supply chains, dark traces, unbounded spend, inline secrets, and missing
operational levers — and prints exactly where each one lives.

**100% read-only.** It only _reads_ files. It never executes your code, never makes network
calls, and **never prints a secret value** — for inline-secret hits it reports the location
only (`<file:line>`), with the value redacted.

---

## Install

```bash
# one-off
npx mcp-gateway-scan <path>

# or global
pnpm add -g mcp-gateway-scan
mcp-gateway-scan <path>
```

Requires Node ≥ 18.

## Usage

```
mcp-gateway-scan <path> [options]

Options:
  --json          Machine-readable JSON instead of the terminal report
  --no-color      Disable ANSI colors
  -h, --help      Show help
  -v, --version   Print version

Exit codes:
  0  no red dimensions
  1  one or more red dimensions
  2  usage / IO error
```

## The 7 dimensions

| Dim                              | Checks for                                                                                                       |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **D1** Tool-access / RBAC        | Authorization expressed in prompts; absence of a gateway policy layer                                            |
| **D2** Fail-close                | `catch`/`except` blocks that return `allow`/`true`/`ok`/`pass`; missing timeouts                                 |
| **D3** Onboarding / supply chain | `:latest`, `@main`, `npx -y …@`, unpinned images; rewards `sha256:` / `integrity`                                |
| **D4** Observability             | Presence/absence of OTel / `traceparent` / spans; raw prompts in logs                                            |
| **D5** Routing / cost            | Missing `max_tokens` / budget / rate-limit / quota                                                               |
| **D6** Secrets / identity        | **Inline secret literals (location only, value redacted)**; rewards `op://` / `vault:` / `process.env`; IDP/OIDC |
| **D7** Prod-readiness            | Missing kill-switch / feature-flag, 429 / rate-limit, eval / red-team gate                                       |

Each dimension is scored 🟢 green / 🟡 yellow / 🔴 red with a severity tag, plus the matched
evidence (`file:line`). The methodology behind the rubric maps to OWASP Top 10 for LLM
Applications, the MCP spec (2025-06-18), and OpenTelemetry GenAI semantic conventions.

## Try it on the bundled fixtures

```bash
mcp-gateway-scan fixtures/secure      # mostly green
mcp-gateway-scan fixtures/vulnerable  # mostly red
```

The `fixtures/vulnerable` tree contains only **fake, non-functional placeholder secrets**
(`sk-EXAMPLENOTREAL…`, `AKIAEXAMPLE…`) so you can see the redacted-secret output safely.

## What this is (and isn't)

This is a **fast, free heuristic wedge** — a static pattern scanner. A green score is a good
signal, not a guarantee; a red score is a concrete pointer to fix. It does **not** run
fault-injection, inspect your live IAM/IDP, or read your traces. That depth is what a full
**MCP Gateway Readiness Audit** provides: a cited Gap Matrix and a sequenced 90-day
remediation roadmap.

## License

MIT © Willian Pinho
