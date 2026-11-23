import { randomUUID } from "node:crypto";
import os from "node:os";
import { DefaultExecutor } from "./default.js";
import { proxyAwareFetch } from "../utils/proxyFetch.js";

const CLI_VERSION = "0.6.25";
const ADS_INTERVAL_MS = 60 * 1000;
const LAUNCH_HANDSHAKE_TTL_MS = 55 * 60 * 1000; // 55m TTL (official FreePI CLI launch grace is 60m)
const SETTLING_DELAY_MS = 500; // 500ms post-stream grace settling delay for upstream socket reset
const MAX_QUEUE_SIZE = 10;

// Track last impression timestamp, launch handshake timestamp, and session ID per token/connection
const sessionMap = new Map();
const lastImpressionMap = new Map();
const launchHandshakeMap = new Map();

// Per-token FIFO Queue for strict single concurrency (limit = 1)
const tokenQueues = new Map();

export function getSessionId(token) {
  let sid = sessionMap.get(token);
  if (!sid) {
    sid = randomUUID();
    sessionMap.set(token, sid);
  }
  return sid;
}

function resolveLocaleHeaders() {
  try {
    const o = Intl.DateTimeFormat().resolvedOptions();
    return {
      ...(o.timeZone ? { "x-client-timezone": o.timeZone } : {}),
      ...(o.locale ? { "x-client-locale": o.locale } : {}),
    };
  } catch {
    return { "x-client-timezone": "UTC", "x-client-locale": "en-US" };
  }
}

/**
 * Perform FreePI Session Launch Handshake (session_start).
 * Executes the official pre-flight launch handshake:
 * 1. Fetch banner ad with x-ad-trigger: "launch"
 * 2. Ping TryGravity / upstream tracking pixel if imp_url present
 * 3. Report impression to /ads/impression
 * 4. Sync profile & meter via GET /me
 * Guarantees that upstream FreePI marks the token as warm & ad-satisfied for up to 60 minutes.
 */
export async function launchSessionHandshake(token, sessionId = null, proxyOptions = null) {
  if (!token || typeof token !== "string" || !token.trim()) return false;
  const cleanToken = token.trim();
  const now = Date.now();
  const lastLaunch = launchHandshakeMap.get(cleanToken) || 0;
  if (now - lastLaunch < LAUNCH_HANDSHAKE_TTL_MS) {
    return true; // Still within launch grace period
  }

  const sid = sessionId || getSessionId(cleanToken);
  const turnId = randomUUID();
  const localeHeaders = resolveLocaleHeaders();

  try {
    const res = await proxyAwareFetch(
      "https://api.freepi.ai/ads/next?slot=banner",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${cleanToken}`,
          "Content-Type": "application/json",
          "x-session-id": sid,
          "x-turn-id": turnId,
          "x-client-version": CLI_VERSION,
          "x-client-os": process.platform,
          "x-client-arch": os.arch(),
          "x-ad-trigger": "launch",
          "x-ad-context": "none",
          ...localeHeaders,
        },
        signal: AbortSignal.timeout(6000),
      },
      proxyOptions
    );

    if (res.ok) {
      const ad = await res.json().catch(() => null);
      if (ad && ad.ad_id) {
        // Fire TryGravity / upstream tracking pixel
        if (ad.imp_url && typeof ad.imp_url === "string") {
          proxyAwareFetch(ad.imp_url, { method: "GET", signal: AbortSignal.timeout(4000) }, proxyOptions).catch(() => {});
        }

        // Report impression back to FreePI
        await proxyAwareFetch(
          "https://api.freepi.ai/ads/impression",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${cleanToken}`,
              "Content-Type": "application/json",
              "x-session-id": sid,
            },
            body: JSON.stringify({
              ad_id: ad.ad_id,
              click_token: ad.click_token,
              imp_fired: Boolean(ad.imp_url),
            }),
            signal: AbortSignal.timeout(5000),
          },
          proxyOptions
        );
      }
    }

    // Official CLI calls GET /me after launch banner to synchronize quota allowance and reward state
    await proxyAwareFetch(
      "https://api.freepi.ai/me",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${cleanToken}`,
          "Content-Type": "application/json",
          "x-session-id": sid,
        },
        signal: AbortSignal.timeout(5000),
      },
      proxyOptions
    ).catch(() => {});

    launchHandshakeMap.set(cleanToken, Date.now());
    lastImpressionMap.set(cleanToken, Date.now());
    return true;
  } catch {
    return false;
  }
}

/**
 * Perform FreePI periodic ad fetch and impression reporting cycle during active conversation turns.
 */
async function fireAdCycle(token, sessionId, turnId, proxyOptions) {
  if (!token || typeof token !== "string" || !token.trim()) return;
  const cleanToken = token.trim();
  const localeHeaders = resolveLocaleHeaders();
  try {
    const res = await proxyAwareFetch(
      "https://api.freepi.ai/ads/next?slot=banner",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${cleanToken}`,
          "Content-Type": "application/json",
          "x-session-id": sessionId,
          "x-turn-id": turnId,
          "x-client-version": CLI_VERSION,
          "x-client-os": process.platform,
          "x-client-arch": os.arch(),
          "x-ad-trigger": "user_message",
          "x-ad-context": "none",
          ...localeHeaders,
        },
        signal: AbortSignal.timeout(5000),
      },
      proxyOptions
    );

    if (!res.ok) return;
    const ad = await res.json().catch(() => null);
    if (!ad || !ad.ad_id) return;

    // Fire gravity / upstream pixel impression if present
    if (ad.imp_url && typeof ad.imp_url === "string") {
      proxyAwareFetch(ad.imp_url, { method: "GET", signal: AbortSignal.timeout(4000) }, proxyOptions).catch(() => {});
    }

    // Report ad impression back to FreePI
    await proxyAwareFetch(
      "https://api.freepi.ai/ads/impression",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cleanToken}`,
          "Content-Type": "application/json",
          "x-session-id": sessionId,
        },
        body: JSON.stringify({
          ad_id: ad.ad_id,
          click_token: ad.click_token,
          imp_fired: Boolean(ad.imp_url),
        }),
        signal: AbortSignal.timeout(5000),
      },
      proxyOptions
    );

    lastImpressionMap.set(cleanToken, Date.now());
  } catch {
    // Non-blocking catch
  }
}

/**
 * Acquire concurrency lock for a specific FreePI token queue (strict single concurrency: N = 1).
 * Returns an asynchronous release function.
 */
export async function acquireFreePiQueueLock(token, signal) {
  if (!token || typeof token !== "string") {
    return () => Promise.resolve();
  }
  const cleanToken = token.trim();

  let queue = tokenQueues.get(cleanToken);
  if (!queue) {
    queue = { running: false, waiting: [] };
    tokenQueues.set(cleanToken, queue);
  }

  const createReleaseFn = () => {
    let released = false;
    return async () => {
      if (released) return;
      released = true;
      // Post-stream settling delay (~500ms) to ensure upstream FreePI server has released session socket
      if (SETTLING_DELAY_MS > 0) {
        await new Promise((r) => setTimeout(r, SETTLING_DELAY_MS));
      }

      while (queue.waiting.length > 0) {
        const next = queue.waiting.shift();
        if (next && !next.aborted) {
          next.resolve(createReleaseFn());
          return;
        }
      }
      queue.running = false;
    };
  };

  // If slot is immediately available, acquire lock
  if (!queue.running) {
    queue.running = true;
    return createReleaseFn();
  }

  // Reject early if queue capacity is overwhelmed
  if (queue.waiting.length >= MAX_QUEUE_SIZE) {
    throw new Error("FreePI queue full: too many concurrent requests queued for this account");
  }

  // Wait in FIFO queue
  return new Promise((resolve, reject) => {
    const item = {
      resolve,
      reject,
      aborted: false,
    };

    if (signal) {
      if (signal.aborted) {
        return reject(new Error("Request aborted before acquiring FreePI queue slot"));
      }
      signal.addEventListener("abort", () => {
        item.aborted = true;
        const idx = queue.waiting.indexOf(item);
        if (idx !== -1) queue.waiting.splice(idx, 1);
        reject(new Error("Request aborted while in FreePI queue"));
      }, { once: true });
    }

    queue.waiting.push(item);
  });
}

/**
 * Wraps a streaming response body so that the queue release lock is held
 * throughout the entire token streaming lifecycle until EOF, flush, or abort.
 */
function wrapStreamWithQueueLock(response, releaseLock) {
  if (!response?.body || typeof response.body.pipeThrough !== "function") {
    releaseLock();
    return response;
  }

  let released = false;
  const safeRelease = () => {
    if (!released) {
      released = true;
      releaseLock();
    }
  };

  const transform = new TransformStream({
    transform(chunk, controller) {
      controller.enqueue(chunk);
    },
    flush() {
      safeRelease();
    },
    cancel() {
      safeRelease();
    },
  });

  const pipedBody = response.body.pipeThrough(transform);
  return new Response(pipedBody, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

export class FreePiExecutor extends DefaultExecutor {
  constructor() {
    super("freepi");
  }

  buildHeaders(credentials, stream = true, url, model, body) {
    const headers = super.buildHeaders(credentials, stream, url, model, body);
    const token = credentials?.accessToken || credentials?.apiKey;
    const sessionId = token ? getSessionId(token) : randomUUID();
    const turnId = randomUUID();

    headers["x-client-version"] = CLI_VERSION;
    headers["x-session-id"] = sessionId;
    headers["x-turn-id"] = turnId;
    headers["x-ad-context"] = "none";

    return headers;
  }

  async execute(params) {
    const { credentials, proxyOptions, log, signal } = params;
    const token = credentials?.accessToken || credentials?.apiKey;
    const cleanToken = token?.trim?.() || "";
    const sessionId = cleanToken ? getSessionId(cleanToken) : randomUUID();
    const turnId = randomUUID();

    // 1. Session Launch Handshake: pre-warm account if not yet performed or expired
    if (cleanToken) {
      const lastLaunch = launchHandshakeMap.get(cleanToken) || 0;
      if (Date.now() - lastLaunch >= LAUNCH_HANDSHAKE_TTL_MS) {
        launchSessionHandshake(cleanToken, sessionId, proxyOptions).catch(() => {});
      }
    }

    // 2. Heartbeat: fire ad impression in background if older than 60s
    if (cleanToken) {
      const lastImpression = lastImpressionMap.get(cleanToken) || 0;
      if (Date.now() - lastImpression > ADS_INTERVAL_MS) {
        lastImpressionMap.set(cleanToken, Date.now()); // optimistic debounce
        fireAdCycle(cleanToken, sessionId, turnId, proxyOptions).catch(() => {});
      }
    }

    // 3. Acquire Stream Queue Lock (Strict single concurrency = 1 per account)
    let releaseLock = () => Promise.resolve();
    if (cleanToken) {
      try {
        releaseLock = await acquireFreePiQueueLock(cleanToken, signal);
      } catch (queueErr) {
        log?.warn?.("FREEPI", `Queue acquisition error: ${queueErr.message}`);
        return {
          response: new Response(
            JSON.stringify({ error: { message: queueErr.message, code: "QUEUE_OVERFLOW" } }),
            { status: 429, headers: { "Content-Type": "application/json" } }
          ),
          url: this.buildUrl(params.model, params.stream, 0, credentials),
          headers: {},
          transformedBody: params.body,
        };
      }
    }

    let result;
    try {
      result = await super.execute(params);

      // If upstream returns 429 concurrent ("one request at a time"), wait 2.1s and retry automatically (up to 2 times)
      if (result?.response?.status === 429 && cleanToken) {
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            const cloned = result.response.clone();
            const text = await cloned.text();
            if (text.includes("concurrent") || text.includes("one request at a time")) {
              log?.info?.("FREEPI", `Detected concurrent lock (429: one request at a time). Waiting 2.1s before retry (${attempt}/2)...`);
              await new Promise((r) => setTimeout(r, 2100));
              result = await super.execute(params);
              if (result?.response?.ok || result?.response?.status !== 429) {
                break;
              }
            } else {
              break;
            }
          } catch {
            break;
          }
        }
      }

      // If upstream returns 403 ads_required, automatically unblock via launch/impression cycle and retry once
      if (result?.response?.status === 403 && cleanToken) {
        try {
          const cloned = result.response.clone();
          const text = await cloned.text();
          if (text.includes("ads_required")) {
            log?.info?.("FREEPI", "Detected ads_required (403), triggering ad handshake and retrying...");
            await launchSessionHandshake(cleanToken, sessionId, proxyOptions);
            result = await super.execute(params);
          } else if (text.includes("belongs to another free-pi account")) {
            log?.warn?.("FREEPI", "Rejected: Conversation belongs to another FreePI account. New conversation required.");
          }
        } catch {
          // Fall through to original result
        }
      }

      // 4. If streaming response is successful, wrap stream so lock is held until stream completion
      if (result?.response?.ok && result.response.body) {
        result.response = wrapStreamWithQueueLock(result.response, releaseLock);
        return result;
      }

      // For non-streaming or errored responses, release lock immediately
      releaseLock();
      return result;
    } catch (err) {
      releaseLock();
      throw err;
    }
  }
}
