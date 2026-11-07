/**
 * Project ID Service - Fetch and cache real Project IDs from Google Cloud Code API
 *
 *
 * Instead of generating random project IDs (e.g. "useful-spark-a1b2c"),
 * this service fetches the real Project ID bound to the authenticated user's account.
 * This significantly reduces the risk of being flagged by Google's anti-abuse systems.
 */

import { CLOUD_CODE_API, LOAD_CODE_ASSIST_HEADERS, ANTIGRAVITY_LOAD_CODE_ASSIST_HEADERS, LOAD_CODE_ASSIST_METADATA } from "../config/appConstants.js";

// ─── Cache ────────────────────────────────────────────────────────────────────
// connectionId -> { projectId: string, fetchedAt: number }
const projectIdCache = new Map();

/** How long a cached project ID is considered fresh (1 hour). */
const CACHE_TTL_MS = 60 * 60 * 1000;

// ─── Pending-fetch deduplication ─────────────────────────────────────────────
// connectionId -> { promise: Promise<string|null>, controller: AbortController, startedAt: number }
const pendingFetches = new Map();

/** Abort and evict a pending fetch that has been running longer than this (2 min). */
const PENDING_TTL_MS = 2 * 60 * 1000;

// ─── Periodic cleanup ────────────────────────────────────────────────────────
/** How often the background sweep runs (10 min). */
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

let _cleanupTimer = null;

/** Run one sweep immediately: evict stale cache entries and abort orphaned pending fetches. */
export function cleanupNow() {
    const now = Date.now();

    for (const [id, entry] of projectIdCache) {
        if (!entry || now - entry.fetchedAt >= CACHE_TTL_MS) {
            projectIdCache.delete(id);
        }
    }

    for (const [id, item] of pendingFetches) {
        if (!item || typeof item.startedAt !== "number") {
            pendingFetches.delete(id);
            continue;
        }
        if (now - item.startedAt > PENDING_TTL_MS) {
            try { item.controller.abort(); } catch (_) { /* ignore */ }
            pendingFetches.delete(id);
        }
    }
}

/** Start the periodic background cleanup (idempotent). Called automatically on module load. */
export function startCacheCleanup() {
    if (_cleanupTimer) return;
    _cleanupTimer = setInterval(() => {
        try { cleanupNow(); } catch (e) {
            console.warn("[ProjectId] cleanup sweep error:", e?.message ?? e);
        }
    }, CLEANUP_INTERVAL_MS);
    // Unref so the timer doesn't prevent Node from exiting when it is otherwise idle
    _cleanupTimer?.unref?.();
}

/** Stop the periodic background cleanup (e.g. during graceful shutdown). */
export function stopCacheCleanup() {
    if (!_cleanupTimer) return;
    clearInterval(_cleanupTimer);
    _cleanupTimer = null;
}

// Start automatically when the module is first imported
startCacheCleanup();

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Get the Project ID for a connection, with caching.
 * Returns null on failure (callers should fall back to random generation).
 *
 * @param {string} connectionId - The connection identifier for cache keying
 * @param {string} accessToken  - Valid OAuth access token
 * @returns {Promise<string|null>} Real project ID or null
 */
export async function getProjectIdForConnection(connectionId, accessToken, provider = "gemini-cli") {
    if (!connectionId || !accessToken) return null;

    // Return cached value if still fresh
    const cached = projectIdCache.get(connectionId);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
        return cached.projectId;
    }

    // Deduplicate concurrent fetches for the same connection
    if (pendingFetches.has(connectionId)) {
        return pendingFetches.get(connectionId).promise;
    }

    // Each fetch gets its own AbortController so it can be canceled via removeConnection()
    const controller = new AbortController();

    const promise = (async () => {
        try {
            const projectId = await fetchProjectId(accessToken, controller.signal, provider);
            if (projectId) {
                projectIdCache.set(connectionId, {projectId, fetchedAt: Date.now()});
                return projectId;
            }
            console.warn("[ProjectId] could not provision projectId on Google server for connection", connectionId.slice(0, 8));
            return null;
        } catch (error) {
            console.warn(`[ProjectId] Error provisioning project ID on Google server: ${error.message}`);
            return null;
        } finally {
            pendingFetches.delete(connectionId);
        }
    })();

    pendingFetches.set(connectionId, {promise, controller, startedAt: Date.now()});
    return promise;
}

/**
 * Invalidate the cached project ID for a connection.
 * Call this when a connection's credentials are fully revoked or refreshed.
 */
export function invalidateProjectId(connectionId) {
    projectIdCache.delete(connectionId);
}

/**
 * Fully remove a connection: abort any in-flight fetch and delete its cached project ID.
 * Wire this into your connection close / disconnect lifecycle events to prevent memory leaks.
 *
 * @param {string} connectionId
 */
export function removeConnection(connectionId) {
    if (!connectionId) return;
    projectIdCache.delete(connectionId);
    const pending = pendingFetches.get(connectionId);
    if (pending) {
        try { pending.controller.abort(); } catch (_) { /* ignore */ }
        pendingFetches.delete(connectionId);
    }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Fetch project ID via loadCodeAssist endpoint.
 * Falls back to onboardUser when loadCodeAssist returns no project.
 *
 * @param {string}      accessToken
 * @param {AbortSignal} signal
 * @returns {Promise<string|null>}
 */
async function fetchProjectId(accessToken, signal, provider) {
    const endpoints = CLOUD_CODE_API[provider] || CLOUD_CODE_API["gemini-cli"];
    const headers = provider === "antigravity" ? ANTIGRAVITY_LOAD_CODE_ASSIST_HEADERS : LOAD_CODE_ASSIST_HEADERS;
    const response = await fetch(endpoints.loadCodeAssist, {
        method: "POST",
        headers: { ...headers, "Authorization": `Bearer ${accessToken}` },
        body: JSON.stringify({ metadata: LOAD_CODE_ASSIST_METADATA }),
        signal
    });

    if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(`loadCodeAssist failed: HTTP ${response.status} ${errorText.slice(0, 200)}`);
    }

    const data = await response.json();
    let projectId = extractProjectId(data);
    if (projectId) return projectId;

    // Determine the tier to use for onboarding
    let tierID = "free-tier";
    if (Array.isArray(data.allowedTiers)) {
        for (const tier of data.allowedTiers) {
            if (tier && typeof tier === "object" && tier.isDefault === true) {
                if (tier.id && typeof tier.id === "string" && tier.id.trim()) {
                    tierID = tier.id.trim();
                    break;
                }
            }
        }
    }

    // Call Google's onboardUser endpoint to trigger project creation on Google's servers
    const onboardPid = await onboardUser(accessToken, tierID, signal, endpoints, provider);
    if (onboardPid) return onboardPid;

    // Once onboarding request has gone through, re-query loadCodeAssist to fetch the provisioned project ID from Google's server
    try {
        const reloadRes = await fetch(endpoints.loadCodeAssist, {
            method: "POST",
            headers: { ...headers, "Authorization": `Bearer ${accessToken}` },
            body: JSON.stringify({ metadata: LOAD_CODE_ASSIST_METADATA }),
            signal
        });
        if (reloadRes.ok) {
            const reloadData = await reloadRes.json();
            const reloadedPid = extractProjectId(reloadData);
            if (reloadedPid) return reloadedPid;
        }
    } catch {}

    return null;
}

/**
 * Fetch project ID via onboardUser endpoint (polls until done).
 *
 * @param {string}      accessToken
 * @param {string}      tierID
 * @param {AbortSignal} externalSignal  – propagated from the connection's AbortController
 * @returns {Promise<string|null>}
 */
async function onboardUser(accessToken, tierID, externalSignal, endpoints, provider) {
    console.log(`[ProjectId] Onboarding user with tier: ${tierID}`);

    const reqBody = {
        tierId: tierID || "free-tier",
        tier_id: tierID || "free-tier",
        metadata: {
            ideType: "ANTIGRAVITY",
            ide_type: "ANTIGRAVITY",
            ideName: "antigravity",
            ide_name: "antigravity",
            ideVersion: "1.107.0",
            ide_version: "1.107.0",
            ...LOAD_CODE_ASSIST_METADATA,
        }
    };
    const headers = provider === "antigravity" ? ANTIGRAVITY_LOAD_CODE_ASSIST_HEADERS : LOAD_CODE_ASSIST_HEADERS;
    const MAX_ATTEMPTS = Number(process.env.ONBOARD_MAX_ATTEMPTS) || 6;
    const BASE_RETRY_DELAY_MS = 2_000;

    const targetUrls = [
        "https://daily-cloudcode-pa.googleapis.com/v1internal:onboardUser",
        "https://cloudcode-pa.googleapis.com/v1internal:onboardUser",
    ];

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        if (externalSignal?.aborted) return null;

        for (const url of targetUrls) {
            const localCtrl = new AbortController();
            const timeoutId = setTimeout(() => localCtrl.abort(), 15_000);
            const forwardAbort = () => localCtrl.abort();
            externalSignal?.addEventListener("abort", forwardAbort);

            try {
                const response = await fetch(url, {
                    method: "POST",
                    headers: { ...headers, "Authorization": `Bearer ${accessToken}` },
                    body: JSON.stringify(reqBody),
                    signal: localCtrl.signal
                });

                clearTimeout(timeoutId);

                if (response.ok) {
                    const data = await response.json().catch(() => null);
                    if (data) {
                        const projectId = extractProjectId(data);
                        if (projectId) {
                            console.log(`[ProjectId] Successfully onboarded on Google server, project ID: ${projectId}`);
                            return projectId;
                        }
                        if (data.done === true) {
                            return null;
                        }
                    }
                }
            } catch (err) {
                clearTimeout(timeoutId);
            } finally {
                clearTimeout(timeoutId);
                externalSignal?.removeEventListener("abort", forwardAbort);
            }
        }

        if (attempt < MAX_ATTEMPTS) {
            await new Promise(resolve => setTimeout(resolve, BASE_RETRY_DELAY_MS));
        }
    }

    return null;
}

/**
 * Extract project ID from loadCodeAssist or onboardUser response.
 */
function extractProjectId(data) {
    if (!data || typeof data !== "object") return null;

    for (const key of ["cloudaicompanionProject", "projectId", "project"]) {
        const val = data[key];
        if (typeof val === "string" && val.trim()) return val.trim();
        if (val && typeof val === "object" && typeof val.id === "string" && val.id.trim()) return val.id.trim();
    }

    if (data.response && typeof data.response === "object") {
        return extractProjectId(data.response);
    }

    return null;
}
