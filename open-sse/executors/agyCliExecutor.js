/**
 * agyCliExecutor.ts — the opt-in ACP transport for the `agy` / `antigravity` providers.
 *
 * Antigravity is normally reached over HTTP with a harvested OAuth token. This
 * executor instead drives the operator's own `agy` CLI over ACP
 * (`open-sse/services/agyCliAcp.ts`), which signs its own calls: the account,
 * the quota and the client fingerprint are the CLI's, so there is no token to
 * burn and no request shape to imitate. That is the anti-ban path.
 *
 * It is opt-in and stays opt-in. HTTP remains the default for both provider ids
 * and is untouched by this file:
 *
 *   - `AGY_CLI_TRANSPORT=acp` in the environment, or
 *   - `credentials.providerSpecificData.transport === "acp"` on the connection.
 *
 * The output side is ordinary: agy's reply is re-emitted as the same
 * Antigravity `candidates` frames the HTTP path produces, so response
 * translation, usage accounting and every client format downstream work exactly
 * as they do for HTTP. Nothing about this transport leaks into the caller.
 */
import { buildErrorBody } from "../utils/error.js";
import { ANTIGRAVITY_DEFAULT_SYSTEM } from "../config/appConstants.js";
import { AgyTurnError, runAgyPrompt, scheduleStandbyPrewarm } from "../services/agyCliAcp.js";
import { homeOf, inAccount } from "../services/agyCliPlatform.js";
import { antigravityBodyToMessages } from "../services/agyPromptRender.js";
import { classify429, decide429, SHORT_COOLDOWN_MS } from "../services/antigravity429Engine.js";
import { markConnectionQuotaExhausted } from "./antigravity.js";
/**
 * Which transport this request should take.
 *
 * HTTP is the default and the answer for anything unclear: a typo in the env
 * var must not silently move an operator's traffic onto a path that needs a CLI
 * installed and signed in. Only an explicit `acp` opts in.
 *
 * The connection's own `providerSpecificData` wins over the environment, so a
 * single account can be moved onto ACP (or off it) without restating the
 * deployment-wide default.
 */
export function resolveAgyTransport(credentials, env = process.env) {
    const settings = credentials?.providerSpecificData;
    const record = settings && typeof settings === "object" ? settings : null;
    const perConnection = record?.transport;
    if (typeof perConnection === "string") {
        return perConnection.trim().toLowerCase() === "acp" ? "acp" : "http";
    }
    return /^acp$/i.test((env.AGY_CLI_TRANSPORT || "").trim()) ? "acp" : "http";
}

if (!process.env.NEXT_PHASE && resolveAgyTransport(null) === "acp") {
    scheduleStandbyPrewarm();
}
/** The tools the client declared, from the translated Antigravity envelope. */
export function declaredTools(body) {
    const envelope = isRecord(body) ? body : {};
    const request = isRecord(envelope.request) ? envelope.request : envelope;
    const declarations = Array.isArray(request.tools)
        ? request.tools.flatMap((tool) => isRecord(tool) && Array.isArray(tool.functionDeclarations) ? tool.functionDeclarations : [])
        : [];
    return declarations.filter((entry) => isRecord(entry) && typeof entry.name === "string" && entry.name.length > 0);
}
/** The declared tools in the shape the bridge lists and agy calls them by. */
export function bridgeTools(body) {
    return declaredTools(body).map((tool) => {
        const out = { name: tool.name };
        if (typeof tool.description === "string")
            out.description = tool.description;
        // agy reads a tool's arguments from `inputSchema`; the translator writes
        // Gemini's `parameters`, which is the same JSON Schema under another name.
        if (isRecord(tool.parameters))
            out.inputSchema = tool.parameters;
        else if (isRecord(tool.inputSchema))
            out.inputSchema = tool.inputSchema;
        return out;
    });
}
function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
/** The model names agy reports for this provider, so a bare id is passed through. */
export function agyModelId(model) {
    return model.replace(/^(?:antigravity|agy|ag)\//, "");
}
function textPart(text) {
    return { text };
}
/** Gemini spells a tool call `functionCall`; a proxied caller needs the id too. */
function functionCallPart(call, index) {
    return {
        functionCall: {
            name: call.name,
            args: isRecord(call.arguments) ? call.arguments : {},
            // agy's own MCP layer does not mint a client-visible id, so one is made
            // here: the caller must be able to send the result back against it.
            id: `agy_call_${index}`,
        },
    };
}
/**
 * Turn one finished ACP turn into the parts of a single Antigravity candidate.
 *
 * Text and tool calls arrive together when the model narrates a call it is
 * about to make, so both are kept and in that order.
 */
function buildUsageMetadata(usage) {
    if (!isRecord(usage))
        return undefined;
    const promptTokenCount = Number(usage.promptTokens) || 0;
    const candidatesTokenCount = Number(usage.completionTokens) || 0;
    const thoughtsTokenCount = Number(usage.thoughtsTokens) || 0;
    const totalTokenCount = promptTokenCount + candidatesTokenCount + thoughtsTokenCount;
    if (totalTokenCount <= 0)
        return undefined;
    return {
        promptTokenCount,
        candidatesTokenCount,
        ...(thoughtsTokenCount > 0 ? { thoughtsTokenCount } : {}),
        totalTokenCount,
    };
}

export function replyParts(result) {
    const parts = [];
    if (result.thinking)
        parts.push({ text: result.thinking, thought: true });
    if (result.text)
        parts.push(textPart(result.text));
    result.toolCalls.forEach((call, index) => parts.push(functionCallPart(call, index)));
    const usageMetadata = buildUsageMetadata(result.usage);
    return {
        parts,
        finishReason: finishReasonOf(result.stopReason, result.toolCalls.length > 0),
        ...(usageMetadata ? { usageMetadata } : {}),
    };
}
/**
 * agy's stop reason as Gemini's `finishReason`.
 *
 * `tool_calls` is what makes the downstream translators open a tool-use block
 * instead of ending the message as prose, so it is decided by whether calls
 * were emitted rather than by agy's own wording.
 */
export function finishReasonOf(stopReason, hasToolCalls) {
    if (hasToolCalls)
        return "STOP";
    if (/max[_-]?tokens?|length/i.test(stopReason))
        return "MAX_TOKENS";
    if (/refus|block|safety/i.test(stopReason))
        return "SAFETY";
    return "STOP";
}
/** One Antigravity SSE frame, as `alt=sse` produces it. */
function sseFrame(response) {
    return `data: ${JSON.stringify({ response })}\n\n`;
}
/**
 * A whole turn as an SSE stream.
 *
 * The frame is wrapped in `response` because that is the envelope the HTTP path
 * sends, and `geminiToOpenAIResponse` unwraps it (`chunk.response || chunk`).
 */
export function agySseBody(model, reply) {
    return (sseFrame({
        candidates: [
            { content: { role: "model", parts: reply.parts }, finishReason: reply.finishReason },
        ],
        modelVersion: model,
        ...(reply.usageMetadata ? { usageMetadata: reply.usageMetadata } : {}),
    }) + "data: [DONE]\n\n");
}
/** The same turn as a single non-streaming Antigravity body. */
export function agyJsonBody(model, reply) {
    return {
        response: {
            candidates: [
                { content: { role: "model", parts: reply.parts }, finishReason: reply.finishReason },
            ],
            modelVersion: model,
            ...(reply.usageMetadata ? { usageMetadata: reply.usageMetadata } : {}),
        },
    };
}
// ── The failure surface ─────────────────────────────────────────────────────
/**
 * An agy failure as the response the caller sees.
 *
 * `AgyTurnError` already carries the HTTP status the transport derived from
 * agy's own words (a spent balance is 402, a turned-away system prompt is not a
 * 429 to retry), so this maps it onto exactly that status and never invents one.
 *
 * Hard Rule #12: the body is built by `buildErrorBody()`, never by handing the
 * caller raw error text.
 */
export function agyErrorResponse(error) {
    const status = error instanceof AgyTurnError ? error.status : 502;
    const message = error instanceof Error && error.message ? error.message : "agy: the turn failed with no detail";
    const type = status === 402 || status === 429
        ? "rate_limit_error"
        : status >= 500
            ? "provider_error"
            : "invalid_request_error";
    return new Response(JSON.stringify(buildErrorBody(status, message, undefined, { type })), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}
/** A stable conversation id so successive requests of one chat share a session. */
export function conversationKey(credentials, body) {
    const envelope = isRecord(body) ? body : {};
    const request = isRecord(envelope.request) ? envelope.request : envelope;
    if (typeof request.sessionId === "string" && request.sessionId)
        return request.sessionId;
    if (typeof envelope.sessionId === "string" && envelope.sessionId)
        return envelope.sessionId;
    // Without one the connection is its own conversation: agy keeps one session
    // per process, and a fresh process per request would lose every turn.
    return `connection:${credentials.connectionId || "default"}`;
}
/**
 * The client's system prompt.
 *
 * The translator leaves Antigravity's own default in `systemInstruction` and
 * moves the client's text into the first user part (#9030), so what survives
 * here is either that default — which is not the client's and must not be
 * replayed to agy as if it were — or a genuine session-level instruction.
 */
export function clientInstructions(system) {
    const text = system.trim();
    if (!text || text === ANTIGRAVITY_DEFAULT_SYSTEM.trim())
        return "";
    return text;
}
/**
 * Drive one completion through ACP and return the Antigravity response.
 *
 * Both failure layers are reported as responses rather than thrown: agy missing
 * from the host is an operational state with an actionable message, not a crash
 * of the request pipeline.
 */
const SSE_HEADERS = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
};

function recordQuotaIf429(error, connectionId, modelId) {
    if (error instanceof AgyTurnError && error.status === 429) {
        markConnectionQuotaExhausted(connectionId || "default", quotaCooldownMs(error.message), modelId);
    }
}

export async function executeViaAgyCli(request) {
    const { model, body, stream, credentials, signal } = request;
    const envelope = isRecord(body) ? body : {};
    const inner = isRecord(envelope.request) ? envelope.request : envelope;
    const parsed = antigravityBodyToMessages(body);
    const tools = bridgeTools(body);
    const modelId = agyModelId(model);
    const connectionId = credentials.connectionId || "default";
    // Empty workDir keeps agy in its isolated temp workspace instead of scanning xrouter's server repo
    const workDir = typeof inner.cwd === "string" && inner.cwd ? inner.cwd : "";
    const agyHome = isRecord(credentials?.providerSpecificData) ? homeOf(credentials.providerSpecificData.agyHome) : null;
    const url = `agy-cli://${modelId}`;

    try {
        if (!stream) {
            const runPrompt = () => runAgyPrompt({
                connectionId,
                conversationId: conversationKey(credentials, body),
                workDir,
                model: modelId,
                messages: parsed.messages,
                parts: parsed.messages.at(-1)?.parts ?? [],
                instructions: clientInstructions(parsed.system),
                tools,
                signal: signal ?? undefined,
            });
            const result = agyHome ? await inAccount(agyHome, runPrompt) : await runPrompt();
            const reply = replyParts(result);
            return {
                response: new Response(JSON.stringify(agyJsonBody(model, reply)), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                }),
                url,
            };
        }

        // True incremental SSE streaming: wait until the first live chunk arrives
        // (preserving pre-stream HTTP error codes like 429/402/400/500), then stream
        // tokens immediately to the client and cancel agy if the client disconnects.
        const encoder = new TextEncoder();
        const turnAbort = new AbortController();
        const onCallerAbort = () => turnAbort.abort();
        if (signal?.aborted) {
            turnAbort.abort();
        }
        else if (signal) {
            signal.addEventListener("abort", onCallerAbort, { once: true });
        }

        const queuedFrames = [];
        let streamController = null;
        let streamClosed = false;
        let streamCommitted = false;
        let resolveFirstEvent = null;
        const firstEventPromise = new Promise((resolve) => {
            resolveFirstEvent = resolve;
        });

        const pushRaw = (frameStr) => {
            if (streamClosed)
                return;
            const bytes = encoder.encode(frameStr);
            if (streamController) {
                try {
                    streamController.enqueue(bytes);
                }
                catch {
                    streamClosed = true;
                }
            }
            else {
                queuedFrames.push(bytes);
            }
        };

        const closeStream = () => {
            if (streamClosed)
                return;
            streamClosed = true;
            signal?.removeEventListener("abort", onCallerAbort);
            if (streamController) {
                try {
                    streamController.close();
                }
                catch { }
            }
        };

        const commitLiveChunk = (part) => {
            if (!streamCommitted) {
                streamCommitted = true;
                resolveFirstEvent?.({ kind: "stream" });
            }
            pushRaw(sseFrame({
                candidates: [{ content: { role: "model", parts: [part] } }],
                modelVersion: model,
            }));
        };

        const runStreamPrompt = () => runAgyPrompt({
            connectionId,
            conversationId: conversationKey(credentials, body),
            workDir,
            model: modelId,
            messages: parsed.messages,
            parts: parsed.messages.at(-1)?.parts ?? [],
            instructions: clientInstructions(parsed.system),
            tools,
            signal: turnAbort.signal,
            onThinking: (chunk) => {
                if (chunk)
                    commitLiveChunk({ text: chunk, thought: true });
            },
            onText: (chunk) => {
                if (chunk)
                    commitLiveChunk({ text: chunk });
            },
        });

        const turnPromise = agyHome ? inAccount(agyHome, runStreamPrompt) : runStreamPrompt();
        turnPromise.then((result) => {
            if (!streamCommitted) {
                resolveFirstEvent?.({ kind: "done", result });
                return;
            }
            const toolCallParts = result.toolCalls.map((call, index) => functionCallPart(call, index));
            const usageMetadata = buildUsageMetadata(result.usage);
            pushRaw(sseFrame({
                candidates: [
                    {
                        content: { role: "model", parts: toolCallParts },
                        finishReason: finishReasonOf(result.stopReason, toolCallParts.length > 0),
                    },
                ],
                modelVersion: model,
                ...(usageMetadata ? { usageMetadata } : {}),
            }));
            pushRaw("data: [DONE]\n\n");
            closeStream();
        }, (error) => {
            recordQuotaIf429(error, connectionId, modelId);
            if (!streamCommitted) {
                resolveFirstEvent?.({ kind: "error", error });
                return;
            }
            const status = error instanceof AgyTurnError ? error.status : 502;
            const message = error instanceof Error && error.message ? error.message : "agy: stream interrupted";
            const type = status === 402 || status === 429 ? "rate_limit_error" : status >= 500 ? "provider_error" : "invalid_request_error";
            pushRaw(`data: ${JSON.stringify(buildErrorBody(status, message, undefined, { type }))}\n\ndata: [DONE]\n\n`);
            closeStream();
        });

        const firstEvent = await firstEventPromise;
        if (firstEvent.kind === "error") {
            signal?.removeEventListener("abort", onCallerAbort);
            return { response: agyErrorResponse(firstEvent.error), url: "agy-cli://error" };
        }
        if (firstEvent.kind === "done") {
            signal?.removeEventListener("abort", onCallerAbort);
            const reply = replyParts(firstEvent.result);
            return {
                response: new Response(agySseBody(model, reply), {
                    status: 200,
                    headers: SSE_HEADERS,
                }),
                url,
            };
        }

        const readable = new ReadableStream({
            start(controller) {
                streamController = controller;
                for (const chunk of queuedFrames.splice(0)) {
                    controller.enqueue(chunk);
                }
                if (streamClosed) {
                    try {
                        controller.close();
                    }
                    catch { }
                }
            },
            cancel() {
                streamClosed = true;
                signal?.removeEventListener("abort", onCallerAbort);
                turnAbort.abort();
            },
        });

        return {
            response: new Response(readable, {
                status: 200,
                headers: SSE_HEADERS,
            }),
            url,
        };
    }
    catch (error) {
        recordQuotaIf429(error, connectionId, modelId);
        return { response: agyErrorResponse(error), url: "agy-cli://error" };
    }
}
/**
 * How long a quota failure should keep a model unselected.
 *
 * `decide429` owns the numbers, so the same message the HTTP path classifies
 * lands on the same cooldown: a bare 429 that names no quota is a short switch
 * of account, and a spent quota is the full one.
 */
export function quotaCooldownMs(message) {
    const decision = decide429(classify429(message), null);
    return decision.retryAfterMs ?? SHORT_COOLDOWN_MS;
}
