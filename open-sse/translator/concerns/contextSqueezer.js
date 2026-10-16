// Context Squeezer - fit a conversation into the model's context window.
//
// A gateway sees conversations arrive that no longer fit: the client keeps
// every turn, the window does not grow. Without help the provider rejects the
// request (a 400 the user cannot act on) or the model silently loses the end of
// the conversation. This trims on the way out instead.
//
// What is kept, in order of importance:
//   - the system prompt (it defines the task)
//   - the newest turns (they carry the current state)
//   - everything, when the conversation already fits - trimming is a repair,
//     not an optimisation, so a fitting conversation is never touched
//
// What is dropped: the oldest turns beyond the budget, replaced by one system
// line naming what went, so the model knows the history exists but is not here.
// Long tool output in the turns that survive is shortened first - one pasted
// file read can be most of the budget on its own.

// A conversation may fill this much of the window; the rest stays for the answer.
const DEFAULT_FILL_RATIO = 0.75;
// Content at least this long is a candidate for shortening inside a kept turn.
const LONG_CONTENT_CHARS = 4000;
// Never shorten below this many characters - a stub is worse than an eviction.
const MIN_KEEP_CHARS = 400;

/**
 * ~4 characters per token.
 *
 * Deliberately approximate: the decision is "does this fit", with a 25% margin,
 * and an exact tokenizer would cost more than the margin is worth. Heavier than
 * ASCII text (CJK, base64 images) counts higher, which errs toward trimming.
 */
export function estimateTokens(value) {
  if (value == null) return 0;
  let text;
  if (typeof value === "string") text = value;
  else {
    try { text = JSON.stringify(value) || ""; } catch { text = ""; }
  }
  return Math.ceil(text.length / 4);
}

/** Tokens a message costs, counting content blocks and tool payloads. */
export function estimateMessageTokens(message) {
  if (!message) return 0;
  const parts = [];
  if (typeof message.content === "string") parts.push(message.content);
  else if (Array.isArray(message.content)) parts.push(message.content);
  if (message.reasoning_content) parts.push(message.reasoning_content);
  if (message.thinking) parts.push(message.thinking);
  if (message.tool_calls) parts.push(message.tool_calls);
  if (message.tool_call_id) parts.push(message.tool_call_id);
  if (Array.isArray(message.content)) {
    for (const block of message.content) {
      if (block?.text) parts.push(block.text);
      if (block?.input) parts.push(block.input);
      if (block?.content && typeof block.content === "string") parts.push(block.content);
    }
  }
  return estimateTokens(parts) + 4; // role + frame
}

/** Run every message through the estimator. */
export function estimateConversationTokens(messages) {
  return (messages || []).reduce((sum, m) => sum + estimateMessageTokens(m), 0);
}

/** One line naming the turns that were dropped, so the model knows they existed. */
export function buildRecap(dropped) {
  const counts = { user: 0, assistant: 0, tool: 0, other: 0 };
  for (const m of dropped) {
    if (m?.role === "user") counts.user += 1;
    else if (m?.role === "assistant") counts.assistant += 1;
    else if (m?.role === "tool" || m?.tool_call_id) counts.tool += 1;
    else counts.other += 1;
  }
  const parts = [];
  if (counts.user) parts.push(`${counts.user} user message${counts.user > 1 ? "s" : ""}`);
  if (counts.assistant) parts.push(`${counts.assistant} assistant repl${counts.assistant > 1 ? "ies" : "y"}`);
  if (counts.tool) parts.push(`${counts.tool} tool result${counts.tool > 1 ? "s" : ""}`);
  if (counts.other) parts.push(`${counts.other} other turn${counts.other > 1 ? "s" : ""}`);
  const what = parts.length ? parts.join(", ") : "earlier turns";
  return (
    `[Context Squeezer] ${dropped.length} earlier turn${dropped.length > 1 ? "s" : ""} were dropped to fit this model's context window: ${what}. ` +
    `The turns below are verbatim and current. If the dropped history matters, ask the user to restate it.`
  );
}

/** Shorten one message's oversized string content, keeping its head and tail. */
function shortenMessage(message, charsToCut) {
  const cut = Math.min(charsToCut, Math.max(0, message.content.length - MIN_KEEP_CHARS));
  if (cut <= 0) return false;

  const text = message.content;
  const keepChars = text.length - cut;
  const headChars = Math.max(MIN_KEEP_CHARS, Math.floor(keepChars * 0.7));
  const head = text.slice(0, headChars);
  const tail = text.slice(text.length - Math.max(0, keepChars - headChars));
  const elided = text.length - head.length - tail.length;
  message.content = `${head}\n[... ${elided} characters elided by Context Squeezer ...]\n${tail}`;
  return true;
}

/**
 * Trim `messages` to fit `contextWindow` tokens.
 *
 * Options:
 *   - contextWindow  token budget for the model (required; no-op without it)
 *   - fillRatio      fraction of the window the conversation may use (default 0.75)
 *   - minTurns       conversational turns to keep at minimum (default 4)
 *
 * Returns { messages, changed, stats }. Never mutates the input: the caller
 * decides when the trimmed copy replaces the original.
 *
 * `stats` reports tokensBefore/tokensAfter, droppedTurns, and shortenedMessages
 * so the request log can show the trim happened.
 */
export function squeezeContext(messages, { contextWindow, fillRatio = DEFAULT_FILL_RATIO, minTurns = 4 } = {}) {
  const list = Array.isArray(messages) ? messages : [];
  const window = Number(contextWindow);

  if (!Number.isFinite(window) || window <= 0 || list.length === 0) {
    return { messages: list, changed: false, stats: { reason: "no-window" } };
  }

  const budget = Math.floor(window * fillRatio);
  const tokensBefore = estimateConversationTokens(list);
  if (tokensBefore <= budget) {
    return { messages: list, changed: false, stats: { tokensBefore, tokensAfter: tokensBefore, droppedTurns: 0, shortenedMessages: 0, reason: "fits" } };
  }

  const working = list.map((m) => ({ ...m }));

  // Leading system messages define the task and are never dropped.
  let firstTurn = 0;
  while (firstTurn < working.length && working[firstTurn].role === "system") firstTurn += 1;

  // Pass 1 - shorten oversized content in the turns we intend to keep, so the
  // eviction decision below sees the size those turns will actually cost.
  let shortened = 0;
  for (let i = firstTurn; i < working.length; i++) {
    const m = working[i];
    if (typeof m.content !== "string" || m.content.length < LONG_CONTENT_CHARS) continue;
    // Target: no single kept message may cost more than a quarter of the budget.
    const cap = Math.floor(budget / 4) * 4;
    const cost = estimateMessageTokens(m);
    if (cost > cap && shortenMessage(m, (cost - cap) * 4)) shortened += 1;
  }

  // Pass 2 - evict from the oldest turn until the conversation fits, keeping at
  // least `minTurns` conversational turns no matter what the budget says.
  let tokens = estimateConversationTokens(working);
  let cut = firstTurn;
  const keepFloor = Math.max(firstTurn, working.length - minTurns);
  while (tokens > budget && cut < keepFloor) {
    tokens -= estimateMessageTokens(working[cut]);
    cut += 1;
  }

  if (cut === firstTurn) {
    // Nothing could be evicted (already at the floor) - pass what we have
    // through and let the provider's own limits decide.
    return {
      messages: working,
      changed: shortened > 0,
      stats: { tokensBefore, tokensAfter: estimateConversationTokens(working), droppedTurns: 0, shortenedMessages: shortened, reason: "floor" },
    };
  }

  const dropped = working.slice(firstTurn, cut);
  const tail = working.slice(cut);
  const recap = buildRecap(dropped);
  const result = [...working.slice(0, firstTurn), { role: "system", content: recap }, ...tail];

  return {
    messages: result,
    changed: true,
    stats: {
      tokensBefore,
      tokensAfter: estimateConversationTokens(result),
      droppedTurns: dropped.length,
      shortenedMessages: shortened,
      recapChars: recap.length,
      reason: "trimmed",
    },
  };
}
