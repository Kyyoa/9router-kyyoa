export default {
  id: "copilot-web",
  priority: 146,
  alias: "copilot-web",
  aliases: ["cpw", "copilot-cookie"],
  uiAlias: "cpw",
  display: {
    name: "Copilot Web",
    icon: "bolt",
    color: "#0078D4",
    textIcon: "CPW",
    website: "https://copilot.microsoft.com",
    notice: {
      apiKeyUrl: "https://copilot.microsoft.com",
    },
  },
  category: "webCookie",
  authType: "cookie",
  authHint: "Paste cookie _U dari copilot.microsoft.com (Buka copilot.microsoft.com -> F12 -> Application -> Storage -> Cookies -> cari '_U' -> copy nilainya)",
  transport: {
    baseUrl: "https://copilot.microsoft.com/c/api",
    format: "openai",
    authType: "cookie",
    auth: { header: "Cookie", scheme: "raw" },
  },
  models: [
    { id: "copilot-pro", name: "Copilot Pro (web)" },
    { id: "gpt-4o", name: "GPT-4o (via Copilot)" },
    { id: "gpt-4-turbo", name: "GPT-4 Turbo (via Copilot)" },
  ],
  passthroughModels: true,
};
