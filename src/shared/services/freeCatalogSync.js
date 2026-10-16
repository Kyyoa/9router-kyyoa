/**
 * Background sync for free no-auth provider catalogues.
 *
 * The provider page fetches the public model list live when it opens, so any
 * single failed refresh left the suggested row empty. Syncing the list into
 * sqlite on a timer gives every consumer a durable baseline: the route serves
 * the stored list under a stale flag while a refresh is in flight or failing.
 *
 * Only providers whose catalogue is truly public participate (noAuth +
 * modelsFetcher). Authenticated per-account lists are never synced here.
 */

import { makeKv } from "@/lib/db/helpers/kvStore.js";
import { FILTERS, onlyFree } from "@/app/api/providers/suggested-models/filters.js";
import REGISTRY from "open-sse/providers/registry/index.js";

const kv = makeKv("freeCatalogSync");

const SYNC_INTERVAL_MS = 30 * 60 * 1000;
const SYNC_TIMEOUT_MS = 15000;
const SYNC_JITTER_MS = 60 * 1000;

let timer = null;
let running = false;

/** Providers whose catalogue is public: noAuth, visible, and fetchable. */
export function syncableFreeProviders() {
  return (REGISTRY || []).filter(
    (r) => r?.noAuth && !r?.hidden && r?.modelsFetcher?.url && FILTERS[r.modelsFetcher.type],
  );
}

export async function syncOneFreeCatalog(entry) {
  const { url, type } = entry.modelsFetcher;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(SYNC_TIMEOUT_MS),
    headers: type === "opencode-free" ? { "x-opencode-client": "desktop" } : undefined,
  });
  if (!res.ok) throw new Error(`upstream ${res.status}`);
  const json = await res.json();
  const raw = json?.data ?? json?.models ?? json;
  const data = onlyFree(FILTERS[type](Array.isArray(raw) ? raw : []));
  if (!data.length) throw new Error("upstream returned no usable models");
  await kv.set(entry.id, { data, syncedAt: Date.now(), url });
  return data.length;
}

export async function syncAllFreeCatalogs() {
  const out = {};
  for (const entry of syncableFreeProviders()) {
    try {
      out[entry.id] = { ok: true, models: await syncOneFreeCatalog(entry) };
    } catch (e) {
      out[entry.id] = { ok: false, error: String((e && e.message) || e).slice(0, 120) };
    }
  }
  return out;
}

export async function getSyncedFreeCatalog(providerId) {
  if (!providerId) return null;
  const row = await kv.get(providerId, null).catch(() => null);
  if (!row || !Array.isArray(row.data) || row.data.length === 0) return null;
  return row;
}

export function startFreeCatalogSync() {
  if (timer) return;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await syncAllFreeCatalogs();
    } catch {
      // One failed cycle never kills the timer; the next interval retries.
    } finally {
      running = false;
    }
  };
  // First pass shortly after boot (with jitter so restarts do not thunder),
  // then every half hour.
  setTimeout(run, Math.floor(Math.random() * SYNC_JITTER_MS));
  timer = setInterval(run, SYNC_INTERVAL_MS);
  const stop = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

export const __test__ = { syncableFreeProviders, SYNC_INTERVAL_MS };
