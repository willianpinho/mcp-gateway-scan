import type { Color, ScanResult } from "./types.js";

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";

function colorize(color: Color, useColor: boolean): string {
  const dot =
    color === "green" ? "GREEN " : color === "yellow" ? "YELLOW" : "RED   ";
  if (!useColor) return dot.trim();
  const code = color === "green" ? GREEN : color === "yellow" ? YELLOW : RED;
  return `${code}${dot}${RESET}`;
}

function wrap(text: string, indent: number, width = 76): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (cur.length + w.length + 1 > width - indent) {
      lines.push(cur);
      cur = w;
    } else {
      cur = cur ? `${cur} ${w}` : w;
    }
  }
  if (cur) lines.push(cur);
  const pad = " ".repeat(indent);
  return lines.map((l) => pad + l);
}

/** Render the human-readable terminal report. */
export function renderText(result: ScanResult, useColor: boolean): string {
  const b = (s: string) => (useColor ? `${BOLD}${s}${RESET}` : s);
  const dim = (s: string) => (useColor ? `${DIM}${s}${RESET}` : s);
  const cyan = (s: string) => (useColor ? `${CYAN}${s}${RESET}` : s);

  const out: string[] = [];
  out.push("");
  out.push(b("  mcp-gateway-scan") + dim(`  v${result.version}`));
  out.push(
    dim(
      `  target: ${result.target}  (${result.scannedFiles} files scanned, read-only)`,
    ),
  );
  out.push("");

  for (const d of result.dimensions) {
    out.push(
      `  [${colorize(d.color, useColor)}] ${b(d.id)} ${d.title}  ${dim(d.severity)}`,
    );
    for (const l of wrap(d.summary, 8)) out.push(l);
    const shown = d.evidence.slice(0, 4);
    for (const e of shown) {
      const sign = e.polarity === "negative" ? "✗" : "✓";
      out.push(
        dim(`        ${sign} ${e.file}:${e.line}  `) +
          `${e.label}` +
          dim(`  ${e.excerpt}`),
      );
    }
    if (d.evidence.length > shown.length) {
      out.push(dim(`        … ${d.evidence.length - shown.length} more`));
    }
    out.push("");
  }

  // Summary score table.
  out.push(b("  SCORE"));
  out.push(
    dim(
      "  ┌────────┬──────────────────────────────────────────┬─────────┬──────────┐",
    ),
  );
  out.push(
    dim(
      "  │ Dim    │ Title                                      │ Status  │ Severity │",
    ),
  );
  out.push(
    dim(
      "  ├────────┼──────────────────────────────────────────┼─────────┼──────────┤",
    ),
  );
  for (const d of result.dimensions) {
    const title =
      d.title.length > 42 ? `${d.title.slice(0, 41)}…` : d.title.padEnd(42);
    out.push(
      `  │ ${d.id.padEnd(6)} │ ${title} │ ${colorize(d.color, useColor)}  │ ${d.severity.padEnd(8)} │`,
    );
  }
  out.push(
    dim(
      "  └────────┴──────────────────────────────────────────┴─────────┴──────────┘",
    ),
  );
  out.push("");
  out.push(
    `  ${useColor ? GREEN : ""}${result.score.green} green${useColor ? RESET : ""}  ` +
      `${useColor ? YELLOW : ""}${result.score.yellow} yellow${useColor ? RESET : ""}  ` +
      `${useColor ? RED : ""}${result.score.red} red${useColor ? RESET : ""}`,
  );
  out.push("");

  // Closing CTA.
  const launchBlocked =
    result.dimensions.find((d) => d.id === "D2")?.color === "red" ||
    result.score.red > 0;
  if (launchBlocked) {
    out.push(
      cyan(
        "  → Reds above are launch blockers. A full readiness audit produces the cited",
      ),
    );
    out.push(cyan("    Gap Matrix + a sequenced 90-day remediation roadmap."));
  } else {
    out.push(
      cyan(
        "  → No reds. A full readiness audit verifies fail-close behavior with",
      ),
    );
    out.push(
      cyan("    staged fault-injection and closes the remaining yellows."),
    );
  }
  out.push(
    dim(
      "    Get the 7-dimension MCP Gateway Readiness Audit → https://willianpinho.com/mcp-audit",
    ),
  );
  out.push("");

  return out.join("\n");
}

/**
 * Render compact, no-color CI output: one line per dimension plus a verdict.
 * Designed to be greppable in pipeline logs. Exit code (set by the CLI) is 1
 * when any dimension is red, so `--ci` can gate a build.
 */
export function renderCi(result: ScanResult): string {
  const out: string[] = [];
  out.push(`mcp-gateway-scan v${result.version}  target=${result.target}`);
  out.push(`files_scanned=${result.scannedFiles}`);
  for (const d of result.dimensions) {
    const status = d.color.toUpperCase().padEnd(6);
    const findings = d.evidence.filter((e) => e.polarity === "negative").length;
    out.push(
      `${status} ${d.id} ${d.severity} ${d.title} (findings=${findings})`,
    );
  }
  out.push(
    `RESULT green=${result.score.green} yellow=${result.score.yellow} red=${result.score.red}`,
  );
  out.push(
    result.score.red > 0
      ? "VERDICT FAIL — red dimension(s) present; see findings above."
      : "VERDICT PASS — no red dimensions.",
  );
  return `${out.join("\n")}\n`;
}

/** Render the machine-readable JSON report (already schema-validated upstream). */
export function renderJson(result: ScanResult): string {
  return JSON.stringify(result, null, 2);
}
