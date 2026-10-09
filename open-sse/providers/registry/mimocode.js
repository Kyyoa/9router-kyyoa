// MiMoCode (Xiaomi MiMo Auto free channel) — anonymous JWT, mirrors OpenCode Free.
// Auth: POST {bootstrap}/free-ai/bootstrap { client: <device fingerprint> } -> { jwt }.
// Chat: POST {transport.baseUrl} model "mimo-auto" with a MiMo identity system
// message, header Authorization Bearer <jwt> + X-Mimo-Source: mimocode-cli-free.
export default {
  id: "mimocode",
  priority: 45,
  hasFree: true,
  alias: "mimocode",
  uiAlias: "mimocode",
  aliases: ["mimocode-free", "mimo-auto", "mmf", "mimo-free"],
  display: {
    name: "MiMoCode Free",
    icon: "smart_toy",
    color: "#FF6900",
    textIcon: "MM",
  },
  category: "free",
  noAuth: true,
  transport: {
    baseUrl: "https://api.xiaomimimo.com/api/free-ai/openai/chat",
    headers: {
      "X-Mimo-Source": "mimocode-cli-free",
    },
    noAuth: true,
  },
  models: [
    {
      id: "mimo-auto",
      name: "MiMo Auto",
      contextLength: 1000000,
    },
  ],
  passthroughModels: true,
  // Upstream answers 400 Unsupported model for every chat request: the free
  // channel is closed on their side, so do not advertise it as usable.
  statusBadge: { label: "Unavailable", variant: "error" },
};
