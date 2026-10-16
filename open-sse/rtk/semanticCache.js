/**
 * Semantic / Exact Prompt Caching Helper for 9Router
 * Caches and returns responses for exact duplicate non-streaming prompt requests.
 */

import crypto from "crypto";

const responseCache = new Map();

// TTL is configurable because a three hour window is wrong for some workloads:
// a long agent session needs a long window, while a shared proxy on a fast
// rotating IP wants a short one so answers never go stale.
let cacheTtlMs = 3 * 60 * 60 * 1000; // 3 hours, the historical default
let maxEntries = 1000; // historical hard cap

export function setSemanticCacheMaxEntries(n) {
  const v = Math.floor(Number(n));
  if (Number.isFinite(v) && v >= 10) maxEntries = Math.min(v, 10000);
}

export function getSemanticCacheMaxEntries() {
  return maxEntries;
}


export function setSemanticCacheTtlMs(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return;
  cacheTtlMs = Math.min(Math.max(n, 60 * 1000), 30 * 24 * 60 * 60 * 1000);
}

export function getSemanticCacheTtlMs() {
  return cacheTtlMs;
}

// Counters make the saving visible. Without them the toggle is unfalsifiable:
// the user cannot tell a working cache from one that never hits.
const stats = { hits: 0, misses: 0, saves: 0, evictions: 0 };

export function getSemanticCacheStats() {
  return { ...stats, entries: responseCache.size, ttlMs: cacheTtlMs };
}

export function resetSemanticCacheStats() {
  stats.hits = 0;
  stats.misses = 0;
  stats.saves = 0;
  stats.evictions = 0;
}

function hashObject(obj) {
  try {
    return crypto.createHash("sha256").update(JSON.stringify(obj)).digest("hex");
  } catch {
    return null;
  }
}

export function checkSemanticCache(body, model) {
  if (!body || body.stream) return null; // We only cache complete non-streaming responses
  
  // Exclude tool_choice forced calls or payloads that lack clear stable input
  if (body.tool_choice && body.tool_choice !== "auto") return null;

  const keyData = {
    model,
    messages: body.messages || body.input || body.contents || [],
    system: body.system,
    tools: body.tools,
  };

  const hashKey = hashObject(keyData);
  if (!hashKey) return null;

  const cached = responseCache.get(hashKey);
  if (cached && Date.now() < cached.expiresAt) {
    stats.hits++;
    return cached.response;
  }

  // Cleanup expired entries when reading
  if (cached) {
    responseCache.delete(hashKey);
    stats.evictions++;
  }
  stats.misses++;
  return null;
}

export function saveToSemanticCache(body, model, responseBody) {
  if (!body || body.stream || !responseBody) return;
  if (body.tool_choice && body.tool_choice !== "auto") return;

  // Ensure response was successful (no errors)
  if (responseBody.error || responseBody.is_error) return;

  const keyData = {
    model,
    messages: body.messages || body.input || body.contents || [],
    system: body.system,
    tools: body.tools,
  };

  const hashKey = hashObject(keyData);
  if (!hashKey) return;

  responseCache.set(hashKey, {
    response: responseBody,
    expiresAt: Date.now() + cacheTtlMs,
  });
  stats.saves++;

  // Basic cleanup to prevent unlimited memory growth (cap at 1000 entries)
  if (responseCache.size > maxEntries) {
    const oldestKey = responseCache.keys().next().value;
    responseCache.delete(oldestKey);
    stats.evictions++;
  }
}
