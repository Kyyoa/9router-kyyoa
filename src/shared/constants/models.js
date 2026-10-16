// Import directly from file to avoid pulling in server-side dependencies via index.js
export {
  PROVIDER_MODELS,
  getProviderModels,
  getDefaultModel,
  isValidModel as isValidModelCore,
  findModelName,
  getModelTargetFormat,
  getModelStrip,
  PROVIDER_ID_TO_ALIAS,
  getModelsByProviderId,
  getModelUpstreamId,
  getModelQuotaFamily
} from "open-sse/config/providerModels.js";

import { AI_PROVIDERS, isOpenAICompatibleProvider } from "./providers.js";
import { PROVIDER_MODELS as MODELS } from "open-sse/config/providerModels.js";

// Providers that accept any model (passthrough)
const PASSTHROUGH_PROVIDERS = new Set(
  Object.entries(AI_PROVIDERS)
    .filter(([, p]) => p.passthroughModels)
    .map(([key]) => key)
);

// Wrap isValidModel with passthrough providers
export function isValidModel(aliasOrId, modelId) {
  if (isOpenAICompatibleProvider(aliasOrId)) return true;
  if (PASSTHROUGH_PROVIDERS.has(aliasOrId)) return true;
  const models = MODELS[aliasOrId];
  if (!models) return false;
  return models.some(m => m.id === modelId);
}

// Legacy AI_MODELS for backward compatibility
export const AI_MODELS = Object.entries(MODELS).flatMap(([alias, models]) =>
  models.map(m => ({ provider: alias, model: m.id, name: m.name }))
);

export const getModelKind = (m, fallback = null) => m?.kind || m?.type || fallback;

// Capacity metadata for UI badges - icon + label + color per capability.
export const CAPACITY_META = {
  vision: { mark: "vision", label: "Vision", desc: "Supports image input", color: "text-blue-500" },
  // search: temporarily hidden (feature not wired yet)
  reasoning: { mark: "reasoning", label: "Reasoning", desc: "Supports reasoning / thinking", color: "text-amber-500" },
  thinkDeeper: { mark: "thinkDeeper", label: "Think Deeper", desc: "Think Deeper Plugin: multi-step deep reasoning", color: "text-purple-400" },
  speedMode: { mark: "speedMode", label: "Speed", desc: "Speed Mode: skips thinking for faster responses", color: "text-cyan-400" },
  jsonGuard: { mark: "jsonGuard", label: "JSON", desc: "JSON Guard: repairs unparseable JSON and tool arguments", color: "text-emerald-400" },
  contextSqueezer: { mark: "contextSqueezer", label: "Squeeze", desc: "Context Squeezer: trims old turns to fit the context window", color: "text-amber-400" },
};

// Realtime STT transport markers accepted on custom models - single source of
// truth across layers: the API whitelist (src/app/api/models/custom/route.js
// sanitizeTransport) and the dashboard transport select
// (providers/[id]/AddCustomModelModal) both import this map, so one new row
// here makes a realtime engine dispatch case (open-sse/handlers/sttCore.js)
// selectable and validated end-to-end. Keys must mirror a sttCore case.
export const STT_TRANSPORT_META = {
  "gemini-live": {
    label: "Gemini Live (realtime WebSocket)",
    desc: "Streams audio over bidiGenerateContent and returns incremental transcription segments",
  },
};

export const STT_TRANSPORTS = Object.freeze(Object.keys(STT_TRANSPORT_META));

export function isSttTransport(transport) {
  if (typeof transport !== "string") return false;
  return Object.prototype.hasOwnProperty.call(STT_TRANSPORT_META, transport.trim());
}

// Keys of the custom plugins, in the order their marks are drawn on a model row.
// This is the single list every surface reads - the plugin page, the model
// picker, the usage view and /v1/models. A plugin missing here is a plugin whose
// mark can never appear on a model.
// Imported and re-exported from the leaf so the guard chain never has to import
// this module (it opens with `from "open-sse/config/..."`, which does not
// resolve inside .next/standalone and once took every route down with a 503).
// A plain `export ... from` would leave no local binding for pluginMarksFor.
import { CUSTOM_PLUGIN_KEYS } from "./pluginKeys";
export { CUSTOM_PLUGIN_KEYS };

/**
 * Plugin keys active for one model entry.
 *
 * `pluginMarks` on the payload is authoritative; the caps flags are still read as
 * a fallback because older payloads only carry those. The list is kept separate
 * from caps on purpose: a plugin used to signal itself by setting a capability
 * (Image Vision set caps.vision), which is indistinguishable from a native
 * capability and therefore drew no mark at all.
 */
export function pluginMarksFor(entry) {
  if (!entry) return [];
  const set = new Set(Array.isArray(entry.pluginMarks) ? entry.pluginMarks : []);
  const caps = entry.caps || entry;
  for (const key of CUSTOM_PLUGIN_KEYS) {
    if (!set.has(key) && caps && caps[key]) set.add(key);
  }
  return CUSTOM_PLUGIN_KEYS.filter((key) => set.has(key));
}

// Tooltip text and colour for each plugin mark. Kept beside CUSTOM_PLUGIN_KEYS so
// a plugin cannot have a key with no mark to draw or no label to explain it.
export const PLUGIN_MARK_META = {
  imageVision: {
    label: "Image Vision",
    desc: "Image Vision plugin: image input handled by the plugin",
    color: "text-blue-400",
  },
  thinkDeeper: {
    label: "Think Deeper",
    desc: "Think Deeper plugin: multi-step deep reasoning",
    color: "text-purple-400",
  },
  speedMode: {
    label: "Speed",
    desc: "Speed Mode plugin: skips thinking for faster responses",
    color: "text-cyan-400",
  },
  jsonGuard: {
    label: "JSON Guard",
    desc: "JSON Guard plugin: repairs unparseable JSON and tool arguments",
    color: "text-emerald-400",
  },
  contextSqueezer: {
    label: "Squeeze",
    desc: "Context Squeezer plugin: trims old turns to fit the context window",
    color: "text-amber-400",
  },
  openaiToolBridge: {
    label: "Tool Bridge",
    desc: "OpenAI Tool Bridge plugin: recovers tool calls a text-only model wrote out in prose",
    color: "text-fuchsia-400",
  },
  antiSlop: {
    label: "Anti Slop",
    desc: "Anti Slop plugin: injects the antislop rules so the model avoids generic AI UI, copy and code",
    color: "text-teal-400",
  },
};
