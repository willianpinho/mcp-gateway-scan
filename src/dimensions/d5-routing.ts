import { capEvidence, codeFileCount, findLines } from "../match.js";
import type {
  DimensionModule,
  DimensionResult,
  ScanContext,
} from "../types.js";

/**
 * Dimension 5 — Multi-LLM routing & cost controls.
 * Detects missing max_tokens / budget / rate-limit / quota (open path to
 * bill-shock / DoS — OWASP LLM10). Rewards a declarative routing policy.
 */

const MAX_TOKENS =
  /\b(max_tokens|max_output_tokens|maxTokens|maxOutputTokens)\b/i;

const BUDGET =
  /\b(budget|spend|cost[_\s-]*(?:limit|cap|threshold)|quota|tpm|rpm)\b/i;

const RATE_LIMIT =
  /\b(rate[_-]?limit|throttle|leaky[_-]?bucket|token[_-]?bucket)\b/i;

const ROUTING =
  /\b(router\b|virtual[_-]?model|model_list|fallback|model_group|deployment|route[_-]?policy)\b/i;

export const d5Routing: DimensionModule = {
  id: "D5",
  title: "Multi-LLM routing & cost controls",
  run(ctx: ScanContext): DimensionResult {
    const maxTokens = findLines(
      ctx,
      MAX_TOKENS,
      { label: "max_tokens bound", polarity: "positive" },
      { skipComments: true, codeOnly: true },
    );
    const budget = findLines(
      ctx,
      BUDGET,
      { label: "budget/quota cap", polarity: "positive" },
      { skipComments: true, codeOnly: true },
    );
    const rateLimit = findLines(
      ctx,
      RATE_LIMIT,
      { label: "rate limit", polarity: "positive" },
      { skipComments: true, codeOnly: true },
    );
    const routing = findLines(
      ctx,
      ROUTING,
      { label: "routing policy", polarity: "positive" },
      { skipComments: true, codeOnly: true },
    );

    const hasMaxTokens = maxTokens.length > 0;
    const hasBudgetOrLimit = budget.length > 0 || rateLimit.length > 0;
    const hasCode = codeFileCount(ctx) > 0;

    let color: DimensionResult["color"];
    let summary: string;
    const severity = "S2" as const;

    if (!hasMaxTokens && !hasBudgetOrLimit && hasCode) {
      color = "red";
      summary =
        "No max_tokens, no per-team budget cap, no rate limit/quota found. Open path to bill-shock / DoS (OWASP LLM10) — one buggy caller can amplify an unbounded token loop.";
    } else if (!hasMaxTokens || !hasBudgetOrLimit) {
      color = "yellow";
      summary =
        "Partial cost controls: " +
        (hasMaxTokens ? "max_tokens present" : "max_tokens MISSING") +
        "; " +
        (hasBudgetOrLimit
          ? "budget/rate-limit present"
          : "budget/rate-limit MISSING") +
        ". Bound every call and enforce a per-team cap.";
    } else {
      color = "green";
      summary =
        "max_tokens bounding and budget/rate-limit controls are present; routing signals detected.";
    }

    const evidence = capEvidence([
      ...maxTokens,
      ...budget,
      ...rateLimit,
      ...routing,
    ]);
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
