import type { Color, ScanResult } from "./types.js";

/**
 * Audit landing page. Kept as a single constant so the CTA URL can be updated in
 * one place when the funnel destination changes.
 */
const AUDIT_URL = "https://provenwright.com/audit";

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
export function renderText(
  result: ScanResult,
  useColor: boolean,
  showCta = true,
): string {
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

  // Closing CTA (human report only; suppressible via --no-cta).
  if (showCta) {
    for (const line of renderCta(result, useColor)) out.push(line);
  }

  return out.join("\n");
}

const CTA_RULE =
  "  ─────────────────────────────────────────────────────────────────────";

/**
 * Render the honest closing CTA appended to the human report.
 *
 * The copy names what a static config scan CAN and CANNOT assess, then points to
 * the full audit — signal, not spam. Two variants:
 *   - clean scan (0 red, 0 yellow): "config clean — here's what a static scan can't see"
 *   - findings present (any yellow/red): the full "found vs can't see" breakdown
 *
 * If the scanner ever gains a capability listed below (e.g. trace analysis), drop
 * the corresponding bullet so the copy stays honest.
 */
function renderCta(result: ScanResult, useColor: boolean): string[] {
  const b = (s: string) => (useColor ? `${BOLD}${s}${RESET}` : s);
  const dim = (s: string) => (useColor ? `${DIM}${s}${RESET}` : s);
  const cyan = (s: string) => (useColor ? `${CYAN}${s}${RESET}` : s);

  const out: string[] = [];
  const isClean = result.score.red === 0 && result.score.yellow === 0;

  out.push(dim(CTA_RULE));

  if (isClean) {
    out.push(b("  Your static config looks clean. Here's what to check next."));
    out.push("");
    for (const l of wrap(
      "This scan found no surface-level config anti-patterns. That's a good sign — and it's only part of the picture.",
      2,
    )) {
      out.push(dim(l));
    }
    out.push("");
    for (const l of wrap(
      "Static config analysis can't assess fail-close behavior, live permission scope, prompt-injection paths, or whether your observability is good enough to reconstruct a misbehaving call.",
      2,
    )) {
      out.push(dim(l));
    }
    out.push("");
    for (const l of wrap(
      "If you're shipping to production in the next 90 days, those gaps are worth checking before you ship.",
      2,
    )) {
      out.push(dim(l));
    }
  } else {
    out.push(b("  What this scan found vs. what it can't see"));
    out.push("");
    for (const l of wrap(
      "This scan checked surface-level configuration patterns across your MCP setup — unpinned registries, missing auth patterns, inline secret indicators, absent rate-limit config, and similar static signals.",
      2,
    )) {
      out.push(dim(l));
    }
    out.push("");
    out.push(dim("  What it cannot assess:"));
    const gaps = [
      "Whether your agents actually fail closed when the gateway degrades (requires fault testing in a staging environment)",
      "Whether tool permissions are scoped to least-privilege in practice, not just in config (requires tracing live calls)",
      "Whether a new MCP server can enter production without a review gate (requires walking your actual onboarding flow)",
      "Whether prompt-injection paths exist between tools (requires reading the tool-interaction graph, not just files)",
      "Whether your observability captures enough to reconstruct a misbehaving call after the fact (requires log/trace review)",
    ];
    for (const gap of gaps) {
      const [first = "", ...rest] = wrap(gap, 6);
      out.push(dim(`    • ${first.trimStart()}`));
      for (const cont of rest) out.push(dim(cont));
    }
    out.push("");
    for (const l of wrap(
      "These are the risks that cause incidents. They don't show up in a static scan.",
      2,
    )) {
      out.push(dim(l));
    }
    out.push("");
    out.push(b("  Get a production-readiness audit"));
    out.push("");
    for (const l of wrap(
      "The MCP Production-Readiness Audit covers all 7 dimensions — including everything above — in one week at a fixed price. You get a named go/no-go verdict, a scored gap matrix, and a prioritized 90-day roadmap.",
      2,
    )) {
      out.push(dim(l));
    }
  }

  out.push("");
  out.push(cyan(`  → ${AUDIT_URL}`));
  out.push(dim(CTA_RULE));
  out.push("");
  return out;
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
