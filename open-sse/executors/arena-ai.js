import { BaseExecutor } from "./base.js";
import { proxyAwareFetch } from "../utils/proxyFetch.js";
import crypto from "node:crypto";

const ARENA_BASE_URL = "https://arena.ai";
const EVAL_STREAM_URL = `${ARENA_BASE_URL}/nextjs-api/stream/create-evaluation`;

const ARENA_MODEL_MAP = {
  "gpt-5.5-instant": "019e71ea-1e1d-740f-9c2d-dab5869ff108",
  "gpt-5.5": "019e71ea-1e1d-740f-9c2d-dab5869ff108",
  "gemini-3.1-pro-preview": "019c7820-5480-78b6-9fef-04c0d7004054",
  "gemini-3.1-pro": "019c7820-5480-78b6-9fef-04c0d7004054",
  "gemini-3.6-flash": "019f90b1-c0ac-71ce-b295-487f261bf0f4",
  "gemini-3-flash": "019b47da-49b9-7295-906c-ce44ccd30d74",
  "grok-4.20-beta-0309-reasoning": "019ce35a-fa6f-7262-8ee2-ed4442821ce7",
  "grok-4.20": "019ce35a-fa6f-7262-8ee2-ed4442821ce7",
  "glm-5": "019c45d7-96f0-7d39-8143-9d57941b5523",
  "qwen3.7-plus": "019e86fe-167d-77bd-94a8-df7aee4f4551",
  "gpt-5.1-high": "019a8548-a2b1-70ce-b1be-eba096d41f58",
  "gemini-3.5-flash-lite": "019f90b1-cae9-786a-91a2-f3ee4c6cbf61",
  "gpt-5.4-mini-high": "019cfcdd-5426-777e-8314-04619cb92cc4",
  "gemini-2.5-pro": "0199f060-b306-7e1f-aeae-0ebb4e3f1122",
  "glm-4.7": "019becd0-af81-7883-a7ca-5c4a4e42ff7a",
  "minimax-m3": "019e809d-f62d-7192-bb7f-1657e066b5f2",
  "kimi-k2-thinking-turbo": "019a59bc-8bb8-7933-92eb-fe143770c211",
  "o3-2025-04-16": "cb0f1e24-e8e9-4745-aabc-b926ffde7475",
  "o3": "cb0f1e24-e8e9-4745-aabc-b926ffde7475",
  "claude-haiku-4-5-20251001": "0199e8e9-01ed-73e0-96ba-cf43b286bf10",
  "deepseek-v3": "019b9784-470e-75b9-b2fb-f005d78972e1",
  "deepseek-r1": "019a59bc-8bb8-7933-92eb-fe143770c211",
};

export function extractUserToken(raw) {
  if (!raw) return "";
  let str = String(raw).trim();
  try {
    const parsed = JSON.parse(str);
    if (typeof parsed?.token === "string") return parsed.token.trim();
    if (typeof parsed?.apiKey === "string") return parsed.apiKey.trim();
    if (typeof parsed?.value === "string") return parsed.value.trim();
  } catch {}
  if (str.startsWith("Bearer ")) str = str.slice(7).trim();
  return str.replace(/^["']|["']$/g, "").trim();
}

function errorResponse(status, message) {
  return new Response(
    JSON.stringify({
      error: {
        message,
        type: "arena_ai_error",
        code: status,
      },
    }),
    {
      status,
      headers: { "Content-Type": "application/json" },
    }
  );
}

export class ArenaAIExecutor extends BaseExecutor {
  constructor() {
    super("arena-ai", { baseUrl: ARENA_BASE_URL });
  }

  async execute({ model, body, stream, credentials, signal, log, proxyOptions = null }) {
    const bodyObj = body || {};
    const rawCreds = credentials || {};
    const userToken = extractUserToken(rawCreds.apiKey || rawCreds.token);

    if (!userToken) {
      return {
        response: errorResponse(401, "Arena AI User Token is required. Please set up a valid user token or session cookie."),
        url: EVAL_STREAM_URL,
        headers: {},
        transformedBody: body,
      };
    }

    const modelName = String(model || "").replace(/^(arena-ai\/|arena\/)/, "").toLowerCase();
    const targetModelAId = ARENA_MODEL_MAP[modelName] || ARENA_MODEL_MAP[model] || model;

    // Convert OpenAI messages to text prompt
    let prompt = "";
    if (Array.isArray(bodyObj.messages)) {
      prompt = bodyObj.messages
        .map((m) => {
          const role = m.role === "assistant" ? "Assistant" : m.role === "system" ? "System" : "User";
          const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
          return `${role}: ${content}`;
        })
        .join("\n\n");
    } else {
      prompt = String(bodyObj.prompt || "");
    }

    const sessionId = crypto.randomUUID();
    const userMsgId = crypto.randomUUID();
    const modelMsgId = crypto.randomUUID();

    const payload = {
      id: sessionId,
      mode: "direct",
      modelAId: targetModelAId,
      userMessageId: userMsgId,
      modelAMessageId: modelMsgId,
      userMessage: {
        content: prompt,
        experimental_attachments: [],
      },
      modality: "text",
    };

    const headers = {
      "Content-Type": "application/json",
      Accept: "text/event-stream, application/json, text/plain, */*",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Origin: ARENA_BASE_URL,
      Referer: `${ARENA_BASE_URL}/`,
    };

    if (userToken.includes("=")) {
      headers["Cookie"] = userToken;
    } else {
      headers["Cookie"] = `evaluation_session=${userToken}; agentic_session=${userToken}`;
      headers["Authorization"] = `Bearer ${userToken}`;
    }

    let upstreamRes;
    try {
      upstreamRes = await proxyAwareFetch(EVAL_STREAM_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal,
      }, proxyOptions);
    } catch (err) {
      return {
        response: errorResponse(502, `Failed to connect to Arena AI: ${err.message}`),
        url: EVAL_STREAM_URL,
        headers: {},
        transformedBody: payload,
      };
    }

    if (!upstreamRes.ok) {
      const errText = await upstreamRes.text().catch(() => "");
      let parsedMsg = errText;
      try {
        const errJson = JSON.parse(errText);
        if (errJson.code === "LOGIN_GATE" || upstreamRes.status === 401) {
          parsedMsg = "Arena AI User Token is expired or invalid. Please re-authenticate via farm script or update token.";
        } else if (errJson.error) {
          parsedMsg = typeof errJson.error === "string" ? errJson.error : JSON.stringify(errJson.error);
        }
      } catch {}

      return {
        response: errorResponse(upstreamRes.status, `Arena AI Error (${upstreamRes.status}): ${parsedMsg}`),
        url: EVAL_STREAM_URL,
        headers: {},
        transformedBody: payload,
      };
    }

    const id = `chatcmpl-arn-${Date.now()}`;
    const created = Math.floor(Date.now() / 1000);

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
                if (!trimmed || trimmed.startsWith(":")) continue;

                let textChunk = "";
                if (trimmed.startsWith("data:")) {
                  const dataStr = trimmed.slice(5).trim();
                  if (dataStr === "[DONE]") continue;
                  try {
                    const parsed = JSON.parse(dataStr);
                    textChunk = parsed.text || parsed.content || parsed.delta || "";
                  } catch {
                    textChunk = dataStr;
                  }
                } else {
                  textChunk = trimmed;
                }

                if (textChunk) {
                  const sseChunk = {
                    id,
                    object: "chat.completion.chunk",
                    created,
                    model,
                    choices: [
                      {
                        index: 0,
                        delta: { content: textChunk },
                        finish_reason: null,
                      },
                    ],
                  };
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(sseChunk)}\n\n`));
                }
              }
            }

            // End chunk
            const finalChunk = {
              id,
              object: "chat.completion.chunk",
              created,
              model,
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
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        }),
        url: EVAL_STREAM_URL,
        headers: {},
        transformedBody: payload,
      };
    }

    // Non-streaming mode: collect full text
    const fullText = await upstreamRes.text().catch(() => "");
    const completion = {
      id,
      object: "chat.completion",
      created,
      model,
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
        prompt_tokens: prompt.length / 4,
        completion_tokens: fullText.length / 4,
        total_tokens: (prompt.length + fullText.length) / 4,
      },
    };

    return {
      response: new Response(JSON.stringify(completion), {
        headers: { "Content-Type": "application/json" },
      }),
      url: EVAL_STREAM_URL,
      headers: {},
      transformedBody: payload,
    };
  }
}
