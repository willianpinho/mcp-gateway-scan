import { capEvidence, findLines } from "../match.js";
import type {
  DimensionModule,
  DimensionResult,
  Evidence,
  ScanContext,
} from "../types.js";

/**
 * Dimension 6 — Security, secrets & identity.
 * HARD RULE: detect INLINE secret literals but NEVER print the value. Evidence
 * for a secret hit carries `excerpt = "<redacted secret literal>"` only — the
 * matched substring is discarded and never stored.
 * Rewards op:// / vault: / process.env references; detects IDP/oidc presence.
 */

// Value-shaped secret literals. Each match is a candidate inline secret.
const SECRET_PATTERNS: RegExp[] = [
  /\bsk-[A-Za-z0-9]{16,}\b/, // OpenAI-style
  /\bAKIA[0-9A-Z]{16}\b/, // AWS access key id
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/, // PEM private key
  /\bghp_[A-Za-z0-9]{20,}\b/, // GitHub PAT
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, // Slack token
  /\b(?:api[_-]?key|secret|password|token)\s*[:=]\s*["']?[A-Za-z0-9_\-]{16,}["']?/i, // key = literal
];

// Good patterns: references to a secret manager / env, not values.
const SECRET_REFERENCE =
  /\b(op:\/\/|vault:|secretsmanager:|arn:aws:secretsmanager|process\.env\.|os\.environ|\$\{?[A-Z][A-Z0-9_]*\}?|env\()/;

const IDP =
  /\b(okta|entra|azuread|auth0|oidc|saml|issuer|jwks|client_credentials|resource[_-]?server|audience|expires_in)\b/i;

/**
 * Find inline secret literals WITHOUT ever retaining the matched value.
 * We record only file + line + a fixed redaction string.
 */
function findInlineSecrets(ctx: ScanContext): Evidence[] {
  const out: Evidence[] = [];
  for (const file of ctx.files) {
    // Skip example/template env files and prose by intent? No — example files
    // can still leak. But a literal that is clearly a placeholder env reference
    // is excluded by SECRET_REFERENCE check below per-line.
    for (let i = 0; i < file.lines.length; i++) {
      const line = file.lines[i];
      if (line === undefined) continue;
      // If the line is purely a manager reference, it is not an inline secret.
      const looksLikeRef =
        SECRET_REFERENCE.test(line) &&
        !/[:=]\s*["']?[A-Za-z0-9]{16,}/.test(
          line.replace(
            /(op:\/\/|process\.env\.|os\.environ|\$\{?[A-Z0-9_]+\}?)/g,
            "",
          ),
        );
      let matched = false;
      for (const p of SECRET_PATTERNS) {
        if (p.test(line)) {
          matched = true;
          break;
        }
      }
      if (matched && !looksLikeRef) {
        out.push({
          file: file.relPath,
          line: i + 1,
          excerpt: "<redacted secret literal>", // NEVER the real value
          polarity: "negative",
          label: "inline secret literal",
        });
      }
    }
  }
  return out;
}

export const d6Secrets: DimensionModule = {
  id: "D6",
  title: "Security, secrets & identity",
  run(ctx: ScanContext): DimensionResult {
    const inlineSecrets = findInlineSecrets(ctx);
    const refs = findLines(
      ctx,
      SECRET_REFERENCE,
      { label: "secret-manager / env reference", polarity: "positive" },
      { skipComments: true },
    );
    const idp = findLines(
      ctx,
      IDP,
      { label: "IDP / OIDC identity", polarity: "positive" },
      { skipComments: true },
    );

    let color: DimensionResult["color"];
    let summary: string;
    const severity = "S1" as const;

    if (inlineSecrets.length > 0) {
      color = "red";
      summary = `${inlineSecrets.length} inline secret literal(s) found in repo/config (value NOT shown). One leaked config = full compromise. Externalize to a manager (op:// / vault:) and rotate immediately.`;
    } else if (refs.length === 0) {
      color = "yellow";
      summary =
        "No inline secret literals found, but also no secret-manager/env references detected. Confirm credentials are externalized.";
    } else if (idp.length === 0) {
      color = "yellow";
      summary =
        "Secrets are referenced (not inlined), but no IDP/OIDC identity wiring detected — who-can-do-what and central revocation may be unanswerable.";
    } else {
      color = "green";
      summary =
        "No inline secrets; credentials referenced from a manager/env and IDP/OIDC identity wiring is present.";
    }

    // Secret evidence first so the redacted hits are unmistakable.
    const evidence = capEvidence([...inlineSecrets, ...refs, ...idp]);
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
