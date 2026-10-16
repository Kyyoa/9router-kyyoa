/**
 * Daily token-saver recorder for the Token Saver analytics tab.
 *
 * Each token-saver stage knows what it removed, but none of it is remembered:
 * pruning rewrites messages in place, RTK stats are transient, a semantic-cache
 * hit replays a response and forgets the replay saved anything. This module
 * folds one request's savings into a per-day kv bucket so the Usage tab can
 * show what Token Saver actually avoided - in tokens the provider would have
 * billed and in dollars at live model rates.
 *
 * The db handle is injected by the caller (chatCore passes getAdapter(), tests
 * pass a fake): the request path and the unit tests must not depend on the
 * bundler's "@/lib" alias resolving. Buckets are capped at 90 days.
 *
 * Savings are tokens, not messages: providers bill per token, so one 8k tool
 * dump pruned away matters more than forty short turns. Each figure comes from
 * the strings the stage actually touched - never from post-mutation bodies,
 * where the removed text no longer exists.
 */

import { estimateMessageTokens } from "../translator/concerns/contextSqueezer.js";
import { getPricingForModel } from "../providers/pricing.js";

const SCOPE = "tokenSaverStats";
const MAX_DAYS = 90;
/** A single request claiming more than this is a bug, not a saving. */
const MAX_TOKENS_PER_STAGE = 5_000_000;

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function clamp(n) {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.floor(n), MAX_TOKENS_PER_STAGE);
}

function toTokens(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return 0;
  return clamp(bytes / 4);
}

/**
 * Tokens pruning is about to drop. Call BEFORE pruneContextMessages rewrites
 * the body: after that the removed turns are gone and unmeasurable.
 */
export function measurePruningSavings(body, keep) {
  if (!body || typeof body !== "object") return 0;
  const limit = Math.max(4, Number(keep) || 20);
  const list = Array.isArray(body.messages)
    ? body.messages
    : Array.isArray(body.input)
      ? body.input
      : Array.isArray(body.contents)
        ? body.contents
        : null;
  if (!list) return 0;
  const nonSystem = list.filter((m) => m && m.role !== "system");
  if (nonSystem.length <= limit) return 0;
  const dropped = nonSystem.slice(0, nonSystem.length - limit);
  let tokens = 0;
  for (const msg of dropped) {
    tokens += estimateMessageTokens(msg);
    if (tokens >= MAX_TOKENS_PER_STAGE) return MAX_TOKENS_PER_STAGE;
  }
  return tokens;
}

/**
 * Tokens RTK removed from tool output. RTK stats carry bytes (`hit.saved`),
 * converted with the shared /4 rule.
 */
export function measureRtkSavings(stats) {
  if (!stats || !Array.isArray(stats.hits) || stats.hits.length === 0) return 0;
  let tokens = 0;
  for (const hit of stats.hits) {
    tokens += toTokens(Number(hit?.saved));
  }
  return clamp(tokens);
}

/**
 * Tokens a semantic-cache hit avoided. The replayed payload carries the
 * provider's own billed usage - the honest baseline for what a second
 * identical request would have cost.
 */
export function measureCacheSavings(cachedResponse) {
  if (!cachedResponse || typeof cachedResponse !== "object") return 0;
  const usage = cachedResponse.usage;
  if (!usage || typeof usage !== "object") return 0;
  const direct = Number(usage.total_tokens);
  if (Number.isFinite(direct) && direct > 0) return clamp(direct);
  const sum =
    Number(usage.prompt_tokens ?? usage.input_tokens ?? 0) +
    Number(usage.completion_tokens ?? usage.output_tokens ?? 0);
  return clamp(sum);
}

/** Cost the removed tokens would have carried, at this model's live rate. */
export function priceSavedTokens(provider, model, tokens) {
  if (!tokens) return 0;
  let rate = null;
  try {
    rate = getPricingForModel(provider, model);
  } catch {
    return 0;
  }
  if (!rate || typeof rate !== "object") return 0;
  // Saved tokens are all prompt-side: output was never generated.
  const per1m = Number(rate.input ?? rate.prompt ?? 0);
  if (!Number.isFinite(per1m) || per1m < 0) return 0;
  return (tokens / 1_000_000) * per1m;
}

function emptyBucket(key) {
  return { date: key, requests: 0, savedTokens: 0, savedCost: 0, byModel: {} };
}

/**
 * Fold one request into today's bucket. Fire-and-forget: analytics must never
 * break the chat request that produced the numbers.
 *
 * @param dbPromise Promise resolving to the db adapter (get() / all() / run()).
 */
export function recordTokenSavings(dbPromise, { provider, model, pruning = 0, rtk = 0, cache = 0 }) {
  const stages = { pruning: clamp(pruning), rtk: clamp(rtk), cache: clamp(cache) };
  const tokens = stages.pruning + stages.rtk + stages.cache;
  if (tokens <= 0) return Promise.resolve(null);

  const modelKey = model ? `${provider || "?"}/${model}` : `${provider || "unknown"}`;
  const cost = priceSavedTokens(provider, model, tokens);
  const key = dayKey();

  return Promise.resolve(dbPromise)
    .then((db) => {
      let bucket = emptyBucket(key);
      const row = db.get(`SELECT value FROM kv WHERE scope = ? AND key = ?`, [SCOPE, key]);
      if (row) {
        try {
          const parsed = JSON.parse(row.value);
          if (parsed && typeof parsed === "object") bucket = { ...bucket, ...parsed };
        } catch {
          /* keep the fresh bucket rather than losing the day */
        }
      }
      if (!bucket.byModel || typeof bucket.byModel !== "object") bucket.byModel = {};

      bucket.requests += 1;
      bucket.savedTokens += tokens;
      bucket.savedCost += cost;
      const slot = bucket.byModel[modelKey] || { requests: 0, savedTokens: 0, savedCost: 0 };
      slot.requests += 1;
      slot.savedTokens += tokens;
      slot.savedCost += cost;
      bucket.byModel[modelKey] = slot;

      db.run(
        `INSERT INTO kv(scope, key, value) VALUES(?, ?, ?)
         ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value`,
        [SCOPE, key, JSON.stringify(bucket)],
      );

      // Keep the window bounded: key-ordered rows, oldest dropped first.
      const rows = db.all(`SELECT key FROM kv WHERE scope = ? ORDER BY key`, [SCOPE]);
      const overflow = rows.length - MAX_DAYS;
      for (let i = 0; i < overflow; i += 1) {
        db.run(`DELETE FROM kv WHERE scope = ? AND key = ?`, [SCOPE, rows[i].key]);
      }

      return { date: key, model: modelKey, savedTokens: tokens, savedCost: cost };
    })
    .catch(() => null);
}

/** Period report for the Usage tab: totals, per-model rows, daily series. */
export async function getTokenSavingsReport(dbPromise, period = "30d") {
  const db = await dbPromise;
  const rows = db.all(`SELECT key, value FROM kv WHERE scope = ? ORDER BY key`, [SCOPE]);
  const since = periodStart(period);

  const totals = { requests: 0, savedTokens: 0, savedCost: 0 };
  const byModel = {};
  const daily = [];

  for (const row of rows) {
    if (row.key < since) continue;
    let bucket = null;
    try {
      bucket = JSON.parse(row.value);
    } catch {
      continue;
    }
    if (!bucket || typeof bucket !== "object") continue;
    totals.requests += Number(bucket.requests) || 0;
    totals.savedTokens += Number(bucket.savedTokens) || 0;
    totals.savedCost += Number(bucket.savedCost) || 0;
    for (const [name, slot] of Object.entries(bucket.byModel || {})) {
      const agg = byModel[name] || { model: name, requests: 0, savedTokens: 0, savedCost: 0 };
      agg.requests += Number(slot.requests) || 0;
      agg.savedTokens += Number(slot.savedTokens) || 0;
      agg.savedCost += Number(slot.savedCost) || 0;
      byModel[name] = agg;
    }
    daily.push({
      date: row.key,
      requests: Number(bucket.requests) || 0,
      savedTokens: Number(bucket.savedTokens) || 0,
      savedCost: Number(bucket.savedCost) || 0,
    });
  }

  return {
    period,
    estimated: true,
    totals,
    models: Object.values(byModel).sort((a, b) => b.savedTokens - a.savedTokens),
    daily,
  };
}

function periodStart(period) {
  const days = { today: 1, "24h": 1, "7d": 7, "30d": 30, "60d": 60, all: MAX_DAYS }[period];
  const n = Number(days) || 30;
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - (n - 1));
  return d.toISOString().slice(0, 10);
}
