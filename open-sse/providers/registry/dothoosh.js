export default {
  id: "dothoosh",
  priority: 120,
  alias: "dothoosh",
  aliases: [
    "dh",
  ],
  uiAlias: "dothoosh",
  display: {
    name: "DotHoosh (دات‌هوش)",
    icon: "lightbulb",
    color: "#F4600C",
    textIcon: "DH",
    website: "https://gateway.dothoosh.com",
    notice: {
      text: "دات‌هوش: درگاه ایرانی مدل‌های هوش مصنوعی، سازگار با OpenAI و Anthropic، با پرداخت تومانی و کیف پول پیش‌پرداخت، بدون اشتراک ماهانه. — DotHoosh: Iranian AI gateway, OpenAI- and Anthropic-compatible, billed in Toman (IRT) from a prepaid wallet. One API key reaches every model; ids are bare (e.g. claude-sonnet-5-5, gpt-6.1-sol, gemini-4-argon, kimi-k3) and are fetched live per key.",
      apiKeyUrl: "https://gateway.dothoosh.com/api-keys",
    },
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    // Default lane: OpenAI Chat Completions. `thinkingFormat` is deliberately
    // NOT declared, so each model resolves its own wire format through
    // providers/capabilities.js.
    baseUrl: "https://gateway.dothoosh.com/v1/chat/completions",
    validateUrl: "https://gateway.dothoosh.com/v1/models",
  },
  // Multi-endpoint: pick the transport matching the client sourceFormat to skip
  // translation. DotHoosh serves all three protocols with one key, but verifies each
  // protocol per model, so `supportedFormats` guards each lane (chatCore).
  // The Anthropic lane accepts ONLY x-api-key (sending Authorization as well is
  // rejected) and pins anthropic-version to 2023-06-01; no beta headers are sent.
  transports: [
    { format: "openai", baseUrl: "https://gateway.dothoosh.com/v1/chat/completions", auth: { combined: true, header: "Authorization", scheme: "bearer" } },
    { format: "claude", baseUrl: "https://gateway.dothoosh.com/anthropic/v1/messages", auth: { combined: true, header: "x-api-key", scheme: "raw", anthropicVersion: true } },
    { format: "openai-responses", baseUrl: "https://gateway.dothoosh.com/v1/responses", auth: { combined: true, header: "Authorization", scheme: "bearer" } },
  ],
  // Mirrors DotHoosh's enabled production offerings. supportedFormats follows
  // each offering's published protocols: Claude models are served ONLY on the
  // Anthropic lane (targetFormat "claude" makes OpenAI-wire clients translate to
  // it), GPT models also on the Responses lane, everything else on Chat
  // Completions. No `modelsFetcher`: DotHoosh's /v1/models requires a key (it
  // lists only what that key may call), so the keyless suggestion fetch would
  // always 401. The per-connection model import (api/providers/[id]/models)
  // uses the key; other ids pass via passthroughModels.
  models: [
    { id: "claude-haiku-5-5", name: "Claude Haiku 5.5", contextLength: 100000, targetFormat: "claude", supportedFormats: ["claude"] },
    { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", contextLength: 1000000, targetFormat: "claude", supportedFormats: ["claude"] },
    { id: "claude-opus-5-5", name: "Claude Opus 5.5", contextLength: 1000000, targetFormat: "claude", supportedFormats: ["claude"] },
    { id: "claude-fable-5-1", name: "Claude Fable 5.1", contextLength: 1000000, targetFormat: "claude", supportedFormats: ["claude"] },
    { id: "gpt-6-luna", name: "GPT-6 Luna", contextLength: 272000, supportedFormats: ["openai", "openai-responses"] },
    { id: "gpt-6.1-sol", name: "GPT-6.1 Sol", contextLength: 272000, supportedFormats: ["openai", "openai-responses"] },
    { id: "gpt-6-astra", name: "GPT-6 Astra", contextLength: 272000, supportedFormats: ["openai", "openai-responses"] },
    { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash", contextLength: 200000, supportedFormats: ["openai"] },
    { id: "gemini-3.5-flash-lite", name: "Gemini 3.5 Flash-Lite", contextLength: 200000, supportedFormats: ["openai"] },
    { id: "gemini-4-argon", name: "Gemini 4 Argon", contextLength: 1048576, supportedFormats: ["openai"] },
    { id: "deepseek-flash", name: "DeepSeek V4.1 Flash", contextLength: 1048576, supportedFormats: ["openai", "claude"] },
    { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", contextLength: 1048576, supportedFormats: ["openai", "claude"] },
    { id: "kimi-k2.7-code", name: "Kimi K2.7 Code", contextLength: 262144, supportedFormats: ["openai"] },
    { id: "kimi-k2.6", name: "Kimi K2.6", contextLength: 262144, supportedFormats: ["openai"] },
    { id: "kimi-k3", name: "Kimi K3", contextLength: 1048576, supportedFormats: ["openai"] },
    { id: "glm-5.3", name: "GLM-5.3", contextLength: 1000000, supportedFormats: ["openai"] },
    { id: "glm-5.3-flash", name: "GLM-5.3-Flash", contextLength: 1000000, supportedFormats: ["openai"] },
    { id: "glm-5.3-flashx", name: "GLM-5.3-FlashX", contextLength: 1000000, supportedFormats: ["openai"] },
    { id: "glm-5.2", name: "GLM-5.2", contextLength: 1000000, supportedFormats: ["openai"] },
  ],
  passthroughModels: true,
};
