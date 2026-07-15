#!/usr/bin/env node
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  renderConnectCi,
  renderConnectJson,
  renderConnectText,
} from "./connect-report.js";
import { resolveConnectTarget } from "./connect-target.js";
import { computeVerdict, verdictExitCode } from "./connect.js";
import { startMcpServer } from "./mcp-server.js";
import { renderCi, renderJson, renderText } from "./report.js";
import { ScanResultSchema } from "./types.js";
import { VERSION, scan } from "./scanner.js";

const HELP = `
mcp-gateway-scan v${VERSION}

  Read-only static scanner for MCP / agent-gateway production-readiness
  anti-patterns. Scores a repository across 7 dimensions (red/yellow/green).

USAGE
  mcp-gateway-scan <path> [options]
  mcp-gateway-scan connect <target> [options]   "Should I connect to this server?"
  mcp-gateway-scan mcp                 Start a stdio MCP server (use from an agent).

ARGUMENTS
  <path>          File or directory to scan (defaults to current directory).
  connect <target>  Assess a THIRD-PARTY MCP server before wiring it into an agent.
                  <target> is the server's repo checkout (dir), its MCP client
                  config entry (.mcp.json / claude_desktop_config.json), or its
                  package.json. Prints a top-line CONNECT / REVIEW / DO-NOT-CONNECT
                  verdict + the worst finding, over the same 7 dimensions.
  mcp             Run as an MCP server over stdio, exposing the scan_gateway tool
                  to Claude Code / Cursor. See README → "Run it inside Claude Code".

OPTIONS
  --json          Emit machine-readable JSON instead of the terminal report.
  --ci            Compact, no-color output for pipelines; exits 1 on any RED.
  --no-color      Disable ANSI colors in the terminal report.
  --no-cta        Suppress the closing readiness-audit pointer in the report.
  -h, --help      Show this help.
  -v, --version   Print the version.

DIMENSIONS
  D1  Tool-access governance & RBAC      (authz-in-prompt, missing policy layer)
  D2  Fail-close / fail-open posture      (catch returns allow/true, no timeouts)
  D3  Onboarding & supply-chain pinning   (:latest, @main, npx -y @, unpinned)
  D4  Observability & tracing             (OTel / traceparent / spans)
  D5  Multi-LLM routing & cost controls   (max_tokens, budget, rate limit, quota)
  D6  Security, secrets & identity        (inline secrets — location only, never value)
  D7  Production-readiness                (kill-switch, 429, eval/red-team)

GUARANTEES
  - Read-only: only READS files; never executes the target's code.
  - Never prints secret values — only "inline secret literal at <file:line>".
  - Ignores node_modules, .git, dist, build, and similar.

EXIT CODES
  0  scan completed, no red dimensions       (connect: verdict CONNECT)
  1  scan completed, one or more red dimensions  (connect: REVIEW / DO-NOT-CONNECT)
  2  usage / IO error

CI USAGE
  mcp-gateway-scan ./gateway --ci   # fails the build if any dimension is RED
`;

interface ParsedArgs {
  path: string;
  json: boolean;
  ci: boolean;
  color: boolean;
  cta: boolean;
  showHelp: boolean;
  showVersion: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    path: ".",
    json: false,
    ci: false,
    color: process.stdout.isTTY === true,
    cta: true,
    showHelp: false,
    showVersion: false,
  };
  let pathSet = false;
  for (const arg of argv) {
    switch (arg) {
      case "--json":
        parsed.json = true;
        break;
      case "--ci":
        parsed.ci = true;
        parsed.color = false; // pipelines: no ANSI
        break;
      case "--no-color":
        parsed.color = false;
        break;
      case "--no-cta":
        parsed.cta = false;
        break;
      case "--color":
        parsed.color = true;
        break;
      case "-h":
      case "--help":
        parsed.showHelp = true;
        break;
      case "-v":
      case "--version":
        parsed.showVersion = true;
        break;
      default:
        if (arg.startsWith("-")) {
          process.stderr.write(`Unknown option: ${arg}\n`);
          process.exit(2);
        }
        if (!pathSet) {
          parsed.path = arg;
          pathSet = true;
        }
    }
  }
  return parsed;
}

/**
 * `mcp-gateway-scan connect <target> [options]` — assess a third-party server
 * before connecting. Reuses the existing scan core + schema, then reduces it to
 * a CONNECT / REVIEW / DO-NOT-CONNECT verdict. Exits 0 only on CONNECT.
 */
function runConnect(rawArgs: string[]): void {
  const args = parseArgs(rawArgs.slice(1));
  // `connect` with no target, or `connect .`, scans the current directory.
  const spec = resolve(args.path);
  if (!existsSync(spec)) {
    process.stderr.write(`Error: connect target does not exist: ${spec}\n`);
    process.exit(2);
  }

  const targetMeta = resolveConnectTarget(spec);

  let result;
  try {
    result = ScanResultSchema.parse(scan(targetMeta.root));
  } catch (err) {
    process.stderr.write(
      `Error: connect scan failed: ${(err as Error).message}\n`,
    );
    process.exit(2);
    return;
  }

  if (result.scannedFiles === 0) {
    process.stderr.write(
      `Warning: no scannable files found under ${spec} — cannot assess connect safety.\n`,
    );
  }

  const verdict = computeVerdict(result);

  if (args.json) {
    process.stdout.write(`${renderConnectJson(result, targetMeta, verdict)}\n`);
  } else if (args.ci) {
    process.stdout.write(renderConnectCi(result, targetMeta, verdict));
  } else {
    process.stdout.write(
      renderConnectText(result, targetMeta, verdict, args.color, args.cta),
    );
  }

  process.exit(verdictExitCode(verdict.verdict));
}

function main(): void {
  const rawArgs = process.argv.slice(2);

  // Subcommand: `mcp-gateway-scan connect <target>` assesses a third-party server.
  // Branch before the default path scan so that behavior is untouched.
  if (rawArgs[0] === "connect") {
    runConnect(rawArgs);
    return;
  }

  // Subcommand: `mcp-gateway-scan mcp` starts a stdio MCP server. Branch here
  // (first arg exactly "mcp") so the default `<path>` scan behavior is untouched.
  if (rawArgs[0] === "mcp") {
    startMcpServer().catch((err: unknown) => {
      process.stderr.write(
        `Error: MCP server failed to start: ${(err as Error).message}\n`,
      );
      process.exit(2);
    });
    return; // server keeps the process alive on the stdio transport
  }

  const args = parseArgs(rawArgs);

  if (args.showHelp) {
    process.stdout.write(`${HELP}\n`);
    process.exit(0);
  }
  if (args.showVersion) {
    process.stdout.write(`${VERSION}\n`);
    process.exit(0);
  }

  const target = resolve(args.path);
  if (!existsSync(target)) {
    process.stderr.write(`Error: path does not exist: ${target}\n`);
    process.exit(2);
  }

  let result;
  try {
    result = ScanResultSchema.parse(scan(target));
  } catch (err) {
    process.stderr.write(`Error: scan failed: ${(err as Error).message}\n`);
    process.exit(2);
    return;
  }

  if (result.scannedFiles === 0) {
    process.stderr.write(
      `Warning: no scannable files found under ${target} (nothing to assess).\n`,
    );
  }

  if (args.json) {
    process.stdout.write(`${renderJson(result)}\n`);
  } else if (args.ci) {
    process.stdout.write(renderCi(result));
  } else {
    process.stdout.write(renderText(result, args.color, args.cta));
  }

  process.exit(result.score.red > 0 ? 1 : 0);
}

main();
