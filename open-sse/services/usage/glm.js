/**
 * GLM Coding Plan usage (international + China regions)
 */

import { proxyAwareFetch } from "../../utils/proxyFetch.js";
import { U } from "./shared.js";

// GLM quota endpoints (region-aware) — url from registry transport.usage
const GLM_QUOTA_URLS = {
  international: U("glm").url,
  china: U("glm-cn").url,
};

/**
 * Parse the GLM quota API response — shared by pasted API keys and
 * OAuth-minted coding-plan keys (both hit the same monitor endpoint).
 * Supports both TOKENS_LIMIT and CREDIT_LIMIT and dynamic intervals (e.g. session 5h, weekly 7d).
 */
export function parseGlmQuotaResponse(json) {
  if (json?.success === false || (json?.code !== undefined && ![0, 200].includes(json.code))) {
    const rawMsg = json?.msg || json?.message || "No coding plan package active for this account";
    const message = rawMsg.includes("不存在coding plan")
      ? "Akun ini belum memiliki paket Coding Plan aktif di Z.ai. Silakan aktifkan paket di chat.z.ai / api.z.ai."
      : rawMsg;
    return { plan: "None", quotas: {}, message };
  }

  const data = json?.data && typeof json.data === "object" ? json.data : {};
  const limits = Array.isArray(data.limits) ? data.limits : [];
  const quotas = {};

  for (const limit of limits) {
    // 1. Accept both TOKENS_LIMIT and CREDIT_LIMIT from GLM API
    if (!limit || (limit.type !== "TOKENS_LIMIT" && limit.type !== "CREDIT_LIMIT")) continue;
    const usedPercent = Number(limit.percentage) || 0;
    const resetMs = Number(limit.nextResetTime) || 0;
    const remaining = Math.max(0, 100 - usedPercent);
    // Absolute token amounts, when Z.ai returns them (gift/top-up grants like
    // "ZCODE Weekend Build" surface totalTokens/usedTokens / total/used in tokens).
    const absUsed = Number(limit.used ?? limit.usedTokens ?? limit.usedTokensAmount) || 0;
    const absTotal = Number(limit.total ?? limit.totalTokens ?? limit.totalTokensAmount) || 0;

    // 2. Map key dynamically based on type and period (unit) to avoid overwriting
    let key = "session";
    if (limit.unit === 3) {
      key = `Session (${limit.number}h)`;
    } else if (limit.unit === 6) {
      key = "Weekly (7d)";
    } else if (limit.type === "TOKENS_LIMIT") {
      key = "Tokens";
    } else {
      key = `Limit (${limit.number})`;
    }
    // Distinct key for an absolute-token grant so it doesn't clobber the %-window row.
    if (limit.type === "TOKENS_LIMIT" && absTotal > 0 && key === "Tokens") {
      key = "Tokens (grant)";
    }

    quotas[key] = {
      used: usedPercent,
      total: 100,
      remaining,
      remainingPercentage: remaining,
      ...(absTotal > 0 || absUsed > 0 ? { usedTokens: absUsed, totalTokens: absTotal } : {}),
      resetAt: resetMs > 0 ? new Date(resetMs).toISOString() : null,
      unlimited: false,
    };
  }

  const levelRaw = typeof data.level === "string" ? data.level : "";
  const plan = levelRaw
    ? levelRaw.charAt(0).toUpperCase() + levelRaw.slice(1).toLowerCase()
    : limits.length > 0 ? "Standard" : "None";

  const message = limits.length === 0
    ? "Akun ini belum memiliki paket Coding Plan aktif di Z.ai (0 kuota)."
    : null;

  return { plan, quotas, message };
}

function glmResetError(message, status = 502) {
  return Object.assign(new Error(message), { status });
}

function isGlmResetCardId(value) {
  return Number.isSafeInteger(value) || (typeof value === "string" && value.trim().length > 0);
}

function parseGlmCardExpiry(value) {
  const match = typeof value === "string" && value.trim().match(/^(\d{4}-\d{2}-\d{2})[ T]([01]\d|2[0-3]):([0-5]\\d):([0-5]\d)(\\.\\d{1,6})?(Z|[+-](?:[01]\d|2[0-3]):?[0-5]\d)?$/);
  const day = match && new Date(`${match[1]}T00:00:00Z`);
  if (!match || !Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== match[1]) {
    throw glmResetError("Invalid GLM reset card expiry.");
  }
  // Z.ai's timezone-less reset-card expiry is Beijing time, not UTC or the host's local time.
  const time = Date.parse(`${match[1]}T${match[2]}:${match[3]}:${match[4]}${match[5] || ""}${match[6] || "+08:00"}`);
  if (!Number.isFinite(time)) throw glmResetError("Invalid GLM reset card expiry.");
  return time;
}

async function glmResetRequest(apiKey, card, proxyOptions) {
  let response;
  try {
    const bodyPayload = card ? {
      targetType: "PERSONAL",
      resetType: card.type,
      recordId: card.recordId,
      requestId: crypto.randomUUID(),
      ...(card.grantType ? { grantType: card.grantType } : {})
    } : undefined;

    response = await proxyAwareFetch(U("glm")[card ? "resetCardsUseUrl" : "resetCardsUrl"], {
      method: card ? "POST" : "GET",
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json", "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15000),
      redirect: "error",
      strictTls: true,
      ...(card ? {
        body: JSON.stringify(bodyPayload),
      } : {}),
    // Proxy fallback would replay an irreversible POST after a potentially delivered request.
    }, card ? { ...proxyOptions, strictProxy: true } : proxyOptions);
  } catch {
    throw glmResetError("GLM reset card request failed. Check the provider dashboard before trying again.");
  }
  return { response, payload: await response.json().catch(() => null) };
}

const ZCODE_PLAN_PREVIEW_URL = "https://zcode.z.ai/api/v1/zcode-plan/billing/preview";
const ZCODE_PLAN_CLAIM_URL = "https://zcode.z.ai/api/v1/zcode-plan/billing/claim";
const ZCODE_PLAN_BALANCE_URL = "https://zcode.z.ai/api/v1/zcode-plan/billing/balance";
const ZCODE_RESET_STATUS_URL = "https://zcode.z.ai/api/v1/coding-plan/reset/status";
const ZCODE_RESET_USE_URL = "https://zcode.z.ai/api/v1/coding-plan/reset/use";
const ZCODE_INCENTIVE_SUMMARY_URL = "https://zcode.z.ai/api/v1/incentive/referral/summary";
const ZCODE_INCENTIVE_BIND_CODE_URL = "https://zcode.z.ai/api/v1/incentive/referral/bind-code";
const ZCODE_MARKETING_TOUCH_URL = "https://zcode.z.ai/api/v1/marketing/touch";
const ZCODE_APP_VERSION = "3.17.1";
const ZCODE_PLATFORM = "linux-x64";
export const ZCODE_START_PLAN_ID = "zcode-v3-start-plan-0817";

/**
 * Perform the sequential 4-step handshake required to activate and provision
 * the ZCode Start Plan free tier quota (8M tokens: 3M GLM-5.3 + 5M GLM-5.3-Flash).
 */
export async function checkAndClaimZcodeStartPlan(token, deviceMid = "9ac46470-9bda-419a-baf9-924143aa6a04", proxyOptions = null) {
  if (typeof token !== "string" || !token.trim()) return null;
  const cleanToken = token.trim().replace(/^Bearer\s+/i, "");
  const headers = {
    Authorization: `Bearer ${cleanToken}`,
    "X-Device-Mid": deviceMid,
    "X-ZCode-App-Version": ZCODE_APP_VERSION,
    "User-Agent": `ZCode/${ZCODE_APP_VERSION}`,
    Accept: "application/json",
  };

  const steps = [
    `${ZCODE_MARKETING_TOUCH_URL}?seq=1`,
    ZCODE_INCENTIVE_SUMMARY_URL,
    `${ZCODE_PLAN_PREVIEW_URL}?app_version=${ZCODE_APP_VERSION}`,
    `${ZCODE_PLAN_BALANCE_URL}?app_version=${ZCODE_APP_VERSION}`,
  ];

  let balancePayload = null;
  for (const url of steps) {
    try {
      const res = await proxyAwareFetch(url, { method: "GET", headers, signal: AbortSignal.timeout(10000) }, proxyOptions);
      if (res && res.ok && url.includes("/billing/balance")) {
        balancePayload = await res.json().catch(() => null);
      }
    } catch {}
  }

  const data = balancePayload?.data || {};
  const plans = Array.isArray(data.plans) ? data.plans : [];
  const activePlan = plans.find(
    (p) => p.plan_id === ZCODE_START_PLAN_ID || p.planId === ZCODE_START_PLAN_ID || (p.name && p.name.includes("Start Plan"))
  );
  const hasStartPlan = Boolean(activePlan && activePlan.status?.toLowerCase() === "active");

  return {
    ok: hasStartPlan,
    hasStartPlan,
    planId: ZCODE_START_PLAN_ID,
    plan: activePlan || null,
    plans,
    balances: data.balances || [],
    serverTime: data.server_time,
  };
}

/**
 * Fetch active ZCode plan token balances & gift grants (e.g. 500M Weekend Build).
 * Hits GET https://zcode.z.ai/api/v1/zcode-plan/billing/balance?app_version=3.17.1
 */
export async function getGlmBalance(token, proxyOptions = null, options = {}) {
  if (typeof token !== "string" || !token.trim()) return null;
  const cleanToken = token.trim().replace(/^Bearer\s+/i, "");
  const url = new URL(ZCODE_PLAN_BALANCE_URL);
  url.searchParams.set("app_version", ZCODE_APP_VERSION);
  const deviceMid = options?.deviceMid || options?.userId || "9ac46470-9bda-419a-baf9-924143aa6a04";

  try {
    const response = await proxyAwareFetch(
      url.toString(),
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${cleanToken}`,
          Accept: "application/json",
          "X-ZCode-App-Version": ZCODE_APP_VERSION,
          "User-Agent": `ZCode/${ZCODE_APP_VERSION}`,
          "X-Device-Mid": deviceMid,
          "X-Platform": ZCODE_PLATFORM,
        },
        signal: AbortSignal.timeout(12000),
        redirect: "error",
      },
      proxyOptions,
    );
    if (!response.ok) return null;
    const payload = await response.json().catch(() => null);
    if (payload?.code !== 0 && payload?.code !== 200) return null;
    return payload?.data || null;
  } catch {
    return null;
  }
}

export async function getGlmResetCards(apiKey, proxyOptions = null, providerSpecificData = null) {
  const zcodeToken = providerSpecificData?.zcodeJwtToken || apiKey;
  if (!zcodeToken || !zcodeToken.trim()) throw glmResetError("GLM API key not available.", 401);

  const cleanZcode = zcodeToken.trim().replace(/^Bearer\s+/i, "");
  const cleanApi = (apiKey || "").trim().replace(/^Bearer\s+/i, "");

  // 1. First try ZCode native reset status endpoint
  try {
    const res = await proxyAwareFetch(
      ZCODE_RESET_STATUS_URL,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${cleanZcode}`,
          ...(cleanApi ? { "X-Bigmodel-Authorization": cleanApi } : {}),
          "Bigmodel-Target-Type": "PERSONAL",
          Accept: "application/json",
          "X-ZCode-App-Version": ZCODE_APP_VERSION,
          "X-Platform": ZCODE_PLATFORM,
        },
        signal: AbortSignal.timeout(12000),
        redirect: "error",
      },
      proxyOptions,
    );

    if (res.ok) {
      const payload = await res.json().catch(() => null);
      if (payload?.code === 0 && payload.data) {
        const cards = [];
        const fiveHour = Array.isArray(payload.data.available_five_hour_resets)
          ? payload.data.available_five_hour_resets
          : [];
        const week = Array.isArray(payload.data.available_week_resets)
          ? payload.data.available_week_resets
          : [];

        for (const item of fiveHour) {
          const expSec = Number(item.expire_at) || 0;
          const expiry = expSec * 1000;
          if (expiry <= Date.now()) continue;
          cards.push({ recordId: `FIVE_HOUR_${expSec}`, type: "FIVE_HOUR", expiresAt: new Date(expiry).toISOString() });
        }
        for (const item of week) {
          const expSec = Number(item.expire_at) || 0;
          const expiry = expSec * 1000;
          if (expiry <= Date.now()) continue;
          cards.push({ recordId: `WEEK_${expSec}`, type: "WEEK", expiresAt: new Date(expiry).toISOString() });
        }
        cards.sort((a, b) => Date.parse(a.expiresAt) - Date.parse(b.expiresAt));
        return { availableCount: cards.length, cards };
      }
    }
  } catch {}

  // 2. Fallback to MAAS customer-package-reset/list
  const { response, payload } = await glmResetRequest(apiKey || zcodeToken, null, proxyOptions);
  if (!response.ok) {
    throw glmResetError(`GLM reset card API error (${response.status}).`, response.status >= 400 && response.status < 500 ? response.status : 502);
  }
  if (payload?.success !== true || ![0, 200].includes(payload.code)) {
    throw glmResetError("GLM reset card API rejected the request.", [401, 403].includes(payload?.code) ? payload.code : 502);
  }
  if (!Array.isArray(payload.data?.fiveHourResets) || !Array.isArray(payload.data?.weekResets)) {
    throw glmResetError("Invalid GLM reset card list.");
  }
  const cards = [];
  for (const [bucket, type] of [["fiveHourResets", "FIVE_HOUR"], ["weekResets", "WEEK"]]) {
    for (const item of payload.data[bucket]) {
      if (item?.available !== true || !isGlmResetCardId(item.recordId)) continue;
      const expiry = parseGlmCardExpiry(item.expireTime);
      if (expiry <= Date.now()) continue;
      cards.push({
        recordId: item.recordId,
        type,
        ...(typeof item.grantType === "string" ? { grantType: item.grantType } : {}),
        expiresAt: new Date(expiry).toISOString()
      });
    }
  }
  cards.sort((a, b) => Date.parse(a.expiresAt) - Date.parse(b.expiresAt));
  return { availableCount: cards.length, cards };
}

export async function redeemGlmResetCard(apiKey, card, proxyOptions = null, providerSpecificData = null) {
  const failed = (status, code, uncertain, message) => ({ ok: false, alreadyUsed: false, status, code, uncertain, message });
  if (!card || !["FIVE_HOUR", "WEEK"].includes(card.type)) {
    return failed(400, "invalid_card", false, "Invalid GLM reset card.");
  }

  const zcodeToken = providerSpecificData?.zcodeJwtToken || apiKey;
  const cleanZcode = (zcodeToken || "").trim().replace(/^Bearer\s+/i, "");
  const cleanApi = (apiKey || "").trim().replace(/^Bearer\s+/i, "");

  // 1. Try ZCode native reset use endpoint
  if (cleanZcode) {
    try {
      const res = await proxyAwareFetch(
        ZCODE_RESET_USE_URL,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${cleanZcode}`,
            ...(cleanApi ? { "X-Bigmodel-Authorization": cleanApi } : {}),
            "Bigmodel-Target-Type": "PERSONAL",
            "Content-Type": "application/json",
            Accept: "application/json",
            "X-ZCode-App-Version": ZCODE_APP_VERSION,
            "X-Platform": ZCODE_PLATFORM,
          },
          body: JSON.stringify({
            idempotency_key: crypto.randomUUID(),
            reset_type: card.type,
          }),
          signal: AbortSignal.timeout(15000),
          redirect: "error",
        },
        proxyOptions,
      );
      if (res.ok) {
        const payload = await res.json().catch(() => null);
        if (payload?.code === 0) {
          return { ok: true, alreadyUsed: false, uncertain: false, status: 200, code: "SUCCESS", message: "GLM usage reset successfully." };
        }
      }
    } catch {}
  }

  // 2. Fallback to MAAS customer-package-reset/use
  try {
    const { response, payload } = await glmResetRequest(apiKey || zcodeToken, card, proxyOptions);
    if (response.ok && payload?.success === true && [0, 200].includes(payload.code)) {
      return { ok: true, alreadyUsed: false, uncertain: false, status: 200, code: "SUCCESS", message: "GLM usage reset successfully." };
    }
  } catch {}
  return failed(502, "uncertain", true, "Reset outcome is unknown. Check the Z.ai dashboard before trying again.");
}

/**
 * GLM Coding Plan usage (international + China regions)
 */
export async function getGlmUsage(apiKey, provider, proxyOptions = null, providerSpecificData = null) {
  if (!apiKey && !providerSpecificData?.zcodeJwtToken) {
    return { message: "GLM API key not available." };
  }

  const region = provider === "glm-cn" ? "china" : "international";
  const quotaUrl = GLM_QUOTA_URLS[region];
  const zcodeToken = providerSpecificData?.zcodeJwtToken || providerSpecificData?.zaiBusinessToken || apiKey;

  // Run MAAS quota limit and ZCode billing balance in parallel
  const [quotaRes, balanceData] = await Promise.all([
    quotaUrl && apiKey
      ? proxyAwareFetch(
          quotaUrl,
          {
            headers: {
              Authorization: `Bearer ${apiKey.replace(/^Bearer\s+/i, "")}`,
              Accept: "application/json",
            },
            signal: AbortSignal.timeout(15000),
          },
          proxyOptions,
        ).catch(() => null)
      : null,
    zcodeToken ? getGlmBalance(zcodeToken, proxyOptions).catch(() => null) : null,
  ]);

  let plan = "None";
  let quotas = {};
  let message = "";

  if (quotaRes && quotaRes.ok) {
    const json = await quotaRes.json().catch(() => null);
    const parsed = parseGlmQuotaResponse(json);
    plan = parsed.plan;
    quotas = parsed.quotas || {};
    message = parsed.message || "";
  } else if (quotaRes && !quotaRes.ok) {
    if (quotaRes.status === 401 && !balanceData) {
      return { message: "GLM API key invalid or expired." };
    }
    message = `GLM quota API error (${quotaRes.status}).`;
  }

  // Merge ZCode billing balance (gift cards, Weekend Build 500M tokens, Start Plan grants)
  if (balanceData) {
    if (Array.isArray(balanceData.plans) && balanceData.plans.length > 0) {
      const activePlan = balanceData.plans.find((p) => p.status?.toLowerCase() === "active");
      if (activePlan?.name) {
        plan = activePlan.name;
      }
    }
    if (Array.isArray(balanceData.balances) && balanceData.balances.length > 0) {
      for (const b of balanceData.balances) {
        const totalUnits = Number(b.total_units) || 0;
        const usedUnits = Number(b.used_units) || 0;
        const remainingUnits = Number(b.remaining_units) || Math.max(0, totalUnits - usedUnits);
        if (totalUnits <= 0 && remainingUnits <= 0) continue;

        const showName = b.show_name || b.entitlement_id || "Event Grant";
        const expiryMs = Number(b.expires_at) ? b.expires_at * 1000 : null;
        const remainingPct = totalUnits > 0 ? Math.min(100, Math.max(0, Math.round((remainingUnits / totalUnits) * 100))) : 100;
        const usedPct = 100 - remainingPct;

        const associatedPlan = (balanceData.plans || []).find((p) => p.plan_id === b.plan_id || p.user_plan_id === b.user_plan_id);
        const planName = associatedPlan?.name || "";
        const isStartPlan = !planName || /start[- ]?plan/i.test(planName);

        let quotaKey = !isStartPlan && planName ? `${showName} (${planName})` : `${showName} (grant)`;
        if (quotas[quotaKey]) {
          const totalM = Math.round(totalUnits / 1000000);
          quotaKey = `${showName} (${planName || "grant"} ${totalM > 0 ? `${totalM}M` : totalUnits})`;
        }

        quotas[quotaKey] = {
          used: usedPct,
          total: 100,
          remaining: remainingPct,
          remainingPercentage: remainingPct,
          resetAt: expiryMs ? new Date(expiryMs).toISOString() : null,
          totalTokens: totalUnits,
          usedTokens: usedUnits,
          unit: b.unit_type || "tokens",
          unlimited: false,
        };
      }
    }
  }

  let resetCards = null;
  if (provider === "glm") {
    try {
      resetCards = await getGlmResetCards(apiKey, proxyOptions, providerSpecificData);
    } catch {}
  }

  // If we have active quotas (such as gift cards, Start Plan, or MAAS limits),
  // suppress the "0 kuota / belum memiliki paket" notice so the quota card displays cleanly.
  if (Object.keys(quotas).length > 0 && message && message.includes("0 kuota")) {
    message = "";
  }

  return { plan, quotas, ...(message ? { message } : {}), resetCards };
}

/**
 * Fetch claimable gift cards / event plans for GLM / Z.ai accounts.
 * Hits GET https://zcode.z.ai/api/v1/zcode-plan/billing/preview
 */
export async function getGlmClaimablePlans(token, proxyOptions = null, options = {}) {
  if (typeof token !== "string" || !token.trim()) {
    throw glmResetError("GLM authentication token not available.", 401);
  }
  const cleanToken = token.trim().replace(/^Bearer\s+/i, "");
  const deviceMid = options?.deviceMid || options?.userId || "9ac46470-9bda-419a-baf9-924143aa6a04";
  const url = new URL(ZCODE_PLAN_PREVIEW_URL);
  url.searchParams.set("app_version", ZCODE_APP_VERSION);
  url.searchParams.set("platform", ZCODE_PLATFORM);

  const zcodeHeaders = {
    Authorization: `Bearer ${cleanToken}`,
    Accept: "application/json",
    "X-ZCode-App-Version": ZCODE_APP_VERSION,
    "X-Platform": ZCODE_PLATFORM,
    "X-Device-Mid": deviceMid,
    "X-Client-Language": "en-US",
  };

  const [previewRes, incentiveRes, touchRes] = await Promise.all([
    Promise.resolve(proxyAwareFetch(url.toString(), { method: "GET", headers: zcodeHeaders, signal: AbortSignal.timeout(12000), redirect: "error" }, proxyOptions)).catch(() => null),
    Promise.resolve(proxyAwareFetch(ZCODE_INCENTIVE_SUMMARY_URL, { method: "GET", headers: zcodeHeaders, signal: AbortSignal.timeout(12000), redirect: "error" }, proxyOptions)).catch(() => null),
    Promise.resolve(proxyAwareFetch(`${ZCODE_MARKETING_TOUCH_URL}?seq=1`, { method: "GET", headers: zcodeHeaders, signal: AbortSignal.timeout(12000), redirect: "error" }, proxyOptions)).catch(() => null),
  ]);

  const plansMap = new Map();
  let serverTime = null;

  // 1. ZCode Billing Preview plans
  if (previewRes && previewRes.ok) {
    const payload = await previewRes.json().catch(() => null);
    serverTime = payload?.data?.server_time || serverTime;
    for (const p of payload?.data?.plans || []) {
      const planId = p.plan_id || p.planId;
      if (!planId) continue;
      plansMap.set(planId, {
        planId,
        name: p.name || p.plan_id || "Event Plan",
        description: p.description || "",
        source: "billing_preview",
        claimable: true,
        priority: p.priority ?? 0,
        endsAt: p.ends_at || p.endsAt || null,
        entitlements: (p.entitlements || []).map((e) => ({
          entitlementId: e.entitlement_id || e.entitlementId || "",
          showName: e.show_name || e.showName || "",
          meter: e.meter || "",
          unitType: e.unit_type || e.unitType || "tokens",
          grantUnits: Number(e.grant_units ?? e.grantUnits) || 0,
          period: e.period || "",
          effectiveAt: e.effective_at || e.effectiveAt || null,
        })),
      });
    }
  }

  // 2. ZCode Incentive & Referral Rewards (Weekend Build, Global Build)
  if (incentiveRes && incentiveRes.ok) {
    const payload = await incentiveRes.json().catch(() => null);
    serverTime = payload?.data?.server_time || serverTime;
    const inviter = payload?.data?.inviter;
    for (const r of inviter?.rewards || []) {
      const p = r.plan;
      const planId = p?.plan_id || p?.planId || `incentive_${r.reward_type}`;
      if (plansMap.has(planId)) continue;
      const progressCurrent = Number(r.current) || 0;
      const progressTarget = Number(r.target) || 0;
      const isEligible = progressCurrent >= progressTarget && progressTarget > 0;
      plansMap.set(planId, {
        planId: p?.plan_id || p?.planId || planId,
        name: r.title || p?.name || "ZCode Reward Task",
        description: r.description || "",
        source: "incentive_reward",
        rewardType: r.reward_type,
        state: r.state || "in_progress",
        progress: { current: progressCurrent, target: progressTarget },
        claimable: isEligible || r.state === "completed",
        inviteCode: inviter?.invite_code || "",
        entitlements: (p?.entitlements || []).map((e) => ({
          showName: e.show_name || e.showName || "GLM Tokens",
          unitType: e.unit_type || "tokens",
          grantUnits: Number(e.grant_units ?? e.grantUnits) || 0,
        })),
      });
    }
  }

  // 3. Marketing Touch Popups / Banners
  if (touchRes && touchRes.ok) {
    const payload = await touchRes.json().catch(() => null);
    serverTime = payload?.data?.server_time || serverTime;
    for (const d of payload?.data?.deliveries || []) {
      const buttons = [...(d.banner?.buttons || []), ...(d.popup?.buttons || [])];
      for (const btn of buttons) {
        if (btn?.action?.type === "claim_zcode_plan" && btn.action.args?.plan_id) {
          const planId = btn.action.args.plan_id;
          if (!plansMap.has(planId)) {
            plansMap.set(planId, {
              planId,
              name: d.banner?.title || d.popup?.title || d.campaign_id || "Campaign Event Gift",
              description: d.banner?.description || d.popup?.description || "",
              source: "marketing_touch",
              claimable: true,
              entitlements: [],
            });
          }
        }
      }
    }
  }

  const plans = Array.from(plansMap.values());
  return {
    serverTime,
    plans,
    count: plans.length,
  };
}

/**
 * Claim an event plan / giftcard natively for a GLM / Z.ai account.
 * Hits POST https://zcode.z.ai/api/v1/zcode-plan/billing/claim
 */
export async function claimGlmPlan(token, planId, proxyOptions = null, captcha = null) {
  if (typeof token !== "string" || !token.trim()) {
    return { ok: false, status: 401, code: "unauthorized", message: "GLM authentication token not available." };
  }
  if (!planId || typeof planId !== "string" || !planId.trim()) {
    return { ok: false, status: 400, code: "invalid_plan_id", message: "Plan ID is required." };
  }

  const cleanToken = token.trim().replace(/^Bearer\s+/i, "");
  const deviceMid = captcha?.deviceMid || "9ac46470-9bda-419a-baf9-924143aa6a04";

  // Auto-Resolution: Handle ZCode Start Plan Free Tier Quota Activation via Handshake
  if (
    planId === ZCODE_START_PLAN_ID ||
    planId.toLowerCase() === "start" ||
    planId.toLowerCase() === "start-plan" ||
    planId.toLowerCase() === "auto"
  ) {
    const handshakeResult = await checkAndClaimZcodeStartPlan(token, deviceMid, proxyOptions);
    if (handshakeResult?.hasStartPlan) {
      return {
        ok: true,
        status: 200,
        code: "SUCCESS",
        plan: handshakeResult.plan || { plan_id: ZCODE_START_PLAN_ID, name: "ZCode Start Plan" },
        message: "ZCode Start Plan free tier quota activated via handshake.",
      };
    }
    return {
      ok: false,
      status: 400,
      code: "start_plan_not_active",
      message: "ZCode Start Plan not active for this account after handshake.",
      data: handshakeResult,
    };
  }

  // Auto-Resolution: Handle Referral / Weekend Task Auto-Unlock
  if (planId.startsWith("incentive_") || planId.includes("referral") || planId.includes("-wk")) {
    try {
      const summaryRes = await proxyAwareFetch(
        ZCODE_INCENTIVE_SUMMARY_URL,
        {
          headers: {
            Authorization: `Bearer ${cleanToken}`,
            "X-Device-Mid": deviceMid,
            "X-Client-Language": "en-US",
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(10000),
        },
        proxyOptions,
      );
      if (summaryRes.ok) {
        const sumData = await summaryRes.json().catch(() => null);
        const inviter = sumData?.data?.inviter;
        const matchingReward = (inviter?.rewards || []).find(
          (r) => r.plan?.plan_id === planId || `incentive_${r.reward_type}` === planId,
        );

        if (matchingReward && matchingReward.state === "in_progress") {
          const current = Number(matchingReward.current) || 0;
          const target = Number(matchingReward.target) || 0;
          return {
            ok: false,
            status: 400,
            code: "task_in_progress",
            message: `Syarat belum tercapai (${current}/${target}). Gunakan referral code [${inviter.invite_code}] di akun referral untuk auto-unlock.`,
            inviteCode: inviter.invite_code,
            progress: { current, target },
          };
        }
      }
    } catch {}
  }

  const headers = {
    Authorization: `Bearer ${cleanToken}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-ZCode-App-Version": ZCODE_APP_VERSION,
    "X-Platform": ZCODE_PLATFORM,
    "X-Device-Mid": deviceMid,
  };

  if (captcha?.captchaVerifyParam) {
    headers["X-Aliyun-Captcha-Verify-Param"] = captcha.captchaVerifyParam;
  }
  if (captcha?.captchaRegion) {
    headers["X-Aliyun-Captcha-Verify-Region"] = captcha.captchaRegion;
  }

  let response;
  try {
    response = await proxyAwareFetch(
      ZCODE_PLAN_CLAIM_URL,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ plan_id: planId.trim() }),
        signal: AbortSignal.timeout(20000),
        redirect: "error",
      },
      proxyOptions,
    );
  } catch (err) {
    return { ok: false, status: 502, code: "network_error", message: `GLM claim request failed: ${err?.message || err}` };
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      code: payload?.code || "http_error",
      message: payload?.msg || payload?.message || `GLM claim failed (HTTP ${response.status})`,
    };
  }

  if (payload?.code === 0 || payload?.code === 200) {
    return {
      ok: true,
      status: 200,
      code: "SUCCESS",
      plan: payload?.data?.plan || null,
      message: "Event plan claimed successfully.",
    };
  }

  return {
    ok: false,
    status: 400,
    code: payload?.code ? String(payload.code) : "claim_rejected",
    message: payload?.data?.message || payload?.msg || payload?.message || "Plan claim was rejected.",
    data: payload?.data,
  };
}
