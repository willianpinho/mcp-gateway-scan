// Secure fixture: explicit RBAC / deny-by-default policy layer.
import { trace } from "@opentelemetry/api";

interface Decision {
  allowed: boolean;
}

// Deny-by-default grant table keyed on identity → role → tool.
const GRANTS: Record<string, ReadonlySet<string>> = {
  reader: new Set(["search_docs", "read_ticket"]),
  writer: new Set(["search_docs", "read_ticket", "write_ticket"]),
};

export async function enforcePolicy(
  userId: string,
  tool: string,
): Promise<Decision> {
  const span = trace.getTracer("rbac").startSpan("authz.check");
  try {
    const role = await lookupRole(userId);
    const allowlist = GRANTS[role];
    // canInvoke: deny-by-default — unmapped role or unlisted tool => deny.
    const allowed = allowlist?.has(tool) ?? false;
    return { allowed };
  } catch {
    // Fail CLOSED: if the policy lookup errors, deny.
    return { allowed: false };
  } finally {
    span.end();
  }
}

async function lookupRole(_userId: string): Promise<string> {
  return "reader";
}
