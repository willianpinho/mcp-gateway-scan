// Secure fixture: gateway with deny-by-default RBAC, fail-close, OTel, bounded calls.
import { trace } from "@opentelemetry/api";
import { enforcePolicy } from "./rbac.js";

const tracer = trace.getTracer("mcp-gateway");

interface CallContext {
  userId: string;
  tool: string;
  traceparent: string;
}

const CALL_TIMEOUT_MS = 5_000;

export async function invokeTool(
  ctx: CallContext,
  args: unknown,
): Promise<unknown> {
  const span = tracer.startSpan("tool.invoke", {
    attributes: {
      "gen_ai.system": "mcp-gateway",
      "gen_ai.operation.name": ctx.tool,
    },
  });
  try {
    // Authorization is enforced at the gateway on caller identity (RBAC),
    // never decided by the model. Deny-by-default.
    const decision = await enforcePolicy(ctx.userId, ctx.tool);
    if (!decision.allowed) {
      span.setStatus({ code: 2, message: "denied" });
      throw new Error("forbidden");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);
    try {
      return await callUpstream(ctx, args, controller.signal, {
        traceparent: ctx.traceparent,
        max_tokens: 2048,
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    // Fail CLOSED: any error on the auth/call path denies the request.
    span.recordException(err as Error);
    return { allowed: false, error: "request_denied" };
  } finally {
    span.end();
  }
}

async function callUpstream(
  _ctx: CallContext,
  _args: unknown,
  _signal: AbortSignal,
  _opts: { traceparent: string; max_tokens: number },
): Promise<unknown> {
  return {};
}
