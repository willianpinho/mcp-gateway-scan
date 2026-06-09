import { anyMatch, capEvidence, findLines } from "../match.js";
import type {
  DimensionModule,
  DimensionResult,
  ScanContext,
} from "../types.js";

/**
 * Dimension 1 — Tool-access governance & RBAC.
 * Cardinal sin: authorization expressed inside a prompt (model decides access).
 * Also rewards an explicit gateway/host policy layer; absence is a yellow/red.
 */

// Tool-gating language inside prompts (runbook Phase 2.4).
const AUTHZ_IN_PROMPT =
  /\b(only use|do not call|don'?t call|you may (?:only )?call|if the user is(?: an?)? admin|when the user is(?: an?)? admin|never call .* unless)\b/i;

// A real policy/authz layer at the gateway/host.
const POLICY_LAYER =
  /\b(rbac|authoriz|can(?:Call|Invoke|Access)|allowlist|deny[-_]?by[-_]?default|opa|cedar|casbin|oso|permission(?:s)?\.(?:check|enforce)|enforce(?:Policy|Rbac))\b/i;

// Tool registrations — confirms this repo actually exposes tools.
const TOOL_REGISTRATION =
  /\b(server\.(?:tool|registerTool)\(|setRequestHandler\(\s*ListToolsRequestSchema|@(?:mcp|server)\.tool|add_tool\(|FastMCP|Tool\()/;

export const d1Rbac: DimensionModule = {
  id: "D1",
  title: "Tool-access governance & RBAC",
  run(ctx: ScanContext): DimensionResult {
    const promptAuthz = findLines(
      ctx,
      AUTHZ_IN_PROMPT,
      { label: "authz-in-prompt", polarity: "negative" },
      { codeOnly: true },
    );
    const policyLines = findLines(
      ctx,
      POLICY_LAYER,
      { label: "policy/RBAC layer", polarity: "positive" },
      { codeOnly: true, skipComments: true },
    );
    const hasTools = anyMatch(ctx, TOOL_REGISTRATION, {
      codeOnly: true,
      skipComments: true,
    });
    const hasPolicy = policyLines.length > 0;

    let color: DimensionResult["color"];
    let summary: string;
    const severity = "S1" as const;

    if (promptAuthz.length > 0) {
      color = "red";
      summary =
        "Authorization expressed inside prompts — the model decides tool access. Bypassed by prompt injection (OWASP LLM01/LLM06). Move authz to the gateway/host on caller identity.";
    } else if (hasTools && !hasPolicy) {
      color = "red";
      summary =
        "Tools are exposed but no RBAC/policy/deny-by-default layer was found. Any caller can reach any tool.";
    } else if (!hasPolicy) {
      color = "yellow";
      summary =
        "No prompt-based authz found, but also no explicit gateway-enforced RBAC/policy layer detected. Confirm enforcement is on caller identity.";
    } else {
      color = "green";
      summary =
        "A gateway/host policy/RBAC layer is present and no authorization is expressed in prompts.";
    }

    const evidence = capEvidence([...promptAuthz, ...policyLines]);
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
