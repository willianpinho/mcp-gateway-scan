import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { VERSION, scan } from "./scanner.js";
import { ScanResultSchema } from "./types.js";
import type { Color, ScanResult } from "./types.js";

/**
 * MCP server mode. Exposes the EXISTING scanner core (`scan` in scanner.ts) as a
 * single read-only MCP tool, so an agent (Claude Code / Cursor) can run the
 * gateway-readiness scan conversationally. No dimension logic is duplicated here —
 * this file only wires the core into the MCP transport and shapes the response.
 *
 * stdio transport invariant: NOTHING may be written to stdout except JSON-RPC.
 * All diagnostics go to stderr (see startMcpServer below).
 */

const CTA =
  "Found reds? Full MCP Gateway Readiness Audit → " +
  "https://willianpinho.com/mcp-audit · me@willianpinho.com";

const DOT: Record<Color, string> = {
  green: "🟢",
  yellow: "🟡",
  red: "🔴",
};

/** Build the concise, agent-friendly text summary from a ScanResult. */
function renderSummary(result: ScanResult): string {
  const lines: string[] = [];
  lines.push(
    `mcp-gateway-scan v${result.version} — ${result.scannedFiles} files scanned (read-only)`
  );
  lines.push(`target: ${result.target}`);
  lines.push("");
  for (const d of result.dimensions) {
    const findings = d.evidence.filter((e) => e.polarity === "negative").length;
    lines.push(
      `${DOT[d.color]} ${d.id} ${d.title} — ${
        d.severity
      } (findings=${findings})`
    );
  }
  lines.push("");
  lines.push(
    `SCORE: ${result.score.green} green · ${result.score.yellow} yellow · ${result.score.red} red`
  );
  lines.push(
    result.score.red > 0
      ? "VERDICT: FAIL — one or more RED dimensions are launch blockers."
      : "VERDICT: PASS — no RED dimensions."
  );
  lines.push("");
  lines.push(CTA);
  return lines.join("\n");
}

/**
 * Run the existing scanner core against `inputPath` and shape an MCP tool result.
 * Returns a tool execution error (isError: true) — NOT a protocol error — for a
 * bad/nonexistent path, so the model can self-correct.
 */
function runScan(
  inputPath: string,
  ci: boolean
): {
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
} {
  const target = resolve(inputPath);
  if (!existsSync(target)) {
    return {
      content: [
        {
          type: "text",
          text: `Error: path does not exist: ${target}. Provide a valid repo or directory path to scan.`,
        },
      ],
      isError: true,
    };
  }

  let result: ScanResult;
  try {
    // ScanResultSchema validates the core's output exactly as the CLI's --json does.
    result = ScanResultSchema.parse(scan(target));
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: `Error: scan failed for ${target}: ${(err as Error).message}`,
        },
      ],
      isError: true,
    };
  }

  const summaryText =
    result.scannedFiles === 0
      ? `${renderSummary(
          result
        )}\n\n(No scannable files were found under the path — nothing to assess.)`
      : renderSummary(result);

  // `ci` is advisory metadata: it surfaces the gate verdict the --ci flag would
  // produce (exit 1 on any red). The scan itself is identical; nothing executes.
  const structured: Record<string, unknown> = ci
    ? { ...result, ci: { wouldFail: result.score.red > 0 } }
    : { ...result };

  return {
    content: [{ type: "text", text: summaryText }],
    structuredContent: structured,
  };
}

/** Build the McpServer with the single `scan_gateway` tool registered. */
export function buildServer(): McpServer {
  const server = new McpServer({
    name: "mcp-gateway-scan",
    version: VERSION,
  });

  server.registerTool(
    "scan_gateway",
    {
      title: "Scan MCP / agent-gateway for production-readiness anti-patterns",
      description:
        "Read-only static scan of a repo/directory across 7 gateway-readiness " +
        "dimensions (RBAC, fail-close, supply-chain pinning, observability, " +
        "routing/cost, secrets, prod-readiness). Returns a per-dimension " +
        "🟢🟡🔴 summary plus the structured result. Never executes target code; " +
        "secret values are redacted (location only, never the value).",
      inputSchema: {
        path: z
          .string()
          .min(1)
          .describe("Repository or directory path to scan (required)."),
        ci: z
          .boolean()
          .optional()
          .describe(
            "If true, also report the CI gate verdict (would fail on any RED)."
          ),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    async ({ path, ci }) => runScan(path, ci ?? false)
  );

  return server;
}

/**
 * Start the stdio MCP server. Diagnostics go to stderr only — stdout is reserved
 * for the JSON-RPC stream (writing anything else there corrupts the protocol).
 */
export async function startMcpServer(): Promise<void> {
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(
    `mcp-gateway-scan v${VERSION} — MCP server ready (stdio). Tool: scan_gateway\n`
  );
}
