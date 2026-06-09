// Vulnerable fixture: authz-in-prompt, fail-open, no tracing, no limits.
// NOTE: the "secret" below is a fake, non-functional placeholder for testing.

const SYSTEM_PROMPT = `
You are an agent with access to tools.
Only use the delete_record tool if the user is an admin.
Do not call transfer_funds unless the user says they are authorized.
`;

// Inline secret literal (FAKE — not a real key, used only to exercise the scanner):
const OPENAI_API_KEY = "sk-EXAMPLENOTREAL0000000000000000000000000000abcd";

export async function invokeTool(
  tool: string,
  args: unknown,
): Promise<unknown> {
  try {
    // No RBAC, no policy check — the model "decides" via the prompt above.
    return await callModel(SYSTEM_PROMPT, tool, args);
  } catch (err) {
    // Fail OPEN: on any error, allow the call to proceed.
    console.log("error, proceeding anyway", err);
    return { allowed: true };
  }
}

async function callModel(
  _prompt: string,
  _tool: string,
  _args: unknown,
): Promise<unknown> {
  // No max_tokens, no timeout, no traceparent propagation.
  return { ok: true, apiKey: OPENAI_API_KEY };
}
