export default {
  id: "opencode",
  priority: 40,
  hasFree: true,
  alias: "oc",
  uiAlias: "oc",
  display: {
    name: "OpenCode Free",
    icon: "terminal",
    color: "#E87040",
    textIcon: "OC",
    // OpenCode free tier diblokir upstream sejak Oct 2026 (FreeTierError 403)
    // untuk semua POST request dari luar aplikasi native mereka.
    // OpenCode Go (berbayar) masih jalan — tambahkan di provider opencode-go.
    notice: {
      text: "OpenCode Free tidak dapat digunakan melalui gateway eksternal. OpenCode memblokir semua request di luar aplikasi resmi mereka (FreeTierError 403). Gunakan OpenCode Go (opencode-go) dengan subscription $5/mo, atau pilih provider gratis lain.",
      type: "error",
    },
  },
  category: "free",
  noAuth: true,
  // unavailable: true — semua model otomatis diblokir di model picker
  unavailable: true,
  unavailableReason:
    "OpenCode Free diblokir upstream kecuali user punya akun organisasi OpenCode. "
    + "Header spoof (x-opencode-client / ses_ / fingerprint tools) sudah lengkap tapi "
    + "tidak cukup — OpenCode mensyyaratkan org/workspace association yang hanya tersedia "
    + "lewat native OpenCode desktop app (lihat variabel env OPENCODE_PID di server). "
    + "Pakai OpenCode Go (bayar) dengan API key dari opencode.ai/auth, atau OpenCode Zen (PAYG).",
  transport: {
    baseUrl: "https://opencode.ai",
    headers: {
      "x-opencode-client": "desktop",
    },
    forceStream: true,
    noAuth: true,
    quirks: {
      forceAutoToolChoiceModels: [
        "muse-spark-1.2-contributor-free",
        "muse-spark-1.3-contributor-free",
      ],
    },
  },
  models: [
    // Endpoint formats differ per model, so declare non-chat models explicitly.
    // Muse Spark is served by /zen/v1/responses; everything else on chat/completions.
    { id: "muse-spark-1.2-contributor-free", name: "Muse Spark 1.2 Contributor Free", targetFormat: "openai-responses" },
    { id: "muse-spark-1.3-contributor-free", name: "Muse Spark 1.3 Contributor Free", targetFormat: "openai-responses" },
    { id: "jev-1.13-free", name: "Jev 1.13 Free", kind: "systemone" },
  ],
  serviceKinds: ["llm", "systemone"],
  systemoneConfig: {
    baseUrl: "https://opencode.ai/zen/v1/systemone",
    headers: {
      "x-opencode-client": "desktop",
      "User-Agent": "opencode/1.18.31",
    },
  },
  modelsFetcher: { url: "https://opencode.ai/zen/v1/models", type: "opencode-free" },
  passthroughModels: true,
};
