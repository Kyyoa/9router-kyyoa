/**
 * antigravityQuotaMonitor.js — proactive quota pre-check for Antigravity.
 *
 * The upstream executor commit references this module but it was never committed,
 * which broke `next build`. Implements the contract consumed by
 * open-sse/executors/antigravity.js:
 *
 *   isAntigravityQuotaDrained(accessToken, model, proxyOptions, connectionId)
 *     → { isDrained: boolean, resetTime: string | null }
 *
 * Queries `v1internal:retrieveUserQuotaSummary`, resolves the model's family
 * bucket (session 5h vs weekly), and reports drained when remaining fraction
 * drops to <= 2%. Any transient/network failure fails OPEN ({ isDrained: false })
 * so a quota-check outage never blocks live traffic.
 */

import { createHash } from "node:crypto";
import {
  ANTIGRAVITY_IDE_BASE_URL,
  ANTIGRAVITY_IDE_USER_AGENT,
  ANTIGRAVITY_IDE_VERSION,
} from "../providers/shared.js";
import { fetchWithTimeout } from "./usage/shared.js";

const QUOTA_SUMMARY_URL = `${ANTIGRAVITY_IDE_BASE_URL}/v1internal:retrieveUserQuotaSummary`;
const CACHE_TTL_MS = 60_000;
const DRAINED_THRESHOLD = 0.02; // remaining <= 2% counts as depleted

// connectionId → { result: raw fetch outcome { data, ok }, expiresAt } | { promise }
const summaryCache = new Map();

export function _clearQuotaMonitorCache() {
  summaryCache.clear();
}

/**
 * Cache key binds the connection id to the token identity: accounts without a
 * connectionId all map to the executor's "default", so without the token hash
 * one account's quota summary would be served to another for up to 60s.
 */
function cacheKey(connectionId, accessToken) {
  const tokenHash = createHash("sha256").update(String(accessToken)).digest("hex").slice(0, 12);
  return `${connectionId}::${tokenHash}`;
}

/**
 * Resolve the Antigravity family pattern for a model id.
 * Mirrors getAntigravityModelFamily() in src/sse/services/antigravityQuota.js.
 */
function familyPatternFor(model) {
  const clean = String(model || "").replace(/^ag\//, "").trim().toLowerCase();
  if (clean.startsWith("claude-") || clean.startsWith("gpt-")) return /claude|gpt/i;
  if (clean.includes("argon")) return /argon/i;
  return /gemini/i;
}

function extractGroups(data) {
  if (!data || typeof data !== "object") return null;
  return (
    (Array.isArray(data.groups) && data.groups) ||
    (Array.isArray(data.quotaSummary?.groups) && data.quotaSummary.groups) ||
    (Array.isArray(data.response?.groups) && data.response.groups) ||
    null
  );
}

function isSessionBucket(bucket) {
  const windowType = String(bucket.window || "").toLowerCase();
  const bucketText = `${bucket.bucketId || ""} ${bucket.displayName || ""}`.toLowerCase();
  return (
    windowType === "5h" ||
    bucketText.includes("five hour") ||
    bucketText.includes("5h") ||
    bucketText.includes("daily") ||
    windowType === "daily"
  );
}

function isWeeklyBucket(bucket) {
  const windowType = String(bucket.window || "").toLowerCase();
  const bucketText = `${bucket.bucketId || ""} ${bucket.displayName || ""}`.toLowerCase();
  return windowType === "weekly" || bucketText.includes("weekly");
}

/**
 * Walk group buckets for the model's family and return the most restrictive
 * remaining fraction plus its resetTime. Disabled weekly buckets are truly
 * exhausted; disabled session buckets report 0 (weekly gate).
 */
export function parseMostRestrictiveBucket(data, model) {
  const groups = extractGroups(data);
  if (!groups) return null;

  const pattern = familyPatternFor(model);
  let worst = null; // { remainingFraction, resetTime }

  for (const group of groups) {
    if (!group || typeof group !== "object") continue;
    if (!pattern.test(group.displayName || "")) continue;

    const buckets = Array.isArray(group.buckets) ? group.buckets : [];
    for (const bucket of buckets) {
      if (!bucket || typeof bucket !== "object") continue;
      const isWeekly = isWeeklyBucket(bucket);
      const isSession = isSessionBucket(bucket);
      if (!isWeekly && !isSession) continue;

      // A session bucket disabled because weekly was hit still constrains usage.
      if (bucket.disabled === true && isWeekly) continue;

      const remainingFraction = bucket.disabled === true ? 0 : Number(bucket.remainingFraction);
      if (!Number.isFinite(remainingFraction)) continue;

      if (!worst || remainingFraction < worst.remainingFraction) {
        worst = { remainingFraction, resetTime: bucket.resetTime || null };
      }
    }
  }

  return worst;
}

async function fetchQuotaSummary(accessToken, proxyOptions) {
  const response = await fetchWithTimeout(
    QUOTA_SUMMARY_URL,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": ANTIGRAVITY_IDE_USER_AGENT,
        "Content-Type": "application/json",
        "X-Client-Name": "antigravity",
        "X-Client-Version": ANTIGRAVITY_IDE_VERSION,
      },
      body: JSON.stringify({}),
    },
    10_000,
    proxyOptions
  );
  if (!response.ok) return null;
  const data = await response.json();
  return extractGroups(data) ? data : null;
}

/**
 * Compute { isDrained, resetTime } from a cached fetch outcome.
 * Returns null when the outcome carries no parsable summary (caller fails open).
 * resetTime is only surfaced when it parses to a finite date, so the executor's
 * cooldown math never receives an unparseable value.
 */
function computeDrained(outcome, model) {
  if (!outcome?.ok || !outcome.data) return null;
  const worst = parseMostRestrictiveBucket(outcome.data, model);
  if (!worst) return null;
  const resetMs = worst.resetTime ? new Date(worst.resetTime).getTime() : NaN;
  return {
    isDrained: worst.remainingFraction <= DRAINED_THRESHOLD,
    resetTime: Number.isFinite(resetMs) ? worst.resetTime : null,
  };
}

/**
 * Pre-check whether the model's family quota is drained for this connection.
 * Cached per connection (60s) with in-flight dedup; never throws.
 */
export async function isAntigravityQuotaDrained(accessToken, model, proxyOptions = null, connectionId = "default") {
  const failOpen = { isDrained: false, resetTime: null };
  if (!accessToken || !model) return failOpen;

  const key = cacheKey(connectionId, accessToken);
  const hit = summaryCache.get(key);

  if (hit?.promise) {
    try {
      const outcome = await hit.promise;
      return computeDrained(outcome, model) || failOpen;
    } catch {
      return failOpen;
    }
  }
  if (hit && hit.expiresAt > Date.now()) return computeDrained(hit.result, model) || failOpen;

  const promise = (async () => {
    try {
      const data = await fetchQuotaSummary(accessToken, proxyOptions);
      if (!data) return failOpen;

      // Only cache successful parses; unparsable shapes retry next request.
      return { data, ok: true };
    } catch {
      return failOpen;
    }
  })();

  summaryCache.set(key, { promise });

  let outcome;
  try {
    outcome = await promise;
  } catch {
    summaryCache.delete(key);
    return failOpen;
  }

  if (outcome?.ok) {
    summaryCache.set(key, { result: outcome, expiresAt: Date.now() + CACHE_TTL_MS });
  } else {
    summaryCache.delete(key);
  }

  if (!outcome?.ok) return failOpen;

  return computeDrained(outcome, model) || failOpen;
}
