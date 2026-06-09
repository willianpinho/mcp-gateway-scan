import { capEvidence, findAntiPattern, findLines } from "../match.js";
import type {
  DimensionModule,
  DimensionResult,
  ScanContext,
} from "../types.js";

/**
 * Dimension 3 — Onboarding / supply chain.
 * Detects floating refs (:latest, @main, npx -y ...@, unpinned images) and
 * rewards digest/checksum pinning (sha256:, integrity, digest).
 */

const UNPINNED =
  /(:latest\b|@main\b|@master\b|\bnpx\s+(?:-y\s+)?[^\s]*@(?!\^|~|\d)[^\s]*|\buvx\s+[^\s]*@|image:\s*[^\s]+:(?:latest|dev|edge)\b)/i;

const PINNED =
  /\b(sha256:[a-f0-9]{8,}|integrity\s*[:=]|@sha256:|digest:|checksum|resolved\s*[:=].*#)/i;

const ALLOWLIST = /\ballow[-_]?list\b/i;

export const d3SupplyChain: DimensionModule = {
  id: "D3",
  title: "Onboarding & supply-chain pinning",
  run(ctx: ScanContext): DimensionResult {
    const unpinned = findAntiPattern(
      ctx,
      UNPINNED,
      { label: "unpinned/floating dependency" },
      { codeOnly: true },
    );
    const pinned = findLines(
      ctx,
      PINNED,
      { label: "digest/checksum pinning", polarity: "positive" },
      { skipComments: true, codeOnly: true },
    );
    const allowlist = findLines(
      ctx,
      ALLOWLIST,
      { label: "server allowlist", polarity: "positive" },
      { skipComments: true, codeOnly: true },
    );

    let color: DimensionResult["color"];
    let summary: string;
    const severity = "S2" as const;

    if (unpinned.length > 0 && pinned.length === 0) {
      color = "red";
      summary =
        "Dependencies/images resolve from mutable tags (:latest, @main, npx -y ...@) with no digest/checksum pinning. Supply-chain exposure (OWASP LLM05) — the live tool set can change under you.";
    } else if (unpinned.length > 0) {
      color = "yellow";
      summary =
        "Some pinning is present, but ≥1 dependency still floats on a mutable tag/branch. Pin every third-party server by digest/checksum.";
    } else if (pinned.length === 0) {
      color = "yellow";
      summary =
        "No floating refs found, but no explicit digest/checksum pinning detected either. Confirm third-party servers are pinned + allowlisted.";
    } else {
      color = "green";
      summary =
        "No floating dependency refs; digest/checksum pinning is present.";
    }

    const evidence = capEvidence([...unpinned, ...pinned, ...allowlist]);
    return {
      id: this.id,
      title: this.title,
      color,
      severity,
      summary,
      evidence,
    };
  },
};
