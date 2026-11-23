import { HTTP_STATUS } from "../config/runtimeConfig.js";
import { GEMINI_ROLE } from "../translator/schema/index.js";

// Antigravity refuses some requests — e.g. a system prompt carrying fingerprinted third-party
// agent text (see ANTIGRAVITY_PROMPT_REWRITES) — with a bare gRPC RESOURCE_EXHAUSTED: this generic
// message and no details. Real quota errors carry reset info ("Individual quota reached ...
// Resets in 1h56m", quotaResetTimeStamp, retryDelay). The bare form repeats for the same body
// every time, so it is request-scoped: retrying, refreshing quota, or locking the account cannot
// help — only changing the prompt can.

const BARE_EXHAUSTED_MESSAGE = /^Resource has been exhausted \(e\.g\. check quota\)\.?$/;

export const ANTIGRAVITY_PROMPT_REJECTED_MESSAGE =
  "Antigravity rejected this request (upstream 429 RESOURCE_EXHAUSTED with no quota details, so this "
  + "is not your quota). Antigravity refuses system prompts that carry certain third-party agent "
  + "text. The known strings are rewritten (ANTIGRAVITY_PROMPT_REWRITES) and a refused prompt is "
  + "retried once with the system text moved into the first user turn, but this request was still "
  + "refused.";

/**
 * True only for a 429 whose body is the bare RESOURCE_EXHAUSTED with no structured detail.
 * A real quota 429 carries ErrorInfo/RetryInfo/quotaResetTimeStamp and is left untouched.
 */
export function isAntigravityPromptRejection(status, bodyText) {
  if (status !== HTTP_STATUS.RATE_LIMITED || !bodyText) return false;
  let error;
  try {
    error = JSON.parse(bodyText)?.error;
  } catch {
    return false;
  }
  if (error?.status !== "RESOURCE_EXHAUSTED") return false;
  if (!BARE_EXHAUSTED_MESSAGE.test(String(error.message || "").trim())) return false;
  return !(Array.isArray(error.details) && error.details.length > 0);
}

/**
 * Read an upstream error body once and keep it readable for later callers.
 *
 * proxyAwareFetch's DNS-bypass path (the default for Antigravity's Google hosts) returns a plain
 * object with no clone(), and its text() drains the socket — so the retry hook, the
 * prompt-rejection check and parseError must share a single read. A real Response is cloned and
 * left untouched.
 */
export function readBodyOnce(response) {
  if (!response?._bodyTextOnce) {
    const canClone = typeof response?.clone === "function";
    const read = canClone
      ? () => response.clone().text()
      : typeof response?.text === "function"
        ? response.text.bind(response)
        : async () => "";
    const pending = Promise.resolve().then(read).then(
      (text) => (typeof text === "string" ? text : ""),
      () => ""
    );
    response._bodyTextOnce = pending;
    if (!canClone) {
      // The original body is drained now: serve later readers from this single read.
      response.text = () => pending;
      response.json = async () => JSON.parse(await pending);
    }
  }
  return response._bodyTextOnce;
}

/**
 * Antigravity fingerprints systemInstruction only: the same text sent in a user turn passes
 * (probed live). Returns a copy of the envelope with the system parts moved to the front of the
 * first user turn, or null when there is no system text to move.
 */
export function moveSystemInstructionToContents(body) {
  const { systemInstruction, ...request } = body?.request || {};
  const parts = (systemInstruction?.parts || []).filter(
    (part) => typeof part?.text === "string" && part.text.trim()
  );
  if (parts.length === 0) return null;
  return {
    ...body,
    request: {
      ...request,
      contents: [{ role: GEMINI_ROLE.USER, parts }, ...(request.contents || [])],
    },
  };
}
