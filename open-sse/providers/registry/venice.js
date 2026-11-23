export default {
  id: "venice",
  priority: 157,
  alias: "venice",
  aliases: ["venice-ai", "veniceai"],
  uiAlias: "venice",
  category: "free",
  hasFree: true,
  noAuth: true,
  display: {
    name: "Venice AI (Keyless Webchat)",
    icon: "bolt",
    color: "#FF5500",
    textIcon: "VNC",
    website: "https://venice.ai",
    notice: {
      apiKeyUrl: "https://venice.ai",
    },
  },
  authType: "none",
  authModes: ["none"],
  transport: {
    baseUrl: "https://outerface.venice.ai/api/inference/chat",
    format: "venice",
    headers: {
      "Authorization": "",
    },
  },
  models: [
    { id: "deepseek-v4-1-flash-uncensored", name: "DeepSeek V4.1 Flash Uncensored (512K)", contextLength: 524288 },
    { id: "olafangensan-glm-4.7-flash-heretic", name: "GLM 4.7 Flash Heretic (200K)", contextLength: 200000 },
    { id: "venice-uncensored-1-2", name: "Venice Uncensored 1.2 (128K)", contextLength: 128000 },
    { id: "qwen3-coder-480b-a35b-instruct-turbo", name: "Qwen 3 Coder 480B Turbo (256K)", contextLength: 256000 },
    { id: "nvidia-nemotron-3-nano-30b-a3b", name: "NVIDIA Nemotron 3 Nano 30B (128K)", contextLength: 128000 },
    { id: "nvidia-nemotron-3-ultra-550b-a55b", name: "NVIDIA Nemotron 3 Ultra (256K)", contextLength: 256000 },
  ],
  passthroughModels: true,
};
