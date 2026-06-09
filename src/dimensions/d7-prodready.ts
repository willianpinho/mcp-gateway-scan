import { capEvidence, codeFileCount, findLines } from "../match.js";
import type {
  DimensionModule,
  DimensionResult,
  ScanContext,
} from "../types.js";

/**
 * Dimension 7 — Production-readiness.
 * Detects missing kill-switch/feature-flag, missing 429/rate-limit, missing
 * eval/red-team gate.
 */

const KILL_SWITCH =
  /\b(kill[_-]?switch|feature[_-]?flag|flipt|launchdarkly|unleash|circuit[_-]?breaker|enabled\s*[:=]\s*(?:false|true))\b/i;

const RATE_429 =
  /\b(429|too[_\s-]?many[_\s-]?requests|rate[_-]?limit|throttle|rpm\b|tpm\b)\b/i;

const EVAL_REDTEAM =
  /\b(promptfoo|garak|pyrit|red[_-]?team|jailbreak|injection[_-]?test|eval(?:uation)?[_-]?(?:gate|suite)|refusal[_-]?rate)\b/i;

const ROLLOUT =
  /\b(canary|blue[_-]?green|rollback|helm\s+rollback|argo[_-]?rollouts)\b/i;

export const d7ProdReady: DimensionModule = {
  id: "D7",
  title: "Production-readiness",
  run(ctx: ScanContext): DimensionResult {
    const killSwitch = findLines(
      ctx,
      KILL_SWITCH,
      { label: "kill-switch / feature flag", polarity: "positive" },
      { skipComments: true, codeOnly: true },
    );
    const rate = findLines(
      ctx,
      RATE_429,
      { label: "rate limit / 429", polarity: "positive" },
      { skipComments: true, codeOnly: true },
    );
    const evalGate = findLines(
      ctx,
      EVAL_REDTEAM,
      { label: "eval / red-team gate", polarity: "positive" },
      { skipComments: true, codeOnly: true },
    );
    const rollout = findLines(
      ctx,
      ROLLOUT,
      { label: "staged rollout / rollback", polarity: "positive" },
      { skipComments: true, codeOnly: true },
    );

    const hasKill = killSwitch.length > 0;
    const hasRate = rate.length > 0;
    const hasEval = evalGate.length > 0;
    const hasCode = codeFileCount(ctx) > 0;
    const missing = [!hasKill, !hasRate, !hasEval].filter(Boolean).length;

    let color: DimensionResult["color"];
    let summary: string;
    const severity = "S2" as const;

    if (missing === 3 && hasCode) {
      color = "red";
      summary =
        "No kill-switch/feature-flag, no enforced rate limit/429, and no eval/red-team gate found. An incident becomes an outage with no fast lever.";
    } else if (missing >= 1) {
      const gaps: string[] = [];
      if (!hasKill) gaps.push("kill-switch");
      if (!hasRate) gaps.push("rate-limit/429");
      if (!hasEval) gaps.push("eval/red-team gate");
      color = "yellow";
      summary = `Core operational controls partially present. Missing: ${gaps.join(", ")}.`;
    } else {
      color = "green";
      summary =
        "Kill-switch/feature-flag, rate-limit/429, and eval/red-team controls are all present.";
    }

    const evidence = capEvidence([
      ...killSwitch,
      ...rate,
      ...evalGate,
      ...rollout,
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
