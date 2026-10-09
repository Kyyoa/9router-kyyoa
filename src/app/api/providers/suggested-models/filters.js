import opencodeRegistry from "open-sse/providers/registry/opencode.js";

// Free OpenCode models that don't use the "-free" id suffix
const KNOWN_FREE_OPENCODE_MODELS = ["big-pickle"];

// Upstream returns "Model is unavailable" for this id (2026-09-02) — re-enable when fixed
const DEAD_FREE_OPENCODE_MODELS = new Set(["deepseek-v4-flash-free"]);

// tolerant id reader: falls back to `name` when upstream changes its schema
function opencodeModelId(m) {
  const raw = typeof m?.id === "string" && m.id ? m.id : (typeof m?.name === "string" ? m.name : "");
  return raw.trim();
}

// A free OpenCode model carries a free suffix (any reasonable separator) or is
// explicitly known; dead ids are always dropped.
function isFreeOpencodeModel(m) {
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
    .map((m) => ({ id: m.id, name: m.name || m.id })),
};

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

  "opencode-free": (models) =>
    (Array.isArray(models) ? models : [])
      .filter(isFreeOpencodeModel)
      .map((m) => ({ id: opencodeModelId(m), name: opencodeModelId(m) })),

  // Generic OpenAI-compatible catalogue ({ data: [{ id, ... }] }) - accept any
  // string id so unknown-type fetchers fail open instead of 400ing.
  "openai": (models) =>
    (Array.isArray(models) ? models : [])
      .filter((m) => typeof m?.id === "string" && m.id.trim() !== "")
      .map((m) => ({ id: m.id, name: m.name || m.id })),

  // Go subscription catalogue — every /models id is selectable; the endpoint lane
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

  "airforce-free": (models) =>
    (Array.isArray(models) ? models : [])
      .filter((m) => (m.tier === "free" || m.id?.endsWith(":free")) && m.supports_chat === true && (!m.media_type || m.media_type === "chat" || m.media_type === "text"))
      .map((m) => ({ id: m.id, name: m.name || m.id, contextLength: m.context_length }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id))),
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
export async function fetchSuggestedModelsServer(fetcher) {
  if (!fetcher?.url || !fetcher?.type) return [];
  const filter = FILTERS[fetcher.type];
  if (!filter) return [];

  const key = `${fetcher.url}\0${fetcher.type}`;
  const hit = liveCache.get(key);
  if (hit && Date.now() < hit.expiresAt) return hit.data;

  const fallback = FALLBACK_SUGGESTIONS[fetcher.type] ?? [];
  let data = [];
  try {
    const res = await fetch(fetcher.url, { signal: AbortSignal.timeout(LIVE_TIMEOUT_MS) });
    if (res.ok) {
      const json = await res.json();
      const raw = json?.data ?? json?.models ?? json;
      data = filter(Array.isArray(raw) ? raw : []);
    }
  } catch {
    // Offline, timed out, or malformed — the fallback below keeps the list useful.
  }
  if (data.length === 0) data = fallback;

  liveCache.set(key, { data, expiresAt: Date.now() + LIVE_CACHE_TTL_MS });
  return data;
}
