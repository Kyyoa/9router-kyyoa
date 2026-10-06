# PRD Asisten Pengisi + Layout Anti-Kosong Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Halaman PRD tidak ada area kosong yang mengganggu + ada kartu "Asisten Pengisi" (sesi chat dengan pilihan model) yang membantu user mengisi semua kotak dari awal sampai akhir, lalu AI auto-fill ke form saat user bilang matang.

**Architecture:** Kartu asisten baru `AssistantFillPanel.js` tinggal di kolom KIRI di bawah kartu Ide & Detail (menutup lubang kiri-bawah sebelah kartu Model). Isinya sesi chat bebas + tombol "Isi otomatis ke form". Saat diklik, transcript sesi dikirim ke model dengan prompt ekstraksi JSON, hasilnya di-merge ke `form` + `brief` + `enrichedBrief`. Layout dirapatkan: kolom seimbang, hasil + checklist punya min-height agar tidak ada lubang besar saat kosong.

**Tech Stack:** Next.js App Router (client components), `streamChatCompletion` dari `@/shared/utils/chatStream` (jalur sama seperti InterviewPanel + generate), `localStorage` tidak perlu (sesi asisten cukup state + ikut tersimpan saat PRD di-save sebagai bagian brief).

---

## Konteks saat ini (hasil inspeksi HTML live `:20130`)

- Grid atas `xl:grid-cols-2`: kiri = Wawancara + Ide & Detail, kanan = Bentuk dokumen + Model. Kanan lebih panjang → LUBANG di KIRI BAWAH (di bawah Ide & Detail, sebelah kartu Model). Itu posisi kartu Asisten Pengisi.
- Hasil full-width di bawah dengan empty-state pendek → saat belum generate, area bawah terlihat kopong.
- Checklist + tersimpan grid 2 kolom, tingginya tidak seimbang saat salah satu kosong.

## Pendekatan

1. **Tutup lubang kiri:** pasang `AssistantFillPanel` tepat di bawah kartu Ide & Detail (kolom kiri). Kolom kiri jadi: Wawancara → Ide & Detail → Asisten Pengisi. Tinggi kiri ≈ kanan.
2. **Rapatkan bawah:** empty-state hasil dikasih ilustrasi + langkah 1-2-3 (mengisi ruang secara bermakna, bukan spacer kosong), checklist + tersimpan disamakan min-height.
3. **Asisten ≠ Wawancara (bagi tugas jelas):** Wawancara = Q&A terstruktur 3 ronde untuk konteks PRD. Asisten = ngobrol bebas untuk mengisi 10 kotak detail + ide. Output asisten = JSON → auto-fill form. Keduanya menyatu di `effectiveBrief` + `form` saat Generate, tidak saling menimpa.

---

### Task 1: Tambah string asisten (ID/EN) ke `strings.js`

**Objective:** Semua teks kartu asisten ikut toggle bahasa halaman.

**Files:**
- Modify: `src/app/(dashboard)/dashboard/prd/strings.js` (tambah key di objek `id` + `en`)

**Step 1: Tambah key berikut di kedua bahasa**

```js
// id:
assistantTitle: "Asisten Pengisi",
assistantSub: "Ngobrol bebas — AI bantu isi kotak-kotak di halaman ini. Kalau udah matang, tekan isi otomatis.",
assistantPh: "Contoh: gw mau bikin aplikasi kasir warung, usernya ibuku yang gaptek...",
assistantSend: "Kirim",
assistantThinking: "Mikir...",
assistantFill: "Isi otomatis ke form",
assistantFilled: (n) => `${n} kotak terisi`,
assistantClear: "Hapus sesi",
assistantNeedModel: "Pilih model penulis dulu (panel Model di atas).",
assistantModelNote: "Pakai model penulis biar hemat — atau pilih khusus di bawah.",
assistantConfirm: "Timpa yang udah diisi?",
assistantEmpty: "Belum ada obrolan — tulis idemu di bawah, AI yang nanya balik.",
// en:
assistantTitle: "Fill Assistant",
assistantSub: "Free chat — the AI helps fill every box on this page. When it feels ripe, hit auto-fill.",
assistantPh: "Example: I want a cashier app for my non-technical mom...",
assistantSend: "Send",
assistantThinking: "Thinking...",
assistantFill: "Auto-fill the form",
assistantFilled: (n) => `${n} boxes filled`,
assistantClear: "Clear session",
assistantNeedModel: "Pick the writer model first (Models panel above).",
assistantModelNote: "Uses the writer model to save cost — or pick a dedicated one below.",
assistantConfirm: "Overwrite what is already filled?",
assistantEmpty: "No chat yet — type your idea below, the AI asks back.",
```

**Step 2: Verifikasi** — `node --check src/app/\(dashboard\)/dashboard/prd/strings.js`, expected: no output (exit 0).

**Step 3: Commit** — `git commit -m "feat(prd): strings asisten pengisi ID/EN"` (gabung dengan Task 3 boleh, jangan commit per 5 baris).

---

### Task 2: Prompt ekstraksi JSON (`prompt.js` — 2 fungsi baru)

**Objective:** Model bisa mengubah transcript obrolan bebas jadi JSON 11 field yang cocok dengan `EMPTY_FORM` + `brief`.

**Files:**
- Modify: `src/app/(dashboard)/dashboard/prd/prompt.js` (append di bawah, jangan ubah fungsi lama)

**Step 1: Tambah kode ini di akhir file**

```js
export const FILL_FIELDS = ["product","users","problem","stack","timeline","team","constraints","nonGoals","metrics","notes"];

/** Mengubah transcript sesi asisten jadi isian form. */
export function buildFillMessages({ transcript, current, language }) {
  const langLine = language === "id"
    ? "Tulis nilai dalam Bahasa Indonesia santai."
    : "Write values in English.";
  return [
    {
      role: "system",
      content: [
        "Kamu asisten pengisi form PRD. Dari transcript obrolan, isi field berikut.",
        langLine,
        "Output HANYA satu objek JSON valid, tanpa markdown fence, tanpa komentar.",
        'Keys: brief (1-3 kalimat ide utuh) + product, users, problem, stack, timeline, team, constraints, nonGoals, metrics, notes.',
        "Field yang tidak diketahui isi string kosong. Jangan halu: kosongkan daripada ngarang angka/nama.",
        `Isian yang sudah ada (jangan rusak kecuali transcript mengubahnya): ${JSON.stringify(current || {})}`,
      ].join("\n"),
    },
    { role: "user", content: `TRANSCRIPT:\n${transcript}` },
  ];
}

/** Parse output model jadi objek aman (toleran fence + teks nyasar). */
export function parseFillJson(text) {
  const raw = String(text || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return {};
  try {
    const obj = JSON.parse(raw.slice(start, end + 1));
    const out = {};
    for (const k of [...FILL_FIELDS, "brief"]) {
      if (typeof obj[k] === "string" && obj[k].trim()) out[k] = obj[k].trim().slice(0, 2000);
    }
    return out;
  } catch { return {}; }
}
```

**Step 2: Verifikasi**

```bash
node --check src/app/\(dashboard\)/dashboard/prd/prompt.js
node -e "import('./src/app/(dashboard)/dashboard/prd/prompt.js').then(m=>{console.log(typeof m.buildFillMessages, typeof m.parseFillJson, JSON.stringify(m.parseFillJson('{\"brief\":\"kasir\",\"users\":\"ibuku\"}')))})"
```

Expected: `function function {"brief":"kasir","users":"ibuku"}`.

---

### Task 3: Komponen `AssistantFillPanel.js` (baru)

**Objective:** Kartu chat sesi + tombol auto-fill. Pakai model penulis biar hemat, dengan opsi override model khusus.

**Files:**
- Create: `src/app/(dashboard)/dashboard/prd/AssistantFillPanel.js`

**Step 1: Buat file dengan isi berikut**

```jsx
"use client";
import { useState, useRef } from "react";
import PropTypes from "prop-types";
import { Card, Button, Input } from "@/shared/components";
import { streamChatCompletion } from "@/shared/utils/chatStream";
import { buildFillMessages, parseFillJson } from "./prompt.js";
import { STRINGS } from "./strings.js";

export default function AssistantFillPanel({ uiLang = "id", docLang = "id", model, apiKey, onFill, disabled }) {
  const st = STRINGS[uiLang] || STRINGS.id;
  const [msgs, setMsgs] = useState([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [filling, setFilling] = useState(false);
  const [error, setError] = useState("");
  const [filled, setFilled] = useState(0);
  const boxRef = useRef(null);

  const systemMsg = {
    role: "system",
    content: uiLang === "id"
      ? "Kamu asisten ramah yang membantu user awam mengisi form PRD. Tanya SATU hal dalam satu balasan, kasih contoh konkret, boleh user jawab 'lewat'. Jangan tulis PRD, tugasmu hanya melengkapi info: ide, user, masalah, batasan, fitur, target. Bahasa Indonesia santai."
      : "You are a friendly assistant helping a non-technical user fill a PRD form. Ask ONE thing per reply with a concrete example; user may answer 'skip'. Do not write the PRD, only gather: idea, users, problem, constraints, features, target. English.",
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || busy || disabled) return;
    if (!model) { setError(st.assistantNeedModel); return; }
    setError("");
    const next = [...msgs, { role: "user", content: text }];
    setMsgs(next);
    setDraft("");
    setBusy(true);
    try {
      let acc = "";
      const { text: done } = await streamChatCompletion({
        model, apiKey, stream: true,
        messages: [systemMsg, ...next],
        onDelta: (c) => { acc += c; setMsgs([...next, { role: "assistant", content: acc }]); },
      });
      const finalText = done || acc;
      setMsgs([...next, { role: "assistant", content: finalText }]);
    } catch (err) { setError(err?.message || st.interviewFail); } finally { setBusy(false); }
  };

  const autoFill = async () => {
    if (!model || filling || disabled || msgs.length === 0) return;
    setFilling(true);
    setError("");
    try {
      const transcript = msgs.map((m) => `${m.role === "user" ? "USER" : "AI"}: ${m.content}`).join("\n");
      const { text } = await streamChatCompletion({
        model, apiKey, stream: false,
        messages: buildFillMessages({ transcript, current: {}, language: docLang }),
      });
      const obj = parseFillJson(text);
      const n = Object.keys(obj).length;
      setFilled(n);
      if (n > 0) onFill?.(obj);
      else setError(st.emptyAnswer);
    } catch (err) { setError(err?.message || st.taskFail); } finally { setFilling(false); }
  };

  return (
    <Card padding="md" className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-text-main">{st.assistantTitle}</h2>
        {filled > 0 && <span className="text-[11px] text-green-600">{st.assistantFilled(filled)}</span>}
      </div>
      <p className="text-[11px] text-text-muted -mt-2">{st.assistantSub}</p>
      <div ref={boxRef} className="flex max-h-64 min-h-32 min-w-0 flex-col gap-2 overflow-y-auto custom-scrollbar rounded-lg bg-black/5 dark:bg-white/5 p-2.5">
        {msgs.length === 0 && <p className="text-[11px] text-text-muted">{st.assistantEmpty}</p>}
        {msgs.map((m, i) => (
          <div key={i} className={`max-w-[90%] rounded-lg px-2.5 py-1.5 text-xs leading-relaxed ${m.role === "user" ? "self-end bg-primary/15 text-text-main" : "self-start bg-surface-2 text-text-main"}`}>
            <pre className="whitespace-pre-wrap break-words font-sans">{m.content}</pre>
          </div>
        ))}
        {busy && <p className="text-[11px] text-text-muted animate-pulse">{st.assistantThinking}</p>}
      </div>
      <div className="flex gap-2">
        <Input value={draft} onChange={(e) => setDraft(e.target.value)}
          placeholder={st.assistantPh} className="min-w-0 flex-1"
          disabled={disabled || busy}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <Button size="sm" variant="primary" disabled={disabled || busy || !draft.trim()} onClick={send}>{st.assistantSend}</Button>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" icon="auto_fix_high"
          disabled={disabled || filling || msgs.length === 0 || !model} onClick={autoFill}>
          {filling ? st.assistantThinking : st.assistantFill}
        </Button>
        <Button size="sm" variant="ghost" disabled={disabled || msgs.length === 0}
          onClick={() => { setMsgs([]); setFilled(0); setError(""); }}>{st.assistantClear}</Button>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </Card>
  );
}

AssistantFillPanel.propTypes = {
  uiLang: PropTypes.string,
  docLang: PropTypes.string,
  model: PropTypes.string,
  apiKey: PropTypes.string,
  onFill: PropTypes.func,
  disabled: PropTypes.bool,
};
```

**Step 2: Verifikasi** — `node --check` file baru, expected exit 0.

---

### Task 4: Pasang panel di kolom kanan + wire auto-fill ke form

**Objective:** Lubang kanan tertutup + hasil obrolan masuk ke kotak yang tepat.

**Files:**
- Modify: `src/app/(dashboard)/dashboard/prd/page.js`

**Step 1: Import** (di bawah import InterviewPanel):

```js
import AssistantFillPanel from "./AssistantFillPanel.js";
```

**Step 2: Handler** (di bawah `setField`):

```js
const applyAssistantFill = (obj) => {
  setForm((prev) => {
    const next = { ...prev };
    for (const k of ["product","users","problem","stack","timeline","team","constraints","nonGoals","metrics","notes"]) {
      if (obj[k]) next[k] = obj[k];
    }
    return next;
  });
  if (obj.brief) {
    setBrief((prev) => (prev.trim() ? prev : obj.brief));
    setEnrichedBrief((prev) => (prev ? `${prev}\n${obj.brief}` : obj.brief));
  }
  setShowDetails(true);
};
```

**Step 3: Render** — pasang di kolom KIRI paling bawah (tepat setelah penutup `</Card>` Ide & Detail, sebelum penutup `</div>` kolom kiri — cari pola `</Card>\n        </div>\n\n        <div className="flex min-w-0 flex-col gap-4">` yang pertama, sisipkan di antara `</Card>` dan `</div>`):

```jsx
<AssistantFillPanel
  uiLang={uiLang}
  docLang={language}
  model={model}
  apiKey={activeApiKey}
  disabled={running}
  onFill={applyAssistantFill}
/>
```

**Step 4: Verifikasi** — `node --check` page.js, expected exit 0.

---

### Task 5: Layout anti-kosong (tanpa spacer buatan)

**Objective:** Tidak ada lubang besar di semua state (kosong / wawancara jalan / hasil ada).

**Files:**
- Modify: `src/app/(dashboard)/dashboard/prd/page.js` (kelas CSS saja, tidak ada state baru)

**Step 1: Empty-state hasil bermakna** — ganti blok empty (`emptyTitle`/`emptySub`) jadi 3 langkah bernomor:

```jsx
<div className="flex min-w-0 flex-col items-center gap-2 px-6 py-14 text-center">
  {/* icon + title tetap */}
  <ol className="flex max-w-md flex-col gap-1 text-left text-xs text-text-muted">
    <li>1. {uiLang === "id" ? "Ceritakan idemu — lewat wawancara atau ngobrol dengan asisten." : "Tell your idea — via interview or assistant chat."}</li>
    <li>2. {uiLang === "id" ? "Pilih model penulis, tekan Bikin PRD." : "Pick a writer model, hit Generate."}</li>
    <li>3. {uiLang === "id" ? "Hasil muncul di sini + checklist bagian." : "The result lands here with a section checklist."}</li>
  </ol>
</div>
```

**Step 2: Samakan min-height bawah** — tambah `min-h-40` ke Card checklist + Card tersimpan agar sejajar saat salah satu kosong.

**Step 3: Verifikasi visual** — buka `/dashboard/prd` login, cek 3 state: (a) fresh load kolom kanan penuh tanpa lubang, (b) chat 3 pesan tidak overflow (scroll dalam kartu), (c) hasil generate mendorong ke bawah, tidak ada overlap.

---

### Task 6: Verifikasi akhir + commit + rilis

**Objective:** Bukti berfungsi sebelum rilis.

**Step 1: Syntax semua file**

```bash
cd /home/kyyoa/Projects/9router-kyyoa && node --check src/app/\(dashboard\)/dashboard/prd/page.js && node --check src/app/\(dashboard\)/dashboard/prd/AssistantFillPanel.js && node --check src/app/\(dashboard\)/dashboard/prd/prompt.js && node --check src/app/\(dashboard\)/dashboard/prd/strings.js && echo SYNTAX_OK
```

**Step 2: Fungsional (semi-otomatis, API login)**

```bash
AUTH_COOKIE=$(curl -s -D - -o /dev/null -m 10 -X POST http://127.0.0.1:20130/api/auth/login -H 'Content-Type: application/json' -d '{"password":"kyyoa123"}' | grep -i set-cookie | tr -d '\r' | sed 's/Set-Cookie: //i' | cut -d';' -f1 | paste -sd'; ')
curl -s -m 15 http://127.0.0.1:20130/dashboard/prd -H "Cookie: $AUTH_COOKIE" | grep -o "Asisten Pengisi\|Isi otomatis\|Ngobrol bebas" | sort | uniq -c
```

Expected: ketiga string muncul ≥1.

**Step 3: Uji auto-fill beneran** — di browser: chat 3-4 pesan tentang ide warung → klik Isi otomatis → 10 kotak detail kebuka (`showDetails=true`) dan terisi + brief terisi. Generate 1 PRD mini (template feature, depth standard) untuk memastikan `form` baru tidak merusak `buildPrdMessages`.

**Step 4: Build + restart + commit**

```bash
npm run build # exit 0, route /dashboard/prd ada
git add -A && git commit -m "feat(prd): asisten pengisi + auto-fill + layout anti-kosong" && git push origin master
```

---

## Risks / Tradeoffs

| Risiko | Mitigasi |
|---|---|
| Asisten tumpang tindih dengan Wawancara (user bingung pakai yang mana) | Bagi tugas di subtitle: wawancara = terstruktur 3 ronde, asisten = ngobrol bebas isi kotak. Keduanya opsional, bisa salah satu saja. |
| Auto-fill menimpa isian manual | `applyAssistantFill`: brief hanya diisi jika kosong; field form ditimpa hanya yang non-kosong dari AI. Tidak ada merge diam-diam. |
| Biaya token 2x (chat + ekstraksi) | Default pakai model penulis (gratis oke); ekstraksi 1 call kecil non-streaming. |
| JSON nyasar (model ngomong, bukan JSON) | `parseFillJson` toleran fence + cari `{...}` pertama-terakhir; gagal = `{}` + pesan `emptyAnswer`, form tidak tersentuh. |
| Layout tambah kartu = halaman makin panjang di HP | Chat box `max-h-64` scroll internal; di mobile grid collapse 1 kolom berurutan (wawancara → ide → bentuk → model → asisten → hasil). |

## Open questions (untuk Kyyoa, tidak menghambat implementasi)

1. Asisten pakai model penulis (hemat, default) atau model khusus (tajam)? — Plan default: penulis, tanpa picker tambahan (YAGNI).
2. Auto-fill timpa vs gabung untuk field yang sudah diisi manual? — Plan default: AI menang hanya untuk field yang AI isi non-kosong; brief tidak ditimpa jika sudah ada.
3. Perlu tombol "isi per-field" (misal tombol kecil per kotak) atau cukup 1 tombol global? — Plan: 1 tombol global dulu; per-field hanya jika user minta.
