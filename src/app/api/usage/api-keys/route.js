import { NextResponse } from "next/server";
import { getApiKeys } from "@/lib/localDb";
import { getAdapter } from "@/lib/db/driver.js";

export const dynamic = "force-dynamic";

const HOUR_MS = 3600000;
const DAY_MS = 24 * HOUR_MS;

// How far each reset interval reaches, in ms. "never" stays open-ended.
function intervalMs(resetInterval) {
  switch (resetInterval) {
    case "5h": return 5 * HOUR_MS;
    case "10h": return 10 * HOUR_MS;
    case "24h":
    case "1d": return DAY_MS;
    case "7d": return 7 * DAY_MS;
    case "14d": return 14 * DAY_MS;
    case "30d": return 30 * DAY_MS;
    default: return 0;
  }
}

// When the running quota window rolls over, based on the anchor lastResetAt.
function nextResetAt(resetInterval, lastResetAt) {
  const span = intervalMs(resetInterval);
  if (!span) return null;
  const anchor = lastResetAt ? new Date(lastResetAt).getTime() : 0;
  if (!anchor) return null;
  const now = Date.now();
  let due = anchor + span;
  while (due <= now) due += span;
  return new Date(due).toISOString();
}

function maskKey(key) {
  if (!key || typeof key !== "string") return "";
  return key.length <= 10 ? key.slice(0, 4) + "***" : key.slice(0, 10) + "***";
}

// GET /api/usage/api-keys — one row per generated API key: quota state plus
// request/token/cost aggregates and per-model breakdown from usageHistory.
export async function GET() {
  try {
    const [keys, db] = await Promise.all([getApiKeys(), getAdapter()]);
    const now = Date.now();

    const totalsByRaw = db.all(
      `SELECT apiKey, COUNT(*) AS requests,
              COALESCE(SUM(promptTokens), 0) AS promptTokens,
              COALESCE(SUM(completionTokens), 0) AS completionTokens,
              COALESCE(SUM(cost), 0) AS cost,
              MAX(timestamp) AS lastUsed
         FROM usageHistory GROUP BY apiKey`
    );
    const totals = {};
    for (const r of totalsByRaw) totals[r.apiKey || ""] = r;

    const modelsByRaw = db.all(
      `SELECT apiKey, model, COUNT(*) AS requests,
              COALESCE(SUM(promptTokens + completionTokens), 0) AS tokens,
              COALESCE(SUM(cost), 0) AS cost,
              MAX(timestamp) AS lastUsed
         FROM usageHistory GROUP BY apiKey, model
        ORDER BY requests DESC`
    );
    const modelsByKey = {};
    for (const r of modelsByRaw) {
      const k = r.apiKey || "";
      (modelsByKey[k] ??= []).push({
        model: r.model || "unknown",
        requests: r.requests,
        tokens: r.tokens,
        cost: r.cost,
        lastUsed: r.lastUsed,
      });
    }

    const statusByRaw = db.all(
      `SELECT apiKey, status, COUNT(*) AS count FROM usageHistory GROUP BY apiKey, status`
    );
    const errorsByKey = {};
    for (const r of statusByRaw) {
      const k = r.apiKey || "";
      const row = (errorsByKey[k] ??= { errors: 0, ok: 0 });
      const s = String(r.status || "ok").toLowerCase();
      if (s === "ok" || s === "success") row.ok += r.count;
      else row.errors += r.count;
    }

    const result = keys.map((k) => {
      const t = totals[k.key] || {};
      const promptTokens = t.promptTokens || 0;
      const completionTokens = t.completionTokens || 0;
      const st = errorsByKey[k.key] || { ok: 0, errors: 0 };
      const limit = k.tokenLimit || 0;
      const used = k.usedTokens || 0;
      const resetSpan = intervalMs(k.resetInterval);
      return {
        id: k.id,
        name: k.name,
        keyMasked: maskKey(k.key),
        isActive: k.isActive,
        createdAt: k.createdAt,
        expiresAt: k.expiresAt,
        expired: Boolean(k.expiresAt && new Date(k.expiresAt).getTime() < now),
        tokenLimit: limit,
        usedTokens: used,
        usagePercent: limit > 0 ? Math.min(100, (used / limit) * 100) : null,
        resetInterval: k.resetInterval || "never",
        nextResetAt: nextResetAt(k.resetInterval, k.lastResetAt),
        rpmLimit: k.rpmLimit || 0,
        tpmLimit: k.tpmLimit || 0,
        requests: t.requests || 0,
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        cost: t.cost || 0,
        lastUsed: t.lastUsed || null,
        okRequests: st.ok,
        errorRequests: st.errors,
        errorRate: st.ok + st.errors > 0 ? st.errors / (st.ok + st.errors) : 0,
        models: (modelsByKey[k.key] || []).slice(0, 8),
      };
    });

    // Keys that appear in usageHistory but were deleted from apiKeys still have
    // history worth showing; group it under one "deleted keys" row.
    const known = new Set(keys.map((k) => k.key));
    const orphan = Object.keys(totals).filter((raw) => raw && !known.has(raw));
    if (orphan.length > 0) {
      let requests = 0, promptTokens = 0, completionTokens = 0, cost = 0, lastUsed = null;
      let ok = 0, errors = 0;
      const modelsMap = new Map();
      for (const raw of orphan) {
        const t = totals[raw];
        requests += t.requests || 0;
        promptTokens += t.promptTokens || 0;
        completionTokens += t.completionTokens || 0;
        cost += t.cost || 0;
        if (t.lastUsed && (!lastUsed || t.lastUsed > lastUsed)) lastUsed = t.lastUsed;
        const st = errorsByKey[raw] || { ok: 0, errors: 0 };
        ok += st.ok;
        errors += st.errors;
        for (const m of modelsByKey[raw] || []) {
          const prev = modelsMap.get(m.model) || { model: m.model, requests: 0, tokens: 0, cost: 0, lastUsed: null };
          prev.requests += m.requests;
          prev.tokens += m.tokens;
          prev.cost += m.cost;
          if (!prev.lastUsed || m.lastUsed > prev.lastUsed) prev.lastUsed = m.lastUsed;
          modelsMap.set(m.model, prev);
        }
      }
      result.push({
        id: "deleted",
        name: "Deleted keys",
        keyMasked: "",
        isActive: false,
        createdAt: null,
        expiresAt: null,
        expired: false,
        tokenLimit: 0,
        usedTokens: promptTokens + completionTokens,
        usagePercent: null,
        resetInterval: "never",
        nextResetAt: null,
        rpmLimit: 0,
        tpmLimit: 0,
        requests,
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        cost,
        lastUsed,
        okRequests: ok,
        errorRequests: errors,
        errorRate: ok + errors > 0 ? errors / (ok + errors) : 0,
        models: [...modelsMap.values()].sort((a, b) => b.requests - a.requests).slice(0, 8),
      });
    }

    result.sort((a, b) => (b.lastUsed || "").localeCompare(a.lastUsed || "") || a.name.localeCompare(b.name));

    return NextResponse.json({ keys: result, generatedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.log("Error aggregating per-key usage:", error);
    return NextResponse.json({ error: error?.message || "Failed to load per-key usage" }, { status: 500 });
  }
}
