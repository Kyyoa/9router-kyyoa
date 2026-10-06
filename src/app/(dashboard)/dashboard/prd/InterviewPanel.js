"use client";

import { useState } from "react";
import PropTypes from "prop-types";
import { Card, Button, Input } from "@/shared/components";
import { streamChatCompletion } from "@/shared/utils/chatStream";
import { INTERVIEW_ID, INTERVIEW_EN, STRINGS } from "./strings.js";

// Wawancara PRD 3 ronde (decision-questionnaire): maks 3 pertanyaan per ronde,
// single-idea, paling penting dulu. Contoh tampil sebagai teks bantuan di bawah
// kotak (bukan placeholder) biar ga dikira isi yang harus ditimpa.
export const INTERVIEW_ROUNDS = INTERVIEW_ID;

function buildInterviewMessages({ round, rounds, answers, brief, language, uiLang }) {
  const langLine = language === "id"
    ? "Tulis dalam Bahasa Indonesia yang santai tapi jelas."
    : "Write in English.";
  const skipWord = uiLang === "id" ? "lewat" : "skip";
  const skippedWord = uiLang === "id" ? "dilewati" : "skipped";
  const answered = rounds.slice(0, round)
    .flatMap((r) => r.questions.map((q) => `- ${q.label}: ${answers[q.key] || `(${skippedWord})`}`))
    .join("\n");
  const current = rounds[round];
  return [
    {
      role: "system",
      content: [
        "Kamu product manager senior yang mewawancarai user awam sebelum menulis PRD.",
        langLine,
        `Fokus ronde ini: ${current.title} — ${current.hint}`,
        `Aturan: ajukan MAKSIMAL 3 pertanyaan di bawah, satu ide per pertanyaan, urut paling penting dulu. Tiap pertanyaan kasih contoh jawaban yang konkret + bilang boleh jawab '${skipWord}' kalau ga tau. JANGAN tulis PRD. JANGAN ceramah. Output HANYA pertanyaan bernomor + contohnya.`,
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
  for (const round of INTERVIEW_ID) {
    for (const q of round.questions) {
      const v = String(answers[q.key] || "").trim();
      if (v && !/^(lewat|lewati|skip|skipped)$/i.test(v)) parts.push(`${q.label} ${v}`);
    }
  }
  return parts.filter(Boolean).join("\n");
}

export default function InterviewPanel({ brief, language, uiLang = "id", model, apiKey, onApply, disabled }) {
  const st = STRINGS[uiLang] || STRINGS.id;
  const rounds = uiLang === "id" ? INTERVIEW_ID : INTERVIEW_EN;
  const [round, setRound] = useState(0);
  const [answers, setAnswers] = useState({});
  const [chat, setChat] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const setAnswer = (key, value) => setAnswers((prev) => ({ ...prev, [key]: value }));

  const ask = async (roundIdx) => {
    if (!model) {
      setError(st.needPickModel);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const text = await streamChatCompletion({
        model,
        messages: buildInterviewMessages({ round: roundIdx, rounds, answers, brief, language, uiLang }),
        apiKey,
        stream: false,
      }).then((r) => r.text);
      setChat((prev) => [...prev, { round: roundIdx, text: String(text || "").trim() }]);
    } catch (err) {
      setError(err?.message || st.interviewFail);
    } finally {
      setLoading(false);
    }
  };

  const current = rounds[round];
  const filledCount = Object.values(answers).filter((v) => String(v || "").trim()).length;

  return (
    <Card padding="md" className="flex min-w-0 flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-text-main">{st.interviewTitle}</h2>
        <span className="text-[11px] text-text-muted">
          {uiLang === "id" ? "Ronde" : "Round"} {Math.min(round + 1, 3)}/3{done ? (uiLang === "id" ? " — selesai" : " — done") : ""}
        </span>
      </div>
      <p className="text-[11px] text-text-muted -mt-2">
        {st.interviewSub}
      </p>

      {!done && (
        <div className="flex min-w-0 flex-col gap-3">
          <p className="text-xs font-medium text-text-main">{current.title}</p>
          <p className="text-[11px] text-text-muted -mt-2">{current.hint}</p>
          {current.questions.map((q) => (
            <div key={q.key} className="flex flex-col gap-1">
              <label className="block text-xs font-medium text-text-main">{q.label}</label>
              <Input
                value={answers[q.key] || ""}
                onChange={(e) => setAnswer(q.key, e.target.value)}
                placeholder={uiLang === "id" ? "Ketik jawabanmu di sini..." : "Type your answer here..."}
                className="min-w-0"
                disabled={disabled || loading}
              />
              <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-text-muted/80">
                💡 {q.example}
              </p>
            </div>
          ))}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={disabled || loading || !model}
              onClick={() => ask(round)}
            >
              {loading ? st.askingQ : chat.some((c) => c.round === round) ? st.askAgainQ : st.askQuestions}
            </Button>
            {round < rounds.length - 1 ? (
              <Button size="sm" variant="primary" disabled={disabled || loading} onClick={() => setRound((r) => r + 1)}>
                {st.nextRound(round + 2)}
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
                {st.finishInterview(filledCount)}
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
            {st.redoInterview}
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
  uiLang: PropTypes.string,
  model: PropTypes.string,
  apiKey: PropTypes.string,
  onApply: PropTypes.func,
  disabled: PropTypes.bool,
};
