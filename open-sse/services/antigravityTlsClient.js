/**
 * antigravityTlsClient.js — BoringSSL TLS-impersonating fetch for Antigravity
 * (cloudcode-pa.googleapis.com).
 *
 * The upstream executor commit references this module but it was never committed,
 * which broke `next build`. This implementation delegates to the hardened wreq-js
 * session client (same Chrome 133 ClientHello emulation used for ZCode) with
 * fail-open to native fetch, so a missing wreq-js runtime degrades gracefully
 * instead of hard-failing every Antigravity request.
 *
 * Contract (see open-sse/executors/base.js):
 *   fetchFn(url, init, proxyOptions) → Response
 * `proxyOptions` is only a connection proxy config object (or null); when
 * connectionProxyEnabled is set the base executor routes through proxyAwareFetch
 * instead, so any proxy hint here is best-effort.
 */

import { zcodeTlsFetch } from "./zcodeTlsClient.js";

const FALLBACK_WARN_INTERVAL_MS = 30_000;
let lastFallbackWarnAt = 0;

function extractProxy(proxyOptions) {
  if (!proxyOptions) return "";
  if (typeof proxyOptions === "string") return proxyOptions;
  if (typeof proxyOptions !== "object") return "";
  for (const key of ["proxyUrl", "proxy", "url", "connectionProxyUrl"]) {
    const v = proxyOptions[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

export async function antigravityTlsFetch(url, init = {}, proxyOptions = null) {
  const proxy = extractProxy(proxyOptions) || init?.proxy || "";
  const signal = init?.signal;

  try {
    return await zcodeTlsFetch(
      url,
      {
        method: init.method,
        headers: init.headers,
        body: init.body,
      },
      { signal, proxy }
    );
  } catch (error) {
    // The caller cancelled this request — do not re-dispatch a dead request on
    // the fallback path, regardless of proxy state.
    if (signal?.aborted) throw error;

    // With a configured proxy the wreq session cannot bypass it — surface the error
    // so the base executor's retry logic can act. Direct (no proxy) fails open.
    if (proxy) throw error;

    // Rate-limit the warning: a wreq outage re-fails every in-flight request and
    // an unconditional console.warn would flood the log.
    const now = Date.now();
    if (now - lastFallbackWarnAt > FALLBACK_WARN_INTERVAL_MS) {
      lastFallbackWarnAt = now;
      console.warn(`[AntigravityTLS] wreq fetch failed (${error?.message || error}), failing open to native fetch`);
    }
    return fetch(url, {
      method: init.method || "GET",
      headers: init.headers,
      body: init.body,
      signal,
    });
  }
}

export function resetAntigravityTlsSession() {
  // Sessions are owned by the shared zcodeTlsClient cache; nothing extra to clear here.
}
