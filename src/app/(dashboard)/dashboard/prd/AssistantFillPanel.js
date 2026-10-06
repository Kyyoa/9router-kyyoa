"use client";
import { useState } from "react";
import PropTypes from "prop-types";
import { Card, Button, Input } from "@/shared/components";
import { streamChatCompletion } from "@/shared/utils/chatStream";
import { buildFillMessages, parseFillJson } from "./prompt.js";
import { STRINGS } from "./strings.js";

// Asisten Pengisi: sesi ngobrol bebas yang bantu user awam mengisi semua
// kotak di halaman ini, lalu auto-fill ke form saat user bilang matang.
// Beda dengan InterviewPanel (Q&A terstruktur 3 ronde): ini bebas,
// outputnya JSON yang di-merge ke form + brief.
export default function AssistantFillPanel({ uiLang = "id", docLang = "id", model, apiKey, onFill, disabled }) {
  const st = STRINGS[uiLang] || STRINGS.id;
  const [msgs, setMsgs] = useState([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [filling, setFilling] = useState(false);
  const [error, setError] = useState("");
  const [filled, setFilled] = useState(0);

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
      <div className="flex max-h-64 min-h-32 min-w-0 flex-col gap-2 overflow-y-auto custom-scrollbar rounded-lg bg-black/5 dark:bg-white/5 p-2.5">
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
