// Anti-slop injector: appends the antislop prompt into the system message of the
// final request body, just before dispatch to the provider executor.
//
// Same mechanism as open-sse/rtk/ponytail.js - a text instruction merged into the
// system prompt rather than a provider parameter, because that is what the
// antislop rules are: instructions, not API fields.
import { injectSystemPrompt } from "./systemInject.js";
import { ANTISLOP_PROMPTS, ANTISLOP_LEVELS } from "./antislopPrompt.js";

/**
 * @param {object} body   final provider request body
 * @param {string} format wire format (FORMATS.*), same value ponytail receives
 * @param {string} level  lite | full | ultra
 */
export function applyAntiSlop(body, format, level) {
  // An unknown or missing level falls back to full rather than injecting nothing:
  // a plugin that silently stops filtering is worse than one that filters hard.
  const prompt = ANTISLOP_PROMPTS[level] || ANTISLOP_PROMPTS[ANTISLOP_LEVELS.FULL];
  injectSystemPrompt(body, format, prompt);
}