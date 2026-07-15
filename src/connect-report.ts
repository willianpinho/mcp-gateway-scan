import type { ConnectTarget } from "./connect-target.js";
import type { ConnectVerdict, Verdict } from "./connect.js";
import { renderText } from "./report.js";
import type { ScanResult } from "./types.js";

/**
 * Connect-mode report re-skin.
 *
 * Leads with the top-line CONNECT / REVIEW / DO-NOT-CONNECT verdict + the single
 * worst finding, then REUSES the existing 7-dimension `renderText` body verbatim.
 * No dimension rendering is duplicated here — this file only prepends the verdict
 * banner so the decision is the first thing the user sees.
 */

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";

const VERDICT_COLOR: Record<Verdict, string> = {
  CONNECT: GREEN,
  REVIEW: YELLOW,
  "DO-NOT-CONNECT": RED,
};

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

const RULE =
  "  ═════════════════════════════════════════════════════════════════════";

/** Build the verdict banner lines that lead the connect report. */
function verdictBanner(
  target: ConnectTarget,
  v: ConnectVerdict,
  useColor: boolean,
): string[] {
  const b = (s: string) => (useColor ? `${BOLD}${s}${RESET}` : s);
  const dim = (s: string) => (useColor ? `${DIM}${s}${RESET}` : s);
  const tag = (s: string) =>
    useColor ? `${BOLD}${VERDICT_COLOR[v.verdict]}${s}${RESET}` : s;

  const out: string[] = [];
  out.push("");
  out.push(dim(RULE));
  out.push(`  ${b("VERDICT:")} ${tag(v.verdict)}`);
  out.push(dim(`  ${target.label}`));
  out.push(dim(RULE));
  out.push("");
  for (const l of wrap(v.rationale, 2)) out.push(dim(l));

  if (v.topFinding) {
    const f = v.topFinding;
    out.push("");
    out.push(b("  Worst finding:"));
    out.push(`  ${tag(`[${f.severity}]`)} ${b(f.dimension)} ${f.title}`);
    out.push(dim(`        ${f.label}  ${f.file}:${f.line}  ${f.excerpt}`));
  }
  out.push("");
  return out;
}

/** Human-readable connect report: verdict banner + reused dimension body. */
export function renderConnectText(
  result: ScanResult,
  target: ConnectTarget,
  verdict: ConnectVerdict,
  useColor: boolean,
  showCta = true,
): string {
  const banner = verdictBanner(target, verdict, useColor).join("\n");
  // Reuse the existing 7-dimension report verbatim for the body.
  const body = renderText(result, useColor, showCta);
  return `${banner}${body}`;
}

/** Compact, greppable connect output for CI/pipelines. */
export function renderConnectCi(
  result: ScanResult,
  target: ConnectTarget,
  v: ConnectVerdict,
): string {
  const out: string[] = [];
  out.push(
    `mcp-gateway-scan connect v${result.version}  target=${result.target}`,
  );
  out.push(`label=${target.label}`);
  out.push(
    `RESULT green=${result.score.green} yellow=${result.score.yellow} red=${result.score.red}`,
  );
  if (v.topFinding) {
    const f = v.topFinding;
    out.push(`TOP ${f.severity} ${f.dimension} ${f.label} ${f.file}:${f.line}`);
  }
  out.push(`VERDICT ${v.verdict} — ${v.rationale}`);
  return `${out.join("\n")}\n`;
}

/** Machine-readable connect JSON: the full scan plus the connect verdict + target. */
export function renderConnectJson(
  result: ScanResult,
  target: ConnectTarget,
  verdict: ConnectVerdict,
): string {
  return JSON.stringify(
    {
      mode: "connect",
      target: {
        path: result.target,
        kind: target.kind,
        label: target.label,
        servers: target.servers,
      },
      connect: verdict,
      scan: result,
    },
    null,
    2,
  );
}
