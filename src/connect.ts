import { z } from "zod";
import { SeveritySchema } from "./types.js";
import type { DimensionResult, ScanResult } from "./types.js";

/**
 * Connect-verdict layer.
 *
 * This is the ONLY net-new scoring logic for the "should I CONNECT to this
 * third-party MCP server?" re-aim. It does NOT re-scan anything — it is a pure
 * reduction over the EXISTING 7-dimension `ScanResult` produced by `scan()`.
 * The dimension engine, evidence, severities and secret redaction are reused
 * verbatim; this file only maps their colors/severities onto a single,
 * decision-grade verdict a user can act on before wiring a server into an agent
 * that holds real credentials.
 */

export const VerdictSchema = z.enum(["CONNECT", "REVIEW", "DO-NOT-CONNECT"]);
export type Verdict = z.infer<typeof VerdictSchema>;

/** The single worst piece of evidence, surfaced at the top of the report. */
export const ConnectFindingSchema = z.object({
  dimension: z.string(),
  title: z.string(),
  severity: SeveritySchema,
  label: z.string(),
  file: z.string(),
  line: z.number().int().positive(),
  excerpt: z.string(),
});
export type ConnectFinding = z.infer<typeof ConnectFindingSchema>;

export const ConnectVerdictSchema = z.object({
  verdict: VerdictSchema,
  rationale: z.string(),
  /** Red dimensions at S1 severity — the launch-blocker class that forces DO-NOT-CONNECT. */
  blockingDimensions: z.array(z.string()),
  /** Red (S2/S3) + yellow dimensions — concrete-or-possible risk needing a human look. */
  reviewDimensions: z.array(z.string()),
  /** The single most severe anti-pattern hit, or null when the scan is clean. */
  topFinding: ConnectFindingSchema.nullable(),
});
export type ConnectVerdict = z.infer<typeof ConnectVerdictSchema>;

/** Severity rank for ordering (lower = more dangerous). */
const SEVERITY_RANK: Record<string, number> = { S1: 0, S2: 1, S3: 2 };

/**
 * Pick the single most dangerous negative evidence across all dimensions:
 * most-severe dimension first, then the dimension's own evidence order (which
 * already puts the worst hit first, e.g. redacted secrets ahead of refs).
 */
function pickTopFinding(dimensions: DimensionResult[]): ConnectFinding | null {
  let best: ConnectFinding | null = null;
  let bestRank = Number.POSITIVE_INFINITY;
  for (const d of dimensions) {
    const negative = d.evidence.find((e) => e.polarity === "negative");
    if (!negative) continue;
    // Only red dimensions carry a "this is dangerous" signal worth leading with.
    if (d.color !== "red") continue;
    const rank = SEVERITY_RANK[d.severity] ?? 9;
    if (rank < bestRank) {
      bestRank = rank;
      best = {
        dimension: d.id,
        title: d.title,
        severity: d.severity,
        label: negative.label,
        file: negative.file,
        line: negative.line,
        excerpt: negative.excerpt,
      };
    }
  }
  return best;
}

/**
 * Reduce a full ScanResult into a connect/review/do-not-connect verdict.
 *
 * Rules (decision-grade, defensible to a skeptical engineer):
 *   - DO-NOT-CONNECT  if any RED dimension is severity S1 (full-compromise class:
 *     fail-open authz, inline secret exfil surface, ungoverned tool access).
 *   - REVIEW          if there is concrete-or-possible risk (any RED S2/S3, or any
 *     YELLOW) but no S1 blocker — a human should look before connecting.
 *   - CONNECT         only when every dimension is GREEN.
 */
export function computeVerdict(result: ScanResult): ConnectVerdict {
  const blockingDimensions: string[] = [];
  const reviewDimensions: string[] = [];

  for (const d of result.dimensions) {
    if (d.color === "red" && d.severity === "S1") {
      blockingDimensions.push(d.id);
    } else if (d.color === "red" || d.color === "yellow") {
      reviewDimensions.push(d.id);
    }
  }

  const topFinding = pickTopFinding(result.dimensions);

  let verdict: Verdict;
  let rationale: string;
  if (blockingDimensions.length > 0) {
    verdict = "DO-NOT-CONNECT";
    rationale = `${blockingDimensions.length} launch-blocker (S1) dimension(s) red — ${blockingDimensions.join(", ")}. This server carries a full-compromise-class configuration; do not connect it to an agent holding real credentials until fixed.`;
  } else if (reviewDimensions.length > 0) {
    verdict = "REVIEW";
    rationale = `No S1 blockers, but ${reviewDimensions.length} dimension(s) need a human look before connecting — ${reviewDimensions.join(", ")}. Treat as conditional: review the findings, then decide.`;
  } else {
    verdict = "CONNECT";
    rationale =
      "All dimensions green on the static checks. No surface-level connect blockers found — still confirm trust of the publisher (a static scan cannot assess runtime behavior).";
  }

  return {
    verdict,
    rationale,
    blockingDimensions,
    reviewDimensions,
    topFinding,
  };
}

/** Exit code for the connect verdict — CONNECT passes (0), everything else gates (1). */
export function verdictExitCode(verdict: Verdict): number {
  return verdict === "CONNECT" ? 0 : 1;
}
