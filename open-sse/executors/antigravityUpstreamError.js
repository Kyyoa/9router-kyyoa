/**
 * antigravityUpstreamError.js — structured Antigravity upstream error builder
 * with turned-away system-prompt diagnostics (PR #20315 parity).
 */
import { buildErrorBody } from "../utils/error.js";
import { hint, turnsAway } from "../services/antigravityPromptCloak.js";

function extractUpstreamMessage(details, rawBody) {
  if (details && typeof details === "object") {
    const err = details.error;
    if (err && typeof err === "object" && typeof err.message === "string" && err.message.trim()) {
      return err.message.trim();
    }
    if (typeof err === "string" && err.trim()) return err.trim();
    if (typeof details.message === "string" && details.message.trim()) {
      return details.message.trim();
    }
  }
  if (typeof rawBody === "string" && rawBody.trim() && !rawBody.trim().startsWith("<")) {
    return rawBody.trim();
  }
  return null;
}

/**
 * The diagnostic appended to a 429 whose text is the bare "Resource has been
 * exhausted" Antigravity answers to a turned-away system prompt. Empty when the
 * status is not 429 or the prompt is not one of the known signatures.
 */
export function refusedPromptHint(status, systemPrompt, upstreamMessage, rawBody) {
  if (status !== 429 || !systemPrompt) return "";
  // hint() falls back to the generic Claude Code / Agent SDK text, so it only
  // means something once the prompt actually carries a TURNED_AWAY signature —
  // a clean prompt getting that text would blame a prompt that is fine.
  if (!turnsAway(systemPrompt)) return "";
  const detail = `${upstreamMessage ?? ""} ${rawBody ?? ""}`;
  if (!/resource has been exhausted/i.test(detail)) return "";
  return ` — ${hint(systemPrompt)}`;
}

/**
 * Build structured Antigravity upstream error body, including the turned-away
 * system-prompt hint on bare 429 "Resource has been exhausted" responses.
 */
export function buildAntigravityUpstreamError(status, statusText, rawBody, systemPrompt) {
  let upstreamDetails;
  try {
    upstreamDetails = rawBody ? JSON.parse(rawBody) : undefined;
  } catch {
    upstreamDetails = undefined;
  }

  if (
    status === 403 &&
    typeof rawBody === "string" &&
    (rawBody.includes("UberProxy") ||
      rawBody.includes("&Uuml;berProxy") ||
      rawBody.includes("berProxy: Error 403"))
  ) {
    return buildErrorBody(
      403,
      "Google edge blocked this account/IP (UberProxy 403). Wait, switch egress IP/proxy, or re-auth the account.",
      upstreamDetails
    );
  }

  const upstreamMessage = extractUpstreamMessage(upstreamDetails, rawBody);
  const suffix = statusText ? `: ${statusText}` : "";
  // A 429 is ambiguous: Antigravity answers the same bare "Resource has been
  // exhausted" to a system prompt it turns away whatever quota is left, so
  // operators must not wait out a quota that was never spent (cloak.mjs hint()).
  const refusedHint = refusedPromptHint(status, systemPrompt, upstreamMessage, rawBody);
  const message = upstreamMessage
    ? `Antigravity upstream error (${status}): ${upstreamMessage}${refusedHint}`
    : `Antigravity upstream error (${status})${suffix}${refusedHint}`;
  return buildErrorBody(status, message, upstreamDetails);
}
