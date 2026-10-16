// Fetch and cache suggested models for providers that expose a public models API
// Fetches via backend proxy to avoid CORS issues

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const STALE_TTL_MS = 24 * 60 * 60 * 1000; // a day of last-good coverage
const REQUEST_TIMEOUT_MS = 12000;
const cache = new Map(); // key: fetcher.url → { data, expiresAt }
const staleCache = new Map(); // key: fetcher.url → last-good { data, at } (survives failed refreshes)

/**
 * Fetch suggested models for a provider using its modelsFetcher config.
 * Fresh results are cached for CACHE_TTL_MS. When a refresh fails mid-session,
 * the util keeps serving the last good list underneath a stale flag, so the
 * suggested row does not blink out on a single dropped upstream response.
 * @param {{ url: string, type: string }} fetcher
 * @returns {Promise<{ data: Array<{ id: string, name: string, contextLength?: number }>, error: string | null, stale?: boolean }>}
 */
export async function fetchSuggestedModels(fetcher) {
  if (!fetcher?.url || !fetcher?.type) return { data: [], error: null };

  const cached = cache.get(fetcher.url);
  if (cached && Date.now() < cached.expiresAt) return { data: cached.data, error: null };

  try {
    const params = new URLSearchParams({ url: fetcher.url, type: fetcher.type });
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    let res;
    try {
      res = await fetch(`/api/providers/suggested-models?${params}`, { signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
    const json = await res.json().catch(() => null);
    const data = Array.isArray(json?.data) ? json.data : [];
    const error =
      typeof json?.error === "string" && json.error
        ? json.error
        : res.ok
          ? null
          : "Could not load suggested models.";
    if (!error && data.length > 0) {
      cache.set(fetcher.url, { data, expiresAt: Date.now() + CACHE_TTL_MS });
      staleCache.set(fetcher.url, { data, at: Date.now() });
      return { data, error };
    }
    if (data.length > 0) {
      staleCache.set(fetcher.url, { data, at: Date.now() });
      return { data, error, stale: true };
    }
    const stale = staleCache.get(fetcher.url);
    if (stale && Array.isArray(stale.data) && stale.data.length > 0 && Date.now() - stale.at < STALE_TTL_MS) {
      return { data: stale.data, error: error || "Could not load suggested models.", stale: true };
    }
    return { data, error };
  } catch {
    const stale = staleCache.get(fetcher.url);
    if (stale && Array.isArray(stale.data) && stale.data.length > 0 && Date.now() - stale.at < STALE_TTL_MS) {
      return { data: stale.data, error: "Could not refresh - showing the last known list.", stale: true };
    }
    return { data: [], error: "Could not load suggested models." };
  }
}
