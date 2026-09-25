<div align="center">

<img src="https://capsule-render.vercel.app/api?type=venom&height=200&color=0:f97815,100:c2590a&text=9Router+Kyyoa&fontSize=60&fontColor=ffffff&fontAlignY=38&animation=fadeIn" width="100%" alt="9Router Kyyoa" />

<img src="https://readme-typing-svg.demolab.com?font=Inter&weight=600&size=20&duration=3500&pause=1200&color=F97815&center=true&vCenter=true&width=640&height=50&lines=One+gateway%2C+any+model;OpenAI%E2%80%91compatible+endpoint;Speaks+Claude+and+Gemini+too;Kyyoa+edition%2C+free+for+everyone" alt="One gateway, any model" />

9router-kyyoa — Kyyoa's edition of the 9Router gateway: one endpoint, any model, with locked persona presets (temperature / top-p / max-tokens per custom model).

One gateway, one API key, any model: an OpenAI-compatible endpoint that routes to Claude, GPT, Gemini, Kimi, Qwen, GLM, DeepSeek, Grok and many more, with OAuth or your own accounts. Free for anyone to use.

![License](https://img.shields.io/badge/license-MIT-green) ![Release](https://img.shields.io/badge/releases-v0.1.x--Kyyoa-orange)

</div>

---

## Screenshots

<div align="center">

<img src="images/9router.png" alt="9Router dashboard" width="100%" />

</div>

## What it routes

The gateway accepts a request in OpenAI, Claude or Gemini shape, translates it to whatever the target provider speaks, and streams the answer back. Providers are grouped by how you sign in:

| Sign-in | Providers |
| --- | --- |
| OAuth | Claude, OpenAI Codex, Gemini CLI, Antigravity, Kiro, Kimi (Moonshot), Grok CLI, xAI, Cursor, GitHub Copilot, GitLab, Windsurf, Trae, Zed, iFlow, Qoder, Cline, KiloCode, CodeBuddy, Xiaomi MIMO |
| API key | OpenAI, Anthropic, DeepSeek, GLM (Z.ai / Zhipu), MiniMax, Mistral, Perplexity, Groq, Together, Fireworks, Cerebras, SambaNova, SiliconFlow, Nebius, Hugging Face, Venice, Voyage and dozens more |
| Free tier | OpenRouter, OpenCode, Kiro, Gemini, Cloudflare AI, NVIDIA, Morph, Poolside, Kimchi, LLM7, api-airforce |
| Web cookie | DeepSeek Web |
| Local | Ollama, LM Studio style self-hosted nodes, self-hosted TTS/STT/embeddings |

It is not only chat. The same gateway also serves text to image, image to text, video generation, text to speech, speech to text, embeddings, web search and web fetch, each with its own `/v1`-style endpoint.

## What this edition adds

**Custom Models with locked params.** Give any model your own name, system prompt, and optionally lock temperature / top-p / max-tokens — locked values override whatever the client sends, empty means the caller decides. Details in the dashboard under Custom Models.

**Compare Models.** Send one prompt to up to four models and compare speed, cost and output side by side, streaming live.

**Token Saver.** Compresses request context before it goes upstream, so long agent sessions spend fewer tokens.

## Getting started

Requirements: Node.js 22+ and npm.

```bash
git clone https://github.com/Kyyoa/9router-kyyoa.git
cd 9router-kyyoa
npm install
```

Create a `.env` file:

```bash
PORT=20130
INITIAL_PASSWORD=***
```

Build once, then start:

```bash
npm run build
npm run start -- --port 20130
```

Or with the env var (same thing):

```bash
PORT=20130 npm run start
```

Once it is running:

| | |
| --- | --- |
| Dashboard | `http://localhost:20130/dashboard` (first login uses `INITIAL_PASSWORD`, default `kyyoa123`) |
| OpenAI-compatible | `http://localhost:20130/v1` |
| Claude-compatible | `http://localhost:20130/v1/messages` |
| Gemini-native | `http://localhost:20130/v1beta/models/{model}:generateContent` |
| Health probe | `GET /api/health` |

First steps inside the dashboard:

1. Open **Providers** and connect your first provider (OAuth login or paste an API key).
2. Open **Endpoint & Key** and generate a client API key.
3. Point any OpenAI-compatible client at `http://localhost:20130/v1` with that key — done.
4. Optional: open **Custom Models** to give a model your own name + system prompt, or **Compare Models** to test several at once.

State lives in `~/.9router-kyyoa` (SQLite database, backups, secrets) via the `DATA_DIR` env var — set `DATA_DIR=/path/to/dir` to move it.

## Model names you can call

| Form | Example |
| --- | --- |
| Provider model | `kiro/claude-sonnet-4.5`, `kimi/kimi-k2.6`, `deepseek/deepseek-v4.1-pro` |
| Custom node | `mynode/gpt-oss-120b` |
| Combo | `my-combo` (fallback, round-robin, fusion and more) |
| Custom model | any name you define in Custom Models |

## Configuration

The app reads a few environment variables with sensible defaults; see [.env.example](./.env.example). State lives in `~/.9router-kyyoa` (SQLite database, backups, secrets) via `DATA_DIR`.

## Credits

- Built on **[Decolua/9router](https://github.com/Decolua/9router)** — full credit to upstream for the router, the providers and the translators.
- Fork releases are tagged in [CHANGELOG.md](./CHANGELOG.md).
- License: **MIT**, same as upstream. See [LICENSE](./LICENSE).

---

<div align="center">

If this fork helped you, a star is appreciated.

[![Stars](https://img.shields.io/github/stars/Kyyoa/9router-kyyoa?style=social)](https://github.com/Kyyoa/9router-kyyoa/stargazers)

</div>

<img src="https://capsule-render.vercel.app/api?type=waving&section=footer&height=140&color=0:c2590a,50:f97815,100:ffb347&animation=fadeIn" width="100%" alt="" />
