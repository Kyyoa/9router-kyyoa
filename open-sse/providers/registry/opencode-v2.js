export default {
  id: "opencode-v2",
  priority: 39,
  hasFree: true,
  alias: "oc2",
  uiAlias: "oc2",
  hidden: true,
  display: {
    name: "OpenCode Free",
    icon: "terminal",
    color: "#E87040",
    textIcon: "OC",
  },
  category: "free",
  noAuth: true,
  transport: {
    baseUrl: "https://opencode.ai",
    headers: {
      "x-opencode-client": "desktop",
    },
    forceStream: true,
    noAuth: true,
    // Zen reasoning models reject multi-turn history whose assistant messages
    // carry no reasoning_content (400 missing_required_parameter), and the
    // response pipeline strips the field before it reaches the client, so the
    // echo can never come from the client. Inject a placeholder instead.
    reasoningInject: {
      scope: "all",
    },
    quirks: {
      forceAutoToolChoiceModels: ["muse-spark-1.3-contributor-free"],
      // The free lane's MiMo route (OpenRouter-backed) streams thinking as
      // `reasoning` + `reasoning_details[]`, not reasoning_content. stream.js lifts
      // the alias into reasoning_content for OpenAI-shaped clients; every other
      // model on the lane already emits reasoning_content, so the lift is a no-op.
      reasoningAliasFields: true,
    },
  },
  models: [
    // Endpoint formats differ per model, so declare non-chat models explicitly.
    { id: "beam-free", name: "Beam Free" },
    { id: "big-pickle", name: "Big Pickle" },
    { id: "deepseek-v4.1-flash-free", name: "DeepSeek V4.1 Flash Free", supportedFormats: ["openai", "claude", "openai-responses"] },
    { id: "flint-40b-free", name: "Flint 40B Free" },
    { id: "glm-5.3-flash-free", name: "GLM-5.3-Flash Free" },
    { id: "mimo-v2.6-flash-free", name: "MiMo-V2.6-Flash Free" },
    { id: "muse-spark-1.2-contributor-free", name: "Muse Spark 1.2 Contributor Free", targetFormat: "openai-responses" },
    { id: "muse-spark-1.3-contributor-free", name: "Muse Spark 1.3 Contributor Free", targetFormat: "openai-responses" },
    { id: "union-alpha", name: "Union Alpha Free", targetFormat: "claude" },
  ],
  serviceKinds: ["llm"],
  modelsFetcher: { url: "https://opencode.ai/zen/v1/models", type: "opencode-free" },
  passthroughModels: true,
};
