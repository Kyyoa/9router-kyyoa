import { BaseExecutor } from "./base.js";
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import { applyOpenAIToolBridge } from "../translator/concerns/toolBridge.js";

const require = createRequire(import.meta.url);
let wreq = null;
try {
  wreq = require("wreq-js");
} catch (e) {
  // Graceful fallback if wreq-js not available
}

const VENICE_OUTERFACE_URL = "https://outerface.venice.ai";
const INFERENCE_URL = `${VENICE_OUTERFACE_URL}/api/inference/chat`;
const MINT_URL = `${VENICE_OUTERFACE_URL}/api/app/user/client_attestation/mint`;
const MIDDLEFACE_VERSION = "0.1.1272";
const DEFAULT_MODEL = "deepseek-v4-1-flash-uncensored";
const TOKEN_EXPIRATION_GRACE_MS = 60_000;
const SESSION_TTL_MS = 10 * 60_000;

function errorResponse(status, message) {
  return new Response(
    JSON.stringify({
      error: {
        message,
        type: "venice_error",
        code: status,
      },
    }),
    {
      status,
      headers: { "Content-Type": "application/json" },
    }
  );
}

export class VeniceExecutor extends BaseExecutor {
  constructor() {
    super("venice");
    this.noAuth = true;
    this.tokenCache = new Map(); // proxyKey -> { queue: string[], expiresAt: number }
    this.sessionPool = new Map(); // proxyKey -> { session: any, createdAt: number, lastUsed: number }
    this.inFlightMints = new Map(); // proxyKey -> Promise<string>
    this.proxyIndex = 0;
    this.localProxies = this.loadLocalProxies();
  }

  loadLocalProxies() {
    const defaultPath = process.env.VENICE_PROXY_FILE || "d:/app/file txt/proxyscrape_premium_http_proxies (5).txt";
    try {
      if (fs.existsSync(defaultPath)) {
        const raw = fs.readFileSync(defaultPath, "utf8");
        return raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      }
    } catch {}
    return [];
  }

  resolveProxy(proxyOptions) {
    if (proxyOptions?.connectionProxyUrl && proxyOptions.connectionProxyEnabled !== false) {
      return proxyOptions.connectionProxyUrl;
    }
    if (this.localProxies.length > 0) {
      const p = this.localProxies[this.proxyIndex % this.localProxies.length];
      this.proxyIndex++;
      return p.startsWith("http://") || p.startsWith("https://") ? p : `http://${p}`;
    }
    return null;
  }

  isTokenFresh(expiresAt) {
    if (!expiresAt || typeof expiresAt !== "number") return false;
    return (expiresAt * 1000 - TOKEN_EXPIRATION_GRACE_MS) > Date.now();
  }

  async getOrCreateSession(proxyKey, proxyUrl) {
    if (!wreq) return null;
    const now = Date.now();
    const entry = this.sessionPool.get(proxyKey);
    if (entry && (now - entry.createdAt < SESSION_TTL_MS)) {
      entry.lastUsed = now;
      return entry.session;
    }

    const session = await wreq.createSession({
      profile: "chrome_133",
      proxy: proxyUrl || undefined,
      timeout: 45000,
    });

    this.sessionPool.set(proxyKey, {
      session,
      createdAt: now,
      lastUsed: now,
    });

    // Cleanup stale sessions (> 15 mins)
    for (const [key, val] of this.sessionPool.entries()) {
      if (now - val.lastUsed > 15 * 60_000) {
        this.sessionPool.delete(key);
      }
    }

    return session;
  }

  evictSession(proxyKey) {
    this.sessionPool.delete(proxyKey);
    this.tokenCache.delete(proxyKey);
  }

  async getAttestationToken(arg1, arg2) {
    let session = null;
    let proxyKey = "direct";
    let proxyUrl = null;

    if (typeof arg1 === "string") {
      proxyKey = arg1;
      proxyUrl = arg2 || null;
    } else {
      session = arg1;
      proxyKey = arg2 || "direct";
      proxyUrl = proxyKey === "direct" ? null : proxyKey;
    }

    // 1. Check existing token queue with TTL grace period
    const cached = this.tokenCache.get(proxyKey);
    if (cached && Array.isArray(cached.queue) && cached.queue.length > 0) {
      if (this.isTokenFresh(cached.expiresAt)) {
        return cached.queue.shift();
      }
      this.tokenCache.delete(proxyKey);
    }

    // 2. Deduplicate concurrent in-flight mints
    let inFlight = this.inFlightMints.get(proxyKey);
    if (inFlight) {
      await inFlight;
      const refreshed = this.tokenCache.get(proxyKey);
      if (refreshed && Array.isArray(refreshed.queue) && refreshed.queue.length > 0) {
        return refreshed.queue.shift();
      }
    }

    // 3. Initiate single in-flight batch mint
    const mintPromise = this.mintAndQueue(proxyKey, proxyUrl, session).finally(() => {
      if (this.inFlightMints.get(proxyKey) === mintPromise) {
        this.inFlightMints.delete(proxyKey);
      }
    });

    this.inFlightMints.set(proxyKey, mintPromise);
    return mintPromise;
  }

  async mintAndQueue(proxyKey, proxyUrl, existingSession = null) {
    const session = existingSession || (await this.getOrCreateSession(proxyKey, proxyUrl));
    if (!session) {
      throw new Error("Failed to obtain session for Venice attestation mint");
    }

    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
      Origin: "https://venice.ai",
      Referer: "https://venice.ai/chat/v2",
      "User-Agent": `venice-middleface/${MIDDLEFACE_VERSION}`,
      "x-venice-middleface-version": MIDDLEFACE_VERSION,
      "x-venice-request-timestamp-ms": String(Date.now()),
      "Sec-CH-UA": '"Not(A:Brand";v="99", "Google Chrome";v="133", "Chromium";v="133"',
      "Sec-CH-UA-Mobile": "?0",
      "Sec-CH-UA-Platform": '"Windows"',
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-site",
    };

    const body = JSON.stringify({
      count: 5,
      env: {
        nativeIntegrityOk: true,
        webdriver: false,
        unexpectedGlobalsCount: 0,
      },
    });

    const doMint = async (sess) => {
      return await sess.fetch(MINT_URL, {
        method: "POST",
        headers,
        body,
      });
    };

    let mintRes;
    try {
      mintRes = await doMint(session);
    } catch (err) {
      this.evictSession(proxyKey);
      const freshSession = await this.getOrCreateSession(proxyKey, proxyUrl);
      if (!freshSession) throw err;
      mintRes = await doMint(freshSession);
    }

    // Transient retry with 400ms delay for 429 or 5xx (official client behavior)
    if (mintRes && [429, 500, 502, 503, 504].includes(mintRes.status)) {
      await new Promise((r) => setTimeout(r, 400));
      mintRes = await doMint(session);
    }

    if (!mintRes || mintRes.status !== 200) {
      const status = mintRes ? mintRes.status : 502;
      const errText = mintRes ? await mintRes.text().catch(() => "") : "No response";
      throw new Error(`Attestation mint failed with HTTP ${status}: ${errText}`);
    }

    const data = await mintRes.json();
    const tokens = data.tokens
      ? data.tokens.map((t) => (typeof t === "string" ? t : t.token))
      : data.token
      ? [data.token]
      : [];

    if (!tokens.length) {
      throw new Error("No tokens returned from Venice attestation mint");
    }

    const expiresAt = typeof data.expiresAt === "number" ? data.expiresAt : Math.floor(Date.now() / 1000) + 300;
    const firstToken = tokens.shift();

    this.tokenCache.set(proxyKey, {
      queue: tokens,
      expiresAt,
    });

    return firstToken;
  }

  formatPayload(model, bodyObj) {
    const rawModel = String(model || "").replace(/^(venice\/|venice-ai\/|veniceai\/)/, "") || DEFAULT_MODEL;
    const messages = Array.isArray(bodyObj.messages) ? bodyObj.messages : [];

    let systemPrompt = "";
    const prompt = [];

    const tools = Array.isArray(bodyObj.tools) && bodyObj.tools.length > 0
      ? bodyObj.tools
      : (Array.isArray(bodyObj._openaiToolBridge?.tools) ? bodyObj._openaiToolBridge.tools : []);

    if (tools.length > 0) {
      const toolDefs = tools.map((t) => {
        const fn = t.function || t;
        const desc = fn.description ? `: ${fn.description}` : "";
        const params = fn.parameters ? `\n  parameters: ${JSON.stringify(fn.parameters)}` : "";
        return `- ${fn.name}${desc}${params}`;
      }).join("\n");

      const toolInstruction = `[Tools Available]\nYou have access to the following tools:\n${toolDefs}\n\nTo invoke a tool, output a JSON tool_call block:\n<tool_call>{"name": "tool_name", "arguments": { ... }}</tool_call>\nOnly call a tool when necessary to fulfill the request.`;
      systemPrompt = toolInstruction;
    }

    for (const msg of messages) {
      if (msg.role === "system") {
        systemPrompt += (systemPrompt ? "\n\n" : "") + (typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content));
      } else if (msg.role === "tool") {
        const toolName = msg.name ? ` (${msg.name})` : "";
        const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
        prompt.push({
          role: "user",
          content: `[Tool Result${toolName}]:\n${content}`,
        });
      } else if (msg.role === "assistant" && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
        let content = typeof msg.content === "string" && msg.content ? msg.content + "\n" : "";
        for (const tc of msg.tool_calls) {
          const name = tc.function?.name || "";
          const args = tc.function?.arguments || "{}";
          content += `<tool_call>{"name":"${name}","arguments":${typeof args === "string" ? args : JSON.stringify(args)}}</tool_call>\n`;
        }
        prompt.push({
          role: "assistant",
          content: content.trim(),
        });
      } else {
        prompt.push({
          role: msg.role === "assistant" ? "assistant" : "user",
          content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
        });
      }
    }

    if (!prompt.some((m) => m.role === "user")) {
      prompt.push({ role: "user", content: "Hello" });
    }

    return {
      requestId: crypto.randomUUID(),
      modelId: rawModel,
      prompt,
      systemPrompt: systemPrompt || undefined,
      temperature: bodyObj.temperature ?? 0.7,
      topP: bodyObj.top_p ?? 0.9,
      simpleMode: false,
    };
  }

  async execute({ model, body, stream, credentials, signal, log, proxyOptions = null }) {
    if (!wreq) {
      return {
        response: errorResponse(500, "wreq-js is required for Venice executor TLS impersonation"),
        url: INFERENCE_URL,
        headers: {},
        transformedBody: body,
      };
    }

    const bodyObj = body || {};
    let proxyUrl = this.resolveProxy(proxyOptions);
    let proxyKey = proxyUrl || "direct";

    let session = null;
    let attestationToken = null;
    let attempts = 0;
    const maxAttempts = (this.localProxies.length > 1 && !proxyOptions?.connectionProxyUrl) ? 3 : 1;

    while (attempts < maxAttempts) {
      attempts++;
      try {
        session = await this.getOrCreateSession(proxyKey, proxyUrl);
        attestationToken = await this.getAttestationToken(proxyKey, proxyUrl);
        if (attestationToken && session) break;
      } catch (err) {
        this.evictSession(proxyKey);
        if (attempts >= maxAttempts) {
          return {
            response: errorResponse(502, `Venice Attestation error: ${err.message}`),
            url: MINT_URL,
            headers: {},
            transformedBody: body,
          };
        }
        proxyUrl = this.resolveProxy(proxyOptions);
        proxyKey = proxyUrl || "direct";
      }
    }

    const payload = this.formatPayload(model, bodyObj);

    const headers = {
      "Content-Type": "application/json",
      Accept: "text/event-stream, application/json, */*",
      Origin: "https://venice.ai",
      Referer: "https://venice.ai/chat/v2",
      "User-Agent": `venice-middleface/${MIDDLEFACE_VERSION}`,
      "x-venice-middleface-version": MIDDLEFACE_VERSION,
      "x-venice-request-timestamp-ms": String(Date.now()),
      "x-venice-client-attestation": attestationToken,
      "Sec-CH-UA": '"Not(A:Brand";v="99", "Google Chrome";v="133", "Chromium";v="133"',
      "Sec-CH-UA-Mobile": "?0",
      "Sec-CH-UA-Platform": '"Windows"',
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-site",
    };

    let upstreamRes;
    try {
      upstreamRes = await session.fetch(INFERENCE_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal,
      });
    } catch (err) {
      this.evictSession(proxyKey);
      return {
        response: errorResponse(502, `Failed to connect to Venice AI: ${err.message}`),
        url: INFERENCE_URL,
        headers,
        transformedBody: payload,
      };
    }

    if (!upstreamRes.ok) {
      this.evictSession(proxyKey);
      const errText = await upstreamRes.text().catch(() => "");
      return {
        response: errorResponse(upstreamRes.status, `Venice AI Error (${upstreamRes.status}): ${errText}`),
        url: INFERENCE_URL,
        headers,
        transformedBody: payload,
      };
    }

    const id = `chatcmpl-vnc-${Date.now()}`;
    const created = Math.floor(Date.now() / 1000);
    const resolvedModel = payload.modelId;

    if (stream) {
      const encoder = new TextEncoder();
      const reader = upstreamRes.body.getReader();
      const decoder = new TextDecoder("utf-8");

      const readable = new ReadableStream({
        async start(controller) {
          let buffer = "";

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() || "";

              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;

                let contentChunk = "";
                try {
                  const parsed = JSON.parse(trimmed);
                  if (parsed.kind === "content" && parsed.content) {
                    contentChunk = parsed.content;
                  }
                } catch {
                  // Ignore metadata or parse failures
                }

                if (contentChunk) {
                  const sseChunk = {
                    id,
                    object: "chat.completion.chunk",
                    created,
                    model: resolvedModel,
                    choices: [
                      {
                        index: 0,
                        delta: { content: contentChunk },
                        finish_reason: null,
                      },
                    ],
                  };
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(sseChunk)}\n\n`));
                }
              }
            }

            // Emit final chunk
            const finalChunk = {
              id,
              object: "chat.completion.chunk",
              created,
              model: resolvedModel,
              choices: [
                {
                  index: 0,
                  delta: {},
                  finish_reason: "stop",
                },
              ],
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(finalChunk)}\n\n`));
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          } catch (err) {
            controller.error(err);
          }
        },
      });

      return {
        response: new Response(readable, {
          status: 200,
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        }),
        url: INFERENCE_URL,
        headers,
        transformedBody: payload,
      };
    }

    // Non-streaming response handling
    const rawBody = await upstreamRes.text().catch(() => "");
    let fullText = "";
    for (const line of rawBody.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed.kind === "content" && parsed.content) {
          fullText += parsed.content;
        }
      } catch {}
    }

    const nonStreamBody = {
      id,
      object: "chat.completion",
      created,
      model: resolvedModel,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: fullText,
          },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: 15,
        completion_tokens: Math.ceil(fullText.length / 4),
        total_tokens: 15 + Math.ceil(fullText.length / 4),
      },
    };

    const tools = Array.isArray(bodyObj?.tools) && bodyObj.tools.length > 0
      ? bodyObj.tools
      : (Array.isArray(bodyObj?._openaiToolBridge?.tools) ? bodyObj._openaiToolBridge.tools : []);

    if (tools.length > 0 && fullText) {
      const bridged = applyOpenAIToolBridge({ content: fullText }, { tools });
      if (bridged.openaiToolBridge?.applied && bridged.tool_calls?.length > 0) {
        nonStreamBody.choices[0].message.tool_calls = bridged.tool_calls;
        nonStreamBody.choices[0].message.content = bridged.content;
        nonStreamBody.choices[0].finish_reason = "tool_calls";
      }
    }

    return {
      response: new Response(JSON.stringify(nonStreamBody), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }),
      url: INFERENCE_URL,
      headers,
      transformedBody: payload,
    };
  }
}
