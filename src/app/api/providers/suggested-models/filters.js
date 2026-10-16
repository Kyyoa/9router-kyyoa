import opencodeRegistry from "open-sse/providers/registry/opencode.js";
import { normalizeNousFreeModels } from "open-sse/services/nous.js";

// Free OpenCode models that don't use the "-free" id suffix. big-pickle answers
// 200 on the free tier (verified 2026-10-15); union-alpha is a curated free id
// in the provider registry ("Union Alpha Free").
const KNOWN_FREE_OPENCODE_MODELS = ["big-pickle", "union-alpha"];

// Upstream returns "Model is unavailable" for this id (2026-09-02) - re-enable when fixed
const DEAD_FREE_OPENCODE_MODELS = new Set(["deepseek-v4-flash-free"]);

// tolerant id reader: falls back to `name` when upstream changes its schema
function opencodeModelId(m) {
  const raw = typeof m?.id === "string" && m.id ? m.id : (typeof m?.name === "string" ? m.name : "");
  return raw.trim();
}

// A free OpenCode model carries a free suffix (any reasonable separator) or is
// explicitly known; dead ids are always dropped.
// Exported: the panel groups its chips with the same rule the filter used, so
// a model cannot be shown under one heading and counted under the other.
export function isFreeOpencodeModel(m) {
  const id = opencodeModelId(m);
  if (!id || DEAD_FREE_OPENCODE_MODELS.has(id)) return false;
  const lower = id.toLowerCase();
  return (
    lower.endsWith("-free") ||
    lower.endsWith(":free") ||
    lower.endsWith(" free") ||
    KNOWN_FREE_OPENCODE_MODELS.includes(id) ||
    KNOWN_FREE_OPENCODE_MODELS.some((known) => known.toLowerCase() === lower)
  );
}

// Built-in fallback suggestions per filter type, used when the live upstream
// catalogue is unreachable. Single-sourced from the provider registry.
export const FALLBACK_SUGGESTIONS = {
  "opencode-free": (opencodeRegistry.models || [])
    .filter((m) => typeof m?.id === "string" && m.id)
    .map((m) => ({ id: m.id, name: m.name || m.id, isFree: isFreeOpencodeModel(m) }))
    .sort((a, b) => Number(b.isFree) - Number(a.isFree) || a.id.localeCompare(b.id)),
};

/**
 * The free subset of a catalogue produced by FILTERS. Payers of a free-tier
 * provider that list the whole catalogue need this: the paid ids are real
 * upstream but they answer 401 without a key, so advertising them as free-tier
 * options only produces failures.
 * @param {Array<{ isFree?: boolean }>} list
 * @returns {Array<{ isFree?: boolean }>}
 */
export const onlyFree = (list) => (Array.isArray(list) ? list.filter((m) => m?.isFree === true) : []);

export const FILTERS = {
  "openrouter-free": (models) =>
    models
      .filter(
        (m) =>
          m.pricing?.prompt === "0" &&
          m.pricing?.completion === "0" &&
          m.context_length >= 200000
      )
      .map((m) => ({ id: m.id, name: m.name, contextLength: m.context_length }))
      .sort((a, b) => b.contextLength - a.contextLength),

  // Whole catalogue, not just the free tier: the provider panel shows every id
  // and separates the groups itself. `isFree` rides along so that grouping is
  // decided by the same rule the free-only consumers below rely on.
  "opencode-free": (models) =>
    (Array.isArray(models) ? models : [])
      .map((m) => ({ id: opencodeModelId(m), name: opencodeModelId(m) }))
      .filter((m) => m.id)
      .map((m) => ({ ...m, isFree: isFreeOpencodeModel(m) }))
      .sort((a, b) => Number(b.isFree) - Number(a.isFree) || a.id.localeCompare(b.id)),

  // Generic OpenAI-compatible catalogue ({ data: [{ id, ... }] }) - accept any
  // string id so unknown-type fetchers fail open instead of 400ing.
  "openai": (models) =>
    (Array.isArray(models) ? models : [])
      .filter((m) => typeof m?.id === "string" && m.id.trim() !== "")
      .map((m) => ({ id: m.id, name: m.name || m.id })),

  // Go subscription catalogue - every /models id is selectable; the endpoint lane
  // per model is resolved by the family regex (see open-sse/providers/models/helpers.js)
  "opencode-go": (models) =>
    (Array.isArray(models) ? models : [])
      .filter((m) => typeof m?.id === "string")
      .map((m) => ({ id: m.id, name: m.id })),

  // models.dev returns a large catalog; keep only mimo models
  mimocode: (models) =>
    (Array.isArray(models) ? models : [])
      .filter((m) => m.id?.startsWith("mimo") || m.name?.toLowerCase().includes("mimo"))
      .map((m) => ({ id: m.id, name: m.name || m.id })),

  // MiniMax Code (mcode) live catalog: {providers:[{providerId:"minimax",
  // config:{models:{<id>:{name, limit, modalities, thinking_config}}}}]} —
  // arrives wrapped in a single-element array (see route normalization).
  "minimax-code": (raw) => {
    const env = Array.isArray(raw) ? raw[0] : raw;
    const p = (Array.isArray(env?.providers) ? env.providers : []).find((x) => x?.providerId === "minimax");
    const ms = p?.config?.models;
    if (!ms || typeof ms !== "object") return [];
    return Object.entries(ms)
      .filter(([id, m]) => typeof id === "string" && id.trim() !== "" && m && typeof m === "object")
      .map(([id, m]) => ({ id, name: m?.name || id, contextLength: Number(m?.limit?.context) || undefined }))
      .sort((a, b) => (b.contextLength || 0) - (a.contextLength || 0));
  },

  "airforce-free": (models) =>
    (Array.isArray(models) ? models : [])
      .filter((m) => (m.tier === "free" || m.id?.endsWith(":free")) && m.supports_chat === true && (!m.media_type || m.media_type === "chat" || m.media_type === "text"))
      .map((m) => ({ id: m.id, name: m.name || m.id, contextLength: m.context_length }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id))),

  "nous-free": normalizeNousFreeModels,
};

// ---------------------------------------------------------------------------
// Server-side live catalog
// ---------------------------------------------------------------------------
// The registry keeps a curated fallback, but a free tier's catalogue changes
// weekly. Clients that read /v1/models or the model picker only see the static
// registry table, so they would stay frozen on whatever the build captured.
// Reusing the same filters keeps one source of truth for "what counts as a
// free model". Results are cached per fetcher for 10 minutes so a hot endpoint
// is not re-hit on every request.

import { fetch as undiciFetch } from "undici";

const LIVE_CACHE_TTL_MS = 10 * 60 * 1000;
const LIVE_TIMEOUT_MS = 15000;
const liveCache = new Map(); // `${url}\0${type}` -> { data, expiresAt }

/**
 * Fetch and filter a provider's live model list.
 * Returns the curated fallback when upstream fails or returns nothing usable,
 * so the catalogue never shrinks below what the registry promises.
 * @param {{ url?: string, type?: string }} fetcher
 * @returns {Promise<Array<{ id: string, name: string }>>}
 */
// Hard ceiling for the whole lookup: the fetch above carries its own abort
// signal, but anything else in the chain (a stalled event loop, a promise
// that never settles) must not hold the route open forever. Late results are
// discarded instead of cached, so the next request retries clean.
const SERVER_CEILING_MS = LIVE_TIMEOUT_MS + 5000;

export async function fetchSuggestedModelsServer(fetcher) {
  if (!fetcher?.url || !fetcher?.type) return [];
  const filter = FILTERS[fetcher.type];
  if (!filter) return [];

  const key = `${fetcher.url}\0${fetcher.type}`;
  const hit = liveCache.get(key);
  if (hit && Date.now() < hit.expiresAt) return hit.data;

  const fallback = FALLBACK_SUGGESTIONS[fetcher.type] ?? [];
  const lookup = (async () => {
    let data = [];
    try {
      const res = await undiciFetch(fetcher.url, { signal: AbortSignal.timeout(LIVE_TIMEOUT_MS) });
      if (res.ok) {
        const json = await res.json();
        const raw = json?.data ?? json?.models ?? json;
        data = filter(Array.isArray(raw) ? raw : []);
      }
    } catch {
      // Offline, timed out, or malformed - the fallback below keeps the list useful.
    }
    if (data.length === 0) data = fallback;
    liveCache.set(key, { data, expiresAt: Date.now() + LIVE_CACHE_TTL_MS });
    return data;
  })();

  let timer;
  const ceiling = new Promise((resolve) => {
    timer = setTimeout(() => resolve(fallback), SERVER_CEILING_MS);
    if (typeof timer.unref === "function") timer.unref();
  });
  try {
    return await Promise.race([lookup, ceiling]);
  } finally {
    clearTimeout(timer);
  }
}
