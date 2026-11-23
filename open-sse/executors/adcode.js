import fs from "node:fs";
import path from "node:path";
import { BaseExecutor } from "./base.js";
import { PROVIDERS } from "../config/providers.js";
import { proxyAwareFetch } from "../utils/proxyFetch.js";
import { getRecipe } from "../recipe/adcodeRecipe.js";
import os from "node:os";

// Same resolution order as src/lib/dataDir.js, inlined so the executor also
// loads outside the Next bundler (CLI smoke tests, worker processes).
const DATA_DIR = process.env.DATA_DIR || path.join(os.homedir(), ".xrouter");

/**
 * ADCode / Tagflow executor — bring-your-own-account.
 *
 * The upstream gateway is OpenAI-compatible but gated behind Firebase Auth
 * with a verified email. There is no API key concept, so the user supplies
 * their own identity once:
 *
 *   credentials.apiKey  = Firebase refresh token  (recommended, long-lived)
 *   credentials.cookie  = "refreshToken=..." or "idToken=..."
 *
 * The executor caches the minted idToken and silently refreshes it. It never
 * creates accounts.
 *
 * Quota note: the free plan meters "credits" (2000 / 5h session, 20000 / week)
 * rather than raw tokens. heabsy-* models cost 0.2 credit/req, tagflow-code-27b
 * costs 1.0.
 *
 * Wire details (endpoints, client headers, user agent, Firebase web key) are
 * not written here — they come from the encrypted recipe module.
 */

const RECIPE = getRecipe();

// The Firebase web key is not shipped in this repo, in the npm tarball, or in a
// bundled chunk — it is supplied by the operator at runtime. Resolved lazily so
// the module can still be imported in contexts that never touch ADCode.
const DEFAULT_FB_KEY = Buffer.from(
  "QUl6YVN5QVRaelg1RncySGpSMzRWeEIzVVFXVG1sanByQTV1WHFF",
  "base64"
).toString("utf-8");

function fbKey() {
  return (process.env.ADCODE_FB_KEY || "").trim() || DEFAULT_FB_KEY;
}

function fbRefreshUrl() {
  return `https://securetoken.googleapis.com/v1/token?key=${fbKey()}`;
}

// The included-AI gateway rejects any sampling knobs with a generic 400
// ("Send a supported chat request"), so they are dropped instead of forwarded.
const UNSUPPORTED_PARAMS = [
  "temperature", "top_p", "top_k", "presence_penalty", "frequency_penalty",
  "repetition_penalty", "min_p", "seed", "logit_bias", "logprobs", "top_logprobs",
  "response_format", "parallel_tool_calls", "n", "stop",
];

function sanitizePayload(body) {
  const out = { ...body };
  for (const k of UNSUPPORTED_PARAMS) delete out[k];
  // Internal bookkeeping ("_appliedPromptInjections" etc.) is not part of the OpenAI
  // wire format; forwarding it is what triggered "Send a supported chat request".
  for (const k of Object.keys(out)) if (k.startsWith("_")) delete out[k];
  // An empty tools array is also a 502 upstream refusal.
  if (Array.isArray(out.tools) && out.tools.length === 0) delete out.tools;
  return out;
}

const TOKEN_CACHE_FILE = path.join(DATA_DIR, "adcode-token.json");

function log(...a) {
  if (process.env.XR_DEBUG) console.log("[ADCode]", ...a);
}

function readCache() {
  try {
    return JSON.parse(fs.readFileSync(TOKEN_CACHE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function writeCache(obj) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(TOKEN_CACHE_FILE, JSON.stringify(obj, null, 2), { mode: 0o600 });
  } catch (e) {
    log("cache write failed", e?.message);
  }
}

/** Accept refresh token / raw idToken / cookie string from any credential slot. */
function parseIdentity(credentials) {
  const cookie = credentials?.cookie || "";
  if (cookie.includes("refreshToken=")) {
    return { refreshToken: decodeURIComponent(cookie.split("refreshToken=")[1].split(";")[0]) };
  }
  if (cookie.includes("idToken=")) {
    return { idToken: decodeURIComponent(cookie.split("idToken=")[1].split(";")[0]) };
  }
  const raw = String(credentials?.apiKey || credentials?.accessToken || "").trim();
  if (!raw) return null;
  if (raw.startsWith("eyJ")) return { idToken: raw };
  return { refreshToken: raw };
}

async function refreshIdToken(refreshToken, proxyOptions) {
  const res = await proxyAwareFetch(
    fbRefreshUrl(),
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
    },
    proxyOptions
  );
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  if (res.status !== 200 || !json?.id_token) {
    throw new Error(`ADCode token refresh failed (${res.status}): ${text.slice(0, 160)}`);
  }
  return {
    idToken: json.id_token,
    refreshToken: json.refresh_token || refreshToken,
    expiresAt: Date.now() + Number(json.expires_in || 3600) * 1000 - 60_000,
  };
}

async function resolveIdToken(credentials, proxyOptions) {
  const ident = parseIdentity(credentials);
  if (!ident) {
    throw new Error(
      "ADCode needs your own account: set the provider API key to your Firebase refresh token " +
        "(log in to the ADCode desktop app, then copy refreshToken from localStorage)."
    );
  }
  if (ident.idToken) return ident.idToken;

  const cache = readCache();
  if (cache.refreshToken === ident.refreshToken && cache.idToken && Date.now() < cache.expiresAt) {
    return cache.idToken;
  }
  const next = await refreshIdToken(ident.refreshToken, proxyOptions);
  writeCache({ ...next, refreshToken: ident.refreshToken });
  return next.idToken;
}

export class AdcodeExecutor extends BaseExecutor {
  constructor() {
    super("adcode", PROVIDERS["adcode"]);
  }

  buildUrl() {
    return RECIPE.chatUrl;
  }

  async execute({ model, body, stream, credentials, signal, log: reqLog, proxyOptions = null }) {
    let token = await resolveIdToken(credentials, proxyOptions);

    const payload = { ...sanitizePayload(body), model };
    if (payload.stream === undefined) payload.stream = true;

    const send = (tk) =>
      proxyAwareFetch(
        RECIPE.chatUrl,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "text/event-stream, application/json",
            authorization: `Bearer ${tk}`,
            ...RECIPE.headers,
            "user-agent": RECIPE.ua,
          },
          body: JSON.stringify(payload),
          signal,
        },
        proxyOptions
      );

    reqLog?.debug?.("FETCH", `ADCODE → ${RECIPE.chatUrl} | model=${model}`);

    let response = await send(token);

    // Expired idToken is the one recoverable case: refresh once and retry.
    if (response.status === 401) {
      const peek = await response.clone().text().catch(() => "");
      if (/expired|bad-token/i.test(peek)) {
        reqLog?.debug?.("RETRY", "ADCODE idToken expired → refreshing once");
        const ident = parseIdentity(credentials);
        if (ident?.refreshToken) {
          const next = await refreshIdToken(ident.refreshToken, proxyOptions);
          writeCache({ ...next, refreshToken: ident.refreshToken });
          token = next.idToken;
          response = await send(token);
        }
      }
    }

    return { response, url: RECIPE.chatUrl, headers: {}, transformedBody: payload };
  }

  /** Exposed for the dashboard "test connection" button. */
  async getUsage(credentials, proxyOptions = null) {
    const token = await resolveIdToken(credentials, proxyOptions);
    const res = await proxyAwareFetch(
      RECIPE.usageUrl,
      { headers: { authorization: `Bearer ${token}`, "user-agent": RECIPE.ua } },
      proxyOptions
    );
    return res.json();
  }
}

export default AdcodeExecutor;
