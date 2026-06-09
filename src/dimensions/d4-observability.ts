import {
  capEvidence,
  codeFileCount,
  findAntiPattern,
  findLines,
} from "../match.js";
import type {
  DimensionModule,
  DimensionResult,
  ScanContext,
} from "../types.js";

/**
 * Dimension 4 — Observability & tracing.
 * Detects presence/absence of OTel / traceparent / spans, and W3C context
 * propagation. GenAI semconv attributes are a bonus positive signal.
 */

const OTEL =
  /\b(opentelemetry|@opentelemetry|otel|tracer\b|start_span|startActiveSpan|startSpan|trace\.getTracer|inject\(|extract\()/i;

const TRACEPARENT = /\b(traceparent|tracestate)\b/i;

const GENAI_SEMCONV =
  /\bgen_ai\.(system|request\.model|operation\.name|usage\.(input|output)_tokens)\b/i;

// Raw prompt/secret in logs — a red regardless of trace quality (OWASP LLM02).
const LOG_LEAK =
  /\b(log(?:ger)?|console)\.\w+\([^)]*(prompt|messages|api[_-]?key|authorization|password|cpf)\b/i;

export const d4Observability: DimensionModule = {
  id: "D4",
  title: "Observability & tracing (OpenTelemetry)",
  run(ctx: ScanContext): DimensionResult {
    const otel = findLines(
      ctx,
      OTEL,
      { label: "OTel instrumentation", polarity: "positive" },
      { codeOnly: true, skipComments: true },
    );
    const traceparent = findLines(
      ctx,
      TRACEPARENT,
      { label: "W3C trace-context propagation", polarity: "positive" },
      { skipComments: true, codeOnly: true },
    );
    const semconv = findLines(
      ctx,
      GENAI_SEMCONV,
      { label: "GenAI semconv attribute", polarity: "positive" },
      { codeOnly: true, skipComments: true },
    );
    const leaks = findAntiPattern(
      ctx,
      LOG_LEAK,
      { label: "raw prompt/secret in logs" },
      { codeOnly: true },
    );

    const hasOtel = otel.length > 0;
    const hasPropagation = traceparent.length > 0;
    const hasCode = codeFileCount(ctx) > 0;

    let color: DimensionResult["color"];
    let summary: string;
    const severity = "S2" as const;

    if (leaks.length > 0) {
      color = "red";
      summary =
        "Raw prompts/secrets/PII appear to be written to logs (OWASP LLM02) — a red regardless of trace quality. Scrub sensitive fields at the collector.";
    } else if (!hasOtel && hasCode) {
      color = "red";
      summary =
        "No distributed tracing (OpenTelemetry / traceparent / spans) found. Cannot reconstruct 'what did this agent do' for an arbitrary request.";
    } else if (hasOtel && !hasPropagation) {
      color = "yellow";
      summary =
        "OTel instrumentation present, but no W3C traceparent/tracestate propagation detected — context likely breaks at the MCP-server hop (the most security-relevant blind spot).";
    } else {
      color = "green";
      summary =
        "OTel instrumentation and W3C trace-context propagation are present; no obvious raw-prompt/secret logging.";
    }

    const evidence = capEvidence([
      ...leaks,
      ...otel,
      ...traceparent,
      ...semconv,
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
