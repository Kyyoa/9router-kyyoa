/**
 * Context Truncation & Pruning Helper for 9Router
 * Trims old conversation messages while preserving System prompts and recent turns.
 */

/**
 * Level presets for context truncation.
 *
 * The Token Saver UI mirrors the Caveman/Ponytail level pickers. Each preset
 * only decides how many non-system turns survive; a custom maxMessagesLimit
 * overrides it when the user has edited the number.
 */

export const PRUNING_PRESETS = [
  {
    id: "lite",
    label: "Lite",
    desc: "Keep a long history, trim only the oldest turns",
    maxMessages: 40,
  },
  {
    id: "full",
    label: "Full",
    desc: "Balanced: system prompt plus the last 20 turns",
    maxMessages: 20,
  },
  {
    id: "ultra",
    label: "Ultra",
    desc: "Aggressive: last 6 turns, maximum saving",
    maxMessages: 6,
  },
];

const PRESET_BY_ID = new Map(PRUNING_PRESETS.map((p) => [p.id, p]));

export function resolvePruningLimit(level, fallback = 20) {
  const preset = PRESET_BY_ID.get(String(level || ""));
  return preset ? preset.maxMessages : fallback;
}

export function pruneContextMessages(body, limit = 20) {
  if (!body || typeof body !== "object") return;
  const maxKeep = Math.max(4, Number(limit) || 20);

  // OpenAI / Claude format: body.messages
  if (Array.isArray(body.messages) && body.messages.length > maxKeep + 1) {
    const systemMsgs = body.messages.filter((m) => m.role === "system");
    const nonSystemMsgs = body.messages.filter((m) => m.role !== "system");

    if (nonSystemMsgs.length > maxKeep) {
      const keptNonSystem = nonSystemMsgs.slice(-maxKeep);
      body.messages = [...systemMsgs, ...keptNonSystem];
    }
  }

  // OpenAI Responses format: body.input
  if (Array.isArray(body.input) && body.input.length > maxKeep + 1) {
    const systemInputs = body.input.filter((m) => m.role === "system");
    const nonSystemInputs = body.input.filter((m) => m.role !== "system");

    if (nonSystemInputs.length > maxKeep) {
      const keptNonSystem = nonSystemInputs.slice(-maxKeep);
      body.input = [...systemInputs, ...keptNonSystem];
    }
  }

  // Gemini format: body.contents
  if (Array.isArray(body.contents) && body.contents.length > maxKeep) {
    body.contents = body.contents.slice(-maxKeep);
  }
}
