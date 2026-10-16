// Runtime interceptor for Custom Plugins.
//
// Plugins are REAL, not prompt injection:
//   - Image Vision: signals caps.vision = true on the request so the translator
//     keeps raw image blocks intact instead of stripping them.
//   - Think Deeper: sets native reasoning parameters (reasoning_effort, thinking
//     config) so the provider routes to its deepest reasoning tier, plus a
//     step-by-step persona instruction for providers that ignore those params.
//   - Speed Mode: sets native reasoning-disabled parameters so the provider
//     skips all thinking and returns the answer directly, plus an
//     answer-directly persona instruction for providers that ignore them.
//   - JSON Guard: repairs machine-readable output on the way back (fenced JSON,
//     prose around it, Python literals, a tail cut off by the output limit) and
//     removes tool-call argument names the declared schema never had.
//   - Context Squeezer: trims a conversation that no longer fits the model's
//     window, keeping the newest turns and dropping the oldest behind a recap.
//
// This module owns selection (which plugin applies to which model) and the
// request side. The two response-side repairs live next door so the chat path
// can reach them without pulling the plugin registry in:
//   - open-sse/translator/concerns/jsonGuard.js       (answers)
//   - open-sse/translator/concerns/contextSqueezer.js (requests)

import { getSettings } from "@/lib/localDb";
import { matchesModel } from "@/shared/utils/pluginModelMatch";
import { FORMATS } from "open-sse/translator/formats.js";
import { getCapabilitiesForModel } from "open-sse/providers/capabilities.js";
import { squeezeContext } from "open-sse/translator/concerns/contextSqueezer.js";
import { applyAntiSlop } from "open-sse/rtk/antislop.js";
import { injectSystemPrompt } from "open-sse/rtk/systemInject.js";

// Default plugin state for fresh installs / missing settings
const DEFAULT_PLUGINS = {
  imageVision: { enabled: false, models: [] },
  thinkDeeper: { enabled: false, models: [] },
  speedMode: { enabled: false, models: [] },
  jsonGuard: { enabled: false, models: [] },
  contextSqueezer: { enabled: false, models: [] },
  openaiToolBridge: { enabled: false, models: [] },
  antiSlop: { enabled: false, models: [] },
};

// Cached plugin settings to avoid DB hits on every stream chunk
let cachedPlugins = null;
let lastFetch = 0;
const CACHE_TTL_MS = 2000;

async function getPluginConfig() {
  const now = Date.now();
  if (cachedPlugins && now - lastFetch < CACHE_TTL_MS) {
    return cachedPlugins;
  }
  try {
    const settings = await getSettings();
    cachedPlugins = settings?.customPlugins || DEFAULT_PLUGINS;
    lastFetch = now;
  } catch {
    cachedPlugins = DEFAULT_PLUGINS;
  }
  return cachedPlugins;
}

export function clearPluginCache() {
  cachedPlugins = null;
  lastFetch = 0;
}


/**
 * Every name this request could be called by, in the order the layers know it:
 * what the client asked for, provider/model as routed, the bare model id, and the
 * bare name behind a namespaced call. Shared by the request and response paths so
 * a model picked for a plugin on the dashboard is found by identical rules on
 * both sides - a plugin that silently stopped applying halfway through a request
 * would be worse than one that never applied.
 */
export function modelKeysToTest(requestedModel, provider, model) {
  const keys = [
    requestedModel,
    `${provider}/${model}`,
    model,
  ].filter(Boolean);

  if (requestedModel && requestedModel.includes("/")) {
    keys.push(requestedModel.split("/").pop());
  }
  return keys;
}

/**
 * Image Vision plugin - REAL implementation.
 *
 * Instead of converting images to fake text strings, we simply signal that
 * the model now supports vision. The chat pipeline (stripUnsupportedModalities)
 * will keep raw image blocks intact and the translator will format them for the
 * target provider (base64, URL, etc).
 *
 * For models that truly do not support vision at the provider level, the
 * upstream API may reject the request - but that is transparent and honest
 * rather than silently returning garbage extracted from JPEG binary.
 *
 * We add a lightweight system nudge so models that *can* read images know
 * to describe what they see.
 */
export function applyImageVision(body) {
  if (!body?.messages) return false;

  const hasImages = body.messages.some(
    (m) =>
      Array.isArray(m.content) &&
      m.content.some(
        (b) =>
          b?.type === "image_url" ||
          b?.type === "image" ||
          (b?.type === "tool_result" && Array.isArray(b.content) &&
            b.content.some((c) => c?.type === "image_url" || c?.type === "image"))
      )
  );

  if (hasImages) {
    // Add a concise instruction so the model focuses on visual content
    if (body.system && typeof body.system === "string") {
      if (!body.system.includes("Image Vision")) {
        body.system = "Image Vision is active: process all attached images and answer questions about their visual content.\n\n" + body.system;
      }
    } else if (Array.isArray(body.messages)) {
      const sysIdx = body.messages.findIndex((m) => m.role === "system");
      if (sysIdx >= 0) {
        const sys = body.messages[sysIdx].content;
        const txt = typeof sys === "string" ? sys : (Array.isArray(sys) && sys[0]?.type === "text" ? sys[0].text : "");
        if (txt && !txt.includes("Image Vision")) {
          const prefix = "Image Vision is active: process all attached images and answer questions about their visual content.\n\n";
          if (typeof sys === "string") {
            body.messages[sysIdx].content = prefix + sys;
          } else if (Array.isArray(sys) && sys[0]?.type === "text") {
            sys[0].text = prefix + sys[0].text;
          }
        }
      }
    }
  }

  return true; // always signal vision active - images pass through to translator
}

/**
 * Think Deeper plugin - REAL implementation.
 *
 * Sets native reasoning parameters so the provider routes to its deepest
 * reasoning tier. Uses the same params the 9Router thinking pipeline reads.
 * A persona instruction goes in alongside: most OpenAI-compatible providers
 * drop reasoning_* fields they do not implement, and then the param alone
 * would leave the plugin enabled-but-inert. The instruction is the portable
 * half; the param is the native half.
 */
const THINK_DEEPER_PERSONA = "Think Deeper is active: work through the problem step by step before answering - break it into parts, reason through each one, then give the final answer.";

export function applyThinkDeeper(body, sourceFormat) {
  if (!body) return;

  // Provider-native reasoning depth parameters
  if (sourceFormat === FORMATS.CLAUDE) {
    // Claude uses thinking object
    body.thinking = {
      type: "enabled",
      budget_tokens: body.thinking?.budget_tokens || 10240,
    };
  } else {
    // OpenAI / OpenAI-compatible
    body.reasoning_effort = "high";
    // Some providers use these alternate fields
    if (!body.reasoning) {
      body.reasoning = { effort: "high" };
    }
  }

  // Persona half, through the shared injector so every wire format (chat,
  // responses, Claude system, Gemini, Kiro) is covered and repeats dedupe.
  injectSystemPrompt(body, sourceFormat, THINK_DEEPER_PERSONA);
}

/**
 * Speed Mode plugin - REAL implementation.
 *
 * Uses native reasoning-disable parameters. Skips thinking entirely
 * so responses come back instantly without any chain-of-thought overhead.
 * Same portable-half reasoning as Think Deeper: a provider that ignores
 * the disable fields still obeys the answer-directly instruction.
 */
const SPEED_MODE_PERSONA = "Speed Mode is active: answer directly with no deliberation, no chain-of-thought preamble and no thinking trace - the shortest correct answer.";

export function applySpeedMode(body, sourceFormat) {
  if (!body) return;

  if (sourceFormat === FORMATS.CLAUDE) {
    body.thinking = { type: "disabled" };
    delete body.reasoning_effort;
  } else {
    body.reasoning_effort = "none";
    if (body.thinking && typeof body.thinking === "object") {
      delete body.thinking.budget_tokens;
    }
  }
  delete body.enable_thinking;
  delete body.thinking_budget;

  // Persona half - see applyThinkDeeper for why the param alone is not enough.
  injectSystemPrompt(body, sourceFormat, SPEED_MODE_PERSONA);
}

/* ------------------------------------------------------------------ *
 * JSON Guard - request side
 * ------------------------------------------------------------------ */

/**
 * Make sure a request that wants machine-readable output actually asks for it.
 *
 * A client that set `response_format` already said what it wants. A client that
 * only hinted with words in the prompt ("return JSON", "only output json") gets
 * the native parameter filled in here, because models that ignore the hint emit
 * prose and JSON Guard then has to strip the prose back off.
 */
export function applyJsonGuardRequest(body, sourceFormat) {
  if (!body) return false;

  const alreadyAsked = body.response_format?.type === "json_object"
    || body.response_format?.type === "json_schema";
  if (alreadyAsked) return false;

  const haystack = [
    typeof body.system === "string" ? body.system : "",
    Array.isArray(body.messages)
      ? body.messages
        .filter((m) => m?.role === "system" || m?.role === "user")
        .slice(0, 4)
        .map((m) => (typeof m.content === "string" ? m.content : ""))
        .join(" ")
      : "",
  ].join(" ").slice(0, 4000);

  const wantsJson = /\b(?:respond|reply|answer|return|output|produce)\b[^.!?]{0,40}\bjson\b/i.test(haystack)
    || /\bjson\s+only\b/i.test(haystack)
    || /\bonly\s+(?:output|return)\s+json\b/i.test(haystack);
  if (!wantsJson) return false;

  if (sourceFormat === FORMATS.CLAUDE) {
    // Claude has no response_format; a system instruction is the honest lever.
    if (typeof body.system === "string" && !body.system.includes("valid JSON")) {
      body.system = `${body.system}\n\nJSON Guard is active: answer with one valid JSON value and nothing else - no prose, no markdown fence.`;
    } else {
      const sysIdx = Array.isArray(body.messages) ? body.messages.findIndex((m) => m.role === "system") : -1;
      const note = "JSON Guard is active: answer with one valid JSON value and nothing else - no prose, no markdown fence.";
      if (sysIdx >= 0 && typeof body.messages[sysIdx].content === "string") {
        body.messages[sysIdx].content = `${body.messages[sysIdx].content}\n\n${note}`;
      } else {
        body.messages = [{ role: "system", content: note }, ...(body.messages || [])];
      }
    }
  } else {
    body.response_format = { type: "json_object" };
  }
  return true;
}

/* ------------------------------------------------------------------ *
 * Context Squeezer - request side
 * ------------------------------------------------------------------ */

/**
 * Context Squeezer, request side.
 *
 * The window comes from the provider's own capability table, so one setting
 * behaves the same on every model. Squeezing happens before translation, while
 * `messages` still holds the source format.
 */
export function applyContextSqueezer(body, provider, model) {
  if (!body?.messages || !Array.isArray(body.messages)) return null;

  const contextWindow = Number(getCapabilitiesForModel(provider, model)?.contextWindow);
  if (!Number.isFinite(contextWindow) || contextWindow <= 0) return null;

  const { messages, changed, stats } = squeezeContext(body.messages, { contextWindow });
  if (!changed) return null;

  body.messages = messages;
  return stats;
}

/* ------------------------------------------------------------------ *
 * OpenAI Tool Bridge - request side
 * ------------------------------------------------------------------ */

/**
 * OpenAI Tool Bridge, request side.
 *
 * The response side is where the repair happens (a model with `tools: false`
 * answers in prose and the bridge turns that prose back into tool_calls), but
 * the repair needs the tool catalogue the client offered, and `tools` is
 * translated away before dispatch. Snapshotting it here is what lets the
 * response layer answer "was that tool even offered?" instead of trusting any
 * tool name that appeared in prose.
 */
export function applyOpenAIToolBridgeRequest(body, provider, model) {
  if (!body) return false;
  if (!Array.isArray(body.tools) || !body.tools.length) {
    if (!Array.isArray(body.functions) || !body.functions.length) return false;
  }
  body._openaiToolBridge = {
    provider,
    model,
    tools: Array.isArray(body.tools) ? body.tools : [],
    functions: Array.isArray(body.functions) ? body.functions : [],
  };

  // Drop the tool list for a backend that cannot take it. Web-cookie providers
  // are text-only (capabilities.js: `tools: false`) and their executors reject
  // any request carrying tools with a hard 400 - "Gemini Web does not support
  // OpenAI function tools" - so the model never gets a chance to answer. The
  // catalogue is already snapshotted above; the response side turns the model's
  // answer back into tool_calls from that snapshot.
  //
  // Only an explicit `tools: false` triggers this. A provider with no entry in
  // the capability table keeps its tools, because guessing "unsupported" from
  // silence would silently strip tools from providers that do support them.
  let caps = null;
  try {
    caps = getCapabilitiesForModel(provider, model);
  } catch {
    caps = null;
  }
  if (caps && caps.tools === false) {
    delete body.tools;
    delete body.tool_choice;
    if (Array.isArray(body.functions)) body.functions = [];
    return true;
  }
  return true;
}

/* ------------------------------------------------------------------ *
 * Dispatch
 * ------------------------------------------------------------------ */

/**
 * Run every plugin that applies to the target model.
 *
 * Returns the capability flags chatCore needs before it strips modalities, plus
 * the two response-path flags so the response layer knows whether to repair the
 * answer without asking the settings table a second time.
 */
export async function applyCustomPlugins(body, provider, model, sourceFormat, requestedModel) {
  const config = await getPluginConfig();
  const keysToTest = modelKeysToTest(requestedModel, provider, model);
  const checkMatch = (modelList) => keysToTest.some((key) => matchesModel(modelList, key));

  const result = {
    isVisionActive: false,
    isThinkDeeperActive: false,
    isSpeedModeActive: false,
    isJsonGuardActive: false,
    isContextSqueezerActive: false,
    isToolBridgeActive: false,
    isAntiSlopActive: false,
    contextStats: null,
  };

  if (config.imageVision?.enabled && checkMatch(config.imageVision.models)) {
    result.isVisionActive = true;
    applyImageVision(body);
  }

  if (config.thinkDeeper?.enabled && checkMatch(config.thinkDeeper.models)) {
    result.isThinkDeeperActive = true;
    applyThinkDeeper(body, sourceFormat);
  }

  if (config.speedMode?.enabled && checkMatch(config.speedMode.models)) {
    result.isSpeedModeActive = true;
    applySpeedMode(body, sourceFormat);
  }

  // The two repairs below run on the answer, not the request. Resolving the flag
  // here keeps selection in one place and hands the response layer a plain
  // boolean instead of making it re-derive which models are configured.
  if (config.jsonGuard?.enabled && checkMatch(config.jsonGuard.models)) {
    result.isJsonGuardActive = true;
    applyJsonGuardRequest(body, sourceFormat);
  }

  if (config.contextSqueezer?.enabled && checkMatch(config.contextSqueezer.models)) {
    result.isContextSqueezerActive = true;
    result.contextStats = applyContextSqueezer(body, provider, model);
  }

  if (config.openaiToolBridge?.enabled && checkMatch(config.openaiToolBridge.models)) {
    result.isToolBridgeActive = applyOpenAIToolBridgeRequest(body, provider, model);
  }

  if (config.antiSlop?.enabled && checkMatch(config.antiSlop.models)) {
    result.isAntiSlopActive = true;
    applyAntiSlop(body, sourceFormat, config.antiSlop.level);
  }

  return result;
}

export { getPluginConfig };
