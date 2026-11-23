export default {
  id: "yuanbao-web",
  priority: 148,
  alias: "yuanbao-web",
  aliases: ["ybw", "tencent-yuanbao"],
  uiAlias: "ybw",
  display: {
    name: "Tencent Yuanbao Web",
    icon: "bolt",
    color: "#0052D9",
    textIcon: "YBW",
    website: "https://yuanbao.tencent.com",
    notice: {
      apiKeyUrl: "https://yuanbao.tencent.com",
    },
  },
  category: "webCookie",
  authType: "cookie",
  authHint: "Paste your session cookie header from yuanbao.tencent.com",
  transport: {
    baseUrl: "https://yuanbao.tencent.com/api",
    format: "openai",
    authType: "cookie",
    auth: { header: "Cookie", scheme: "raw" },
  },
  models: [
    { id: "deepseek-v3", name: "DeepSeek V3 (via Yuanbao)" },
    { id: "deepseek-r1", name: "DeepSeek R1 (via Yuanbao)" },
    { id: "hunyuan", name: "Hunyuan (via Yuanbao)" },
    { id: "hunyuan-t1", name: "Hunyuan T1 (via Yuanbao)" },
  ],
  passthroughModels: true,
};
