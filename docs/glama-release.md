# Publishing on Glama — build spec & release runbook

How `mcp-gateway-scan` is listed and released on the [Glama MCP directory](https://glama.ai/mcp/servers/willianpinho/mcp-gateway-scan).
Written so the same steps can be reused for any other Node/TypeScript MCP server.

A **Glama release is not a GitHub release.** It is a container build Glama runs in
its own sandbox to verify the server starts and answers MCP introspection
(`initialize` + `tools/list`) over stdio, then runs security checks and assigns a
quality grade. The repo only needs two things; everything else is configured in the
Glama admin UI.

## In the repo

| File                          | Purpose                                                                                                                                                                                                                                                                            |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`glama.json`](../glama.json) | Lets you claim the server and be the verified maintainer. **The schema (`https://glama.ai/mcp/schemas/server.json`) supports only one field: `maintainers` (array of GitHub usernames).** No description / categories / related-servers fields exist — those are admin-UI actions. |
| [`Dockerfile`](../Dockerfile) | Optional. A clean `node:22-alpine` image that starts the stdio server (`ENTRYPOINT ["node","dist/cli.js","mcp"]`). Convenient for container users; the Glama build does **not** use this file (Glama generates its own — see below).                                               |

```json
// glama.json
{
  "$schema": "https://glama.ai/mcp/schemas/server.json",
  "maintainers": ["willianpinho"]
}
```

## Release steps (Glama admin UI)

1. **Sync Server** first. Glama's repo mirror can lag (it once showed an old commit
   as HEAD). Sync so the build uses the real `master`.
2. **Claim** the server on the `…/score` tab (possible once `glama.json` lists you).
3. Go to `…/admin/dockerfile`. This is a **form that _generates_ the Dockerfile** —
   there is no `FROM`/`RUN`/`ENV` to edit. You fill only the fields below. Glama
   auto-clones the repo into `/app` and wraps your CMD with `mcp-proxy --`.
4. **Deploy** → runs a build test (builds the image, boots the server, pings it).
5. When the test passes → **Make Release** → enter version (`0.1.1`) → publish.
   Glama then runs security scans and grades the server.

### Form values that work for this server

| Field                             | Value                                                                                  |
| --------------------------------- | -------------------------------------------------------------------------------------- |
| Base image                        | `debian:trixie-slim` (default)                                                         |
| Node.js version                   | default                                                                                |
| Python version                    | default (unused — this server is Node-only)                                            |
| **Build steps**                   | `["pnpm install --frozen-lockfile", "pnpm build"]`                                     |
| **CMD arguments**                 | `["node", "dist/cli.js", "mcp"]`                                                       |
| Environment variables JSON schema | default (`{"properties":{},"required":[],"type":"object"}`) — the scanner reads no env |
| Placeholder parameters            | `{}` (empty — server starts with no credentials)                                       |
| Pinned commit SHA                 | **empty** (use latest HEAD after Sync)                                                 |

The generated `CMD` becomes `["mcp-proxy","--","node","dist/cli.js","mcp"]`.

## Two gotchas (each cost a failed build)

1. **Build steps and CMD are all-or-nothing pairs.** Don't mix them.
   - **A — build from source:** `["pnpm install --frozen-lockfile","pnpm build"]` + CMD `["node","dist/cli.js","mcp"]`
   - **B — published npm:** `["npm install -g mcp-gateway-scan@<ver>"]` + CMD `["mcp-gateway-scan","mcp"]`

   Using A's build with B's CMD produces `spawn mcp-gateway-scan ENOENT` — the global
   bin was never installed because you built from source instead. Pick one recipe.

2. **Stale mirror / pinned SHA.** If the build log shows `git checkout <old-sha>`, the
   mirror is behind. Click **Sync Server** and leave **Pinned commit SHA** empty so the
   release builds the true HEAD (with the latest `glama.json` / `server.json`). A stale
   pin still passes the build test but releases old code.

   Fallback if `--frozen-lockfile` ever fails (Glama installs a newer pnpm than the
   lockfile was generated with): switch to recipe **B**, which skips the clone/build
   entirely and runs the already-published npm package.

## Other quality-checklist items (platform-only, not repo changes)

- **No recent usage** → use **Try in Browser** once on the server page to seed a tool call.
- **No related servers** → add them in the admin UI (e.g. other MCP security/audit servers).
- **No glama.json** → resolved by the file above; click **Sync Server** so Glama picks it up.
