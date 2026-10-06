"use client";

import { useState } from "react";
import PropTypes from "prop-types";
import { Card, Button, Input } from "@/shared/components";
import { streamChatCompletion } from "@/shared/utils/chatStream";

// Wawancara PRD 3 ronde (decision-questionnaire): maks 3 pertanyaan per ronde,
// single-idea, paling penting dulu. Tiap pertanyaan ada contoh jawaban + tombol lewati.
export const INTERVIEW_ROUNDS = [
  {
    id: "problem",
    title: "Ronde 1 — Masalah & User",
    hint: "Tanpa masalah yang jelas, PRD jadi daftar fitur halu.",
    questions: [
      { key: "problem", label: "Masalah apa yang mau diselesaikan?", example: "Contoh: UMKM susah bikin laporan keuangan, catat manual di buku, sering hilang." },
      { key: "users", label: "Siapa yang paling sakit kena masalah ini?", example: "Contoh: pemilik warung 30-50 tahun, gaptek, HP Android RAM 3GB." },
      { key: "metric", label: "Sukses = angka apa yang berubah?", example: "Contoh: waktu bikin laporan dari 2 jam jadi 10 menit." },
    ],
  },
  {
    id: "limits",
    title: "Ronde 2 — Batas & Scope",
    hint: "Batas yang eksplisit mencegah scope creep.",
    questions: [
      { key: "constraints", label: "Batasan teknis / budget / waktu?", example: "Contoh: 1 dev, 3 minggu, hosting gratisan, tanpa bayar API." },
      { key: "nonGoals", label: "Apa yang JELAS bukan bagian proyek ini?", example: "Contoh: bukan aplikasi kasir, bukan multi-cabang, bukan iOS." },
      { key: "stack", label: "Platform / stack yang dipakai?", example: "Contoh: Next.js + SQLite, jalan di VPS 1GB." },
    ],
  },
  {
    id: "features",
    title: "Ronde 3 — Fitur Kasar",
    hint: "Tulis 3-5 fitur impian — nanti dipaksa jadi P0/P1/P2.",
    questions: [
      { key: "features", label: "3-5 fitur yang dibayangin? (satu baris satu fitur)", example: "Contoh:\n- Catat pemasukan/pengeluaran\n- Laporan bulanan PDF\n- Ingetin stok menipis" },
      { key: "team", label: "Siapa yang ngerjain?", example: "Contoh: gw sendiri + AI, frontend lemah." },
      { key: "timeline", label: "Target jadi kapan?", example: "Contoh: 1 bulan, demo ke teman dulu." },
    ],
  },
];

function buildInterviewMessages({ round, answers, brief, language }) {
  const langLine = language === "id"
    ? "Tulis dalam Bahasa Indonesia yang santai tapi jelas."
    : "Write in English.";
  const answered = INTERVIEW_ROUNDS.slice(0, round)
    .flatMap((r) => r.questions.map((q) => `- ${q.label}: ${answers[q.key] || "(dilewati)"}`))
    .join("\n");
  const current = INTERVIEW_ROUNDS[round];
  return [
    {
      role: "system",
      content: [
        "Kamu product manager senior yang mewawancarai user awam sebelum menulis PRD.",
        langLine,
        `Fokus ronde ini: ${current.title} — ${current.hint}`,
        "Aturan: ajukan MAKSIMAL 3 pertanyaan di bawah, satu ide per pertanyaan, urut paling penting dulu. Tiap pertanyaan kasih contoh jawaban yang konkret + bilang boleh jawab 'lewat' kalau ga tau. JANGAN tulis PRD. JANGAN ceramah. Output HANYA pertanyaan bernomor + contohnya.",
        current.questions.map((q, i) => `${i + 1}. ${q.label}\n   Contoh: ${q.example}`).join("\n"),
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `Ide proyek: ${brief || "(belum ada — tanya ide dasarnya dulu sebagai pertanyaan pertama)"}`,
        answered ? `Jawaban ronde sebelumnya:\n${answered}` : "",
      ].filter(Boolean).join("\n\n"),
    },
  ];
}

export function buildEnrichedBrief({ brief, answers }) {
  const parts = [String(brief || "").trim()];
  for (const round of INTERVIEW_ROUNDS) {
    for (const q of round.questions) {
      const v = String(answers[q.key] || "").trim();
      if (v && v.toLowerCase() !== "lewat") parts.push(`${q.label} ${v}`);
    }
  }
  return parts.filter(Boolean).join("\n");
}

export default function InterviewPanel({ brief, language, model, apiKey, onApply, disabled }) {
  const [round, setRound] = useState(0);
  const [answers, setAnswers] = useState({});
  const [chat, setChat] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const setAnswer = (key, value) => setAnswers((prev) => ({ ...prev, [key]: value }));

  const ask = async (roundIdx) => {
    if (!model) {
      setError("Pilih model dulu di panel Model.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const text = await streamChatCompletion({
        model,
        messages: buildInterviewMessages({ round: roundIdx, answers, brief, language }),
        apiKey,
        stream: false,
      }).then((r) => r.text);
      setChat((prev) => [...prev, { round: roundIdx, text: String(text || "").trim() }]);
    } catch (err) {
      setError(err?.message || "Wawancara gagal.");
    } finally {
      setLoading(false);
    }
  };

  const current = INTERVIEW_ROUNDS[round];
  const filledCount = Object.values(answers).filter((v) => String(v || "").trim()).length;

  return (
    <Card padding="md" className="flex min-w-0 flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-text-main">Wawancara PRD</h2>
        <span className="text-[11px] text-text-muted">Ronde {Math.min(round + 1, 3)}/3{done ? " — selesai" : ""}</span>
      </div>
      <p className="text-[11px] text-text-muted -mt-2">
        Jawab seadanya — boleh tulis &quot;lewat&quot;. Makin konkret jawabanmu, makin bagus PRD-nya.
      </p>

      {!done && (
        <div className="flex min-w-0 flex-col gap-3">
          <p className="text-xs font-medium text-text-main">{current.title}</p>
          <p className="text-[11px] text-text-muted -mt-2">{current.hint}</p>
          {current.questions.map((q) => (
            <div key={q.key} className="flex flex-col gap-1.5">
              <label className="block text-xs font-medium text-text-main">{q.label}</label>
              <Input
                value={answers[q.key] || ""}
                onChange={(e) => setAnswer(q.key, e.target.value)}
                placeholder={q.example.split("\n")[0].slice(0, 80)}
                className="min-w-0"
                disabled={disabled || loading}
              />
            </div>
          ))}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={disabled || loading || !model}
              onClick={() => ask(round)}
            >
              {loading ? "Minta pertanyaan..." : chat.some((c) => c.round === round) ? "Tanya ulang" : "Minta AI nanya"}
            </Button>
            {round < INTERVIEW_ROUNDS.length - 1 ? (
              <Button size="sm" variant="primary" disabled={disabled || loading} onClick={() => setRound((r) => r + 1)}>
                Lanjut ronde {round + 2}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="primary"
                disabled={disabled || loading}
                onClick={() => {
                  setDone(true);
                  onApply?.(buildEnrichedBrief({ brief, answers }));
                }}
              >
                Selesai — pakai buat PRD ({filledCount} jawaban)
              </Button>
            )}
          </div>
          {chat.filter((c) => c.round === round).map((c, i) => (
            <pre key={i} className="text-[11px] font-mono whitespace-pre-wrap break-words rounded-lg bg-black/5 dark:bg-white/5 p-2.5 max-h-48 overflow-auto custom-scrollbar text-text-muted">
              {c.text}
            </pre>
          ))}
        </div>
      )}

      {done && (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={disabled}
            onClick={() => {
              setDone(false);
              setRound(0);
            }}
          >
            Ulangi wawancara
          </Button>
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}
    </Card>
  );
}

InterviewPanel.propTypes = {
  brief: PropTypes.string,
  language: PropTypes.string,
  model: PropTypes.string,
  apiKey: PropTypes.string,
  onApply: PropTypes.func,
  disabled: PropTypes.bool,
};
