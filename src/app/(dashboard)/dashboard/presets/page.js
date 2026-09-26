"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, Button } from "@/shared/components";
import { useNotificationStore } from "@/store/notificationStore";

// Preset system-prompt siap pakai (Bahasa Indonesia).
// Klik "Salin" lalu tempel ke systemPrompt Custom Model
// (dashboard → Custom Models → tambah/edit → Advanced).
const PRESETS = [
  {
    key: "coder",
    title: "Ngoding",
    icon: "code",
    iconColor: "text-emerald-500",
    iconBg: "bg-emerald-500/10 border-emerald-500/20",
    desc: "Buat nulis & benerin kode. Jawaban: kode dulu, penjelasan pendek.",
    prompt:
      "Kamu asisten programmer senior. Jawab dengan kode yang jalan + penjelasan singkat. Kalau ada bug, kasih tau penyebabnya dalam 1-2 kalimat lalu kasih kode yang sudah dibetulkan. Jangan ceramah panjang.",
  },
  {
    key: "reviewer",
    title: "Reviewer Kode",
    icon: "rate_review",
    iconColor: "text-amber-500",
    iconBg: "bg-amber-500/10 border-amber-500/20",
    desc: "Bedah kode: bug, keamanan, performa. Format rapi per poin.",
    prompt:
      "Kamu code reviewer yang galak tapi adil. Periksa kode yang diberikan dan jawab dengan format: [BUG] daftar bug + barisnya, [AMAN] masalah keamanan kalau ada, [CEPAT] saran performa, [SKOR] nilai 1-10. Tegas, tanpa basa-basi.",
  },
  {
    key: "sql",
    title: "SQL Helper",
    icon: "database",
    iconColor: "text-blue-500",
    iconBg: "bg-blue-500/10 border-blue-500/20",
    desc: "Tulis & optimasi query. Selalu kasih query + penjelasan index.",
    prompt:
      "Kamu ahli SQL. Setiap jawaban berisi: query yang benar, penjelasan singkat cara kerjanya, dan saran index kalau query-nya berat. Tanya dialek (Postgres/MySQL/SQLite) kalau belum jelas.",
  },
  {
    key: "translator",
    title: "Penerjemah",
    icon: "translate",
    iconColor: "text-purple-500",
    iconBg: "bg-purple-500/10 border-purple-500/20",
    desc: "Terjemahan natural ID↔EN, jaga istilah teknis.",
    prompt:
      "Kamu penerjemah profesional Indonesia-Inggris. Terjemahkan secara natural (bukan kata-per-kata), pertahankan istilah teknis/code apa adanya, dan pertahankan format aslinya. Output hanya hasil terjemahan.",
  },
  {
    key: "docs",
    title: "Penulis Docs",
    icon: "description",
    iconColor: "text-cyan-500",
    iconBg: "bg-cyan-500/10 border-cyan-500/20",
    desc: "Bikin dokumentasi: README, komentar kode, changelog.",
    prompt:
      "Kamu penulis dokumentasi teknis. Tulis dengan struktur: ringkasan 2 kalimat, cara pakai (langkah bernomor + contoh kode), dan catatan penting. Bahasa Indonesia yang jelas, format markdown.",
  },
  {
    key: "regex",
    title: "Regex & Parsing",
    icon: "regular_expression",
    iconColor: "text-rose-500",
    iconBg: "bg-rose-500/10 border-rose-500/20",
    desc: "Bikin pola regex + contoh cocok / tidak cocok.",
    prompt:
      "Kamu ahli regex. Setiap jawaban berisi: pola regex dalam code block, penjelasan tiap bagian pola, 2 contoh string yang COCOK dan 2 yang TIDAK cocok. Tanya dulu engine-nya (JS/Python/Go) kalau belum jelas.",
  },
];

export default function PresetsPage() {
  const [copiedKey, setCopiedKey] = useState(null);
  const addNotification = useNotificationStore((state) => state.addNotification);

  const copyPreset = async (preset) => {
    try {
      await navigator.clipboard.writeText(preset.prompt);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = preset.prompt;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopiedKey(preset.key);
    setTimeout(() => setCopiedKey((k) => (k === preset.key ? null : k)), 2000);
    addNotification?.({
      type: "success",
      title: "Preset disalin",
      message: `"${preset.title}" siap ditempel ke systemPrompt Custom Model.`,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-main">Preset Prompts</h1>
        <p className="text-sm text-text-muted mt-1">
          Prompt siap pakai — salin lalu tempel ke systemPrompt di Custom Models
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {PRESETS.map((preset) => (
          <Card key={preset.key} className="flex flex-col h-full">
            <div className="flex items-center gap-3 mb-3">
              <div
                className={`size-10 rounded-xl flex items-center justify-center border shrink-0 ${preset.iconBg}`}
              >
                <span
                  className={`material-symbols-outlined text-[22px] leading-none ${preset.iconColor}`}
                >
                  {preset.icon}
                </span>
              </div>
              <h3 className="font-semibold text-base text-text-main">
                {preset.title}
              </h3>
            </div>

            <p className="text-sm text-text-muted leading-relaxed mb-3">
              {preset.desc}
            </p>

            <pre className="text-[11px] font-mono whitespace-pre-wrap break-words rounded-lg bg-black/5 dark:bg-white/5 p-2.5 mb-4 max-h-32 overflow-auto custom-scrollbar text-text-muted">
              {preset.prompt}
            </pre>

            <div className="mt-auto pt-4 border-t border-border-subtle flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                icon={copiedKey === preset.key ? "check" : "content_copy"}
                onClick={() => copyPreset(preset)}
                className="flex-1"
              >
                {copiedKey === preset.key ? "Disalin!" : "Salin Prompt"}
              </Button>
              <Link
                href="/dashboard/model-editor"
                title="Ke Custom Models"
                className="inline-flex items-center justify-center h-7 px-3 text-xs rounded-[8px] font-semibold text-text-muted hover:bg-surface-2 hover:text-text-main transition-all"
              >
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </Link>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
