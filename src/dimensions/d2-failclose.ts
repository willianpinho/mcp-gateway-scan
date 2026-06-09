import { anyMatch, capEvidence } from "../match.js";
import type {
  DimensionModule,
  DimensionResult,
  Evidence,
  ScanContext,
} from "../types.js";

/**
 * Dimension 2 — Fail-close / fail-open posture. The launch-blocking dimension.
 * Detects catch/except blocks that return allow/true/ok or pass (fail-open),
 * and absence of timeouts/breakers.
 */

const CATCH_START =
  /\b(catch\s*\(|except\s+\w+|except\s*:|rescue\b|recover\(\))/;
// Fail-open verdicts that, near a catch, mean "proceed despite the error".
const FAILOPEN_RESULT =
  /\breturn\s+(?:true|allow|ok|\{?\s*allowed\s*:\s*true|\{?\s*authorized\s*:\s*true)\b|^\s*pass\s*$|^\s*continue\s*$|\bnext\(\)/i;

const TIMEOUT_PATTERN =
  /\b(timeout|deadline|circuit|breaker|retr(?:y|ies)|backoff|max_retries|AbortController|signal\s*:)\b/i;

/**
 * Scan within a small window after each catch/except for a fail-open result.
 * This approximates "the default branch of the error handler returns allow".
 */
function findFailOpen(ctx: ScanContext): Evidence[] {
  const out: Evidence[] = [];
  for (const file of ctx.files) {
    if (file.relPath.endsWith(".md") || file.relPath.endsWith(".txt")) continue;
    for (let i = 0; i < file.lines.length; i++) {
      const line = file.lines[i];
      if (line === undefined || !CATCH_START.test(line)) continue;
      // Look at the catch line itself plus the next 4 lines.
      const windowEnd = Math.min(i + 5, file.lines.length);
      for (let j = i; j < windowEnd; j++) {
        const wl = file.lines[j];
        if (wl === undefined) continue;
        if (FAILOPEN_RESULT.test(wl)) {
          const t = wl.trim();
          out.push({
            file: file.relPath,
            line: j + 1,
            excerpt: t.length > 120 ? `${t.slice(0, 120)}…` : t,
            polarity: "negative",
            label: "fail-open on error path",
          });
          break;
        }
      }
    }
  }
  return out;
}

export const d2FailClose: DimensionModule = {
  id: "D2",
  title: "Fail-close / fail-open posture",
  run(ctx: ScanContext): DimensionResult {
    const failOpen = findFailOpen(ctx);
    const hasTimeouts = anyMatch(ctx, TIMEOUT_PATTERN, {
      codeOnly: true,
      skipComments: true,
    });

    let color: DimensionResult["color"];
    let summary: string;
    const severity = "S1" as const;

    if (failOpen.length > 0) {
      color = "red";
      summary =
        "Error handlers on the call path return allow/true/ok or pass — the system fails OPEN. A degraded auth/policy check silently becomes 'allow'. Launch blocker.";
    } else if (!hasTimeouts) {
      color = "yellow";
      summary =
        "No fail-open handlers found, but no timeouts/circuit breakers/retry budgets detected either. One slow upstream can stall the gateway unbounded.";
    } else {
      color = "green";
      summary =
        "No fail-open error handlers found and timeout/circuit-breaker controls are present.";
    }

    const tEvidence: Evidence[] = hasTimeouts
      ? [
          {
            file: "(corpus)",
            line: 1,
            excerpt: "timeout/circuit-breaker/retry control present",
            polarity: "positive",
            label: "timeout/breaker",
          },
        ]
      : [];

    const evidence = capEvidence([...failOpen, ...tEvidence]);
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
