"use client";

import { Suspense, useState, useEffect, useMemo, useRef, useCallback } from "react";
import { marked } from "marked";
import {
  Card,
  Button,
  Input,
  Select,
  Toggle,
  Modal,
  SegmentedControl,
  ModelSelectModal,
  CardSkeleton,
} from "@/shared/components";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { PROVIDER_ID_TO_ALIAS } from "@/shared/constants/models";
import { getPricingForModel, calculateCostFromTokens, formatCost } from "open-sse/providers/pricing.js";
import { describeEmptyResponse } from "@/shared/utils/modelResponse";
import { streamChatCompletion } from "@/shared/utils/chatStream";
import {
  PRD_TEMPLATES,
  PRD_DEPTHS,
  PRD_LANGUAGES,
  resolveSections,
  buildPrdMessages,
  buildReviewMessages,
  splitReviewOutput,
  auditSections,
  sanitizeMarkdownHtml,
} from "./prompt.js";
import {
  buildPlanExtractionMessages,
  cleanModelChecklist,
  extractPlanFromMarkdown,
  renderTasksMarkdown,
} from "./checklist.js";
import InterviewPanel, { buildEnrichedBrief } from "./InterviewPanel.js";
import { STRINGS, UI_LANGS, DETAIL_FIELDS_ID, DETAIL_FIELDS_EN, TEMPLATE_ID, DEPTH_ID } from "./strings.js";

marked.setOptions({ gfm: true, breaks: true });

const ALIAS_TO_PROVIDER_ID = Object.fromEntries(
  Object.entries(PROVIDER_ID_TO_ALIAS).map(([id, alias]) => [alias, id])
);

const EMPTY_FORM = {
  product: "",
  users: "",
  problem: "",
  stack: "",
  timeline: "",
  team: "",
  constraints: "",
  nonGoals: "",
  metrics: "",
  notes: "",
};

function splitModel(value) {
  const str = String(value || "").trim();
  if (!str.includes("/")) return { provider: null, model: str };
  const firstSlash = str.indexOf("/");
  const prefix = str.slice(0, firstSlash);
  return { provider: ALIAS_TO_PROVIDER_ID[prefix] || prefix, model: str.slice(firstSlash + 1) };
}

function estimateCost(modelName, usage, studioTargets) {
  if (!usage) return null;
  const target = studioTargets?.[modelName] || modelName;
  const { provider, model } = splitModel(target);
  const pricing = getPricingForModel(provider, model);
  if (!pricing) return null;
  const cost = calculateCostFromTokens(usage, pricing);
  return Number.isFinite(cost) ? cost : null;
}

function showCost(cost) {
  if (cost === null || cost === undefined || Number.isNaN(cost)) return "—";
  if (cost >= 0.01) return formatCost(cost);
  if (cost < 0.0001) return `$${cost.toExponential(1)}`;
  return `$${cost.toFixed(4)}`;
}

function slugify(value) {
  return (
    String(value || "prd")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "prd"
  );
}

function formatTime(ms) {
  if (!ms) return "0s";
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

export default function PrdWriterPage() {
  return (
    <Suspense fallback={<CardSkeleton />}>
      <PrdContent />
    </Suspense>
  );
}

function PrdContent() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [brief, setBrief] = useState("");
  const [template, setTemplate] = useState("product");
  const [depth, setDepth] = useState("deep");
  const [language, setLanguage] = useState("id");
  const [uiLang, setUiLang] = useState("id");
  const T = STRINGS[uiLang] || STRINGS.id;
  const detailFields = uiLang === "id" ? DETAIL_FIELDS_ID : DETAIL_FIELDS_EN;
  const [maxTokens, setMaxTokens] = useState("");
  const [includeAppendix, setIncludeAppendix] = useState(true);
  const [qualityPass, setQualityPass] = useState(true);
  const [sectionsOn, setSectionsOn] = useState(() => resolveSections("product").map((s) => s.id));
  const [showDetails, setShowDetails] = useState(false);

  const [model, setModel] = useState("");
  const [reviewerModel, setReviewerModel] = useState("");
  const [pickerFor, setPickerFor] = useState(null);
  const [activeProviders, setActiveProviders] = useState([]);
  const [modelAliases, setModelAliases] = useState({});
  const [studioTargets, setStudioTargets] = useState({});
  const [activeApiKey, setActiveApiKey] = useState("");

  const [markdown, setMarkdown] = useState("");
  const [critique, setCritique] = useState("");
  const [stage, setStage] = useState("idle");
  const [error, setError] = useState("");
  const [errorDetail, setErrorDetail] = useState("");
  const [usage, setUsage] = useState(null);
  const [cost, setCost] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [view, setView] = useState("preview");
  const [savedId, setSavedId] = useState("");
  const [saving, setSaving] = useState(false);
  const [docs, setDocs] = useState([]);
  const [showPrompt, setShowPrompt] = useState(false);
  const [showTasks, setShowTasks] = useState(false);
  const [taskSource, setTaskSource] = useState("plan");
  const [taskModelText, setTaskModelText] = useState("");
  const [taskStage, setTaskStage] = useState("idle");
  const [taskError, setTaskError] = useState("");
  const [enrichedBrief, setEnrichedBrief] = useState("");
  const { copied, copy } = useCopyToClipboard(2000);

  const abortRef = useRef(null);
  const timerRef = useRef(null);
  const outputRef = useRef(null);
  const draftRef = useRef("");
  const taskAbortRef = useRef(null);
  const taskDraftRef = useRef("");
  const taskListRef = useRef(null);

  const outline = useMemo(() => resolveSections(template), [template]);
  const activeSections = useMemo(
    () => outline.filter((s) => sectionsOn.includes(s.id)),
    [outline, sectionsOn]
  );
  const running = stage === "drafting" || stage === "reviewing";
  const effectiveBrief = enrichedBrief || brief;
  const canGenerate = !!model && (!!effectiveBrief.trim() || !!form.product.trim()) && !running;

  useEffect(() => {
    const load = async () => {
      try {
        const [providersRes, aliasesRes, studioRes, keysRes, docsRes] = await Promise.all([
          fetch("/api/providers").then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
          fetch("/api/models/alias").then((r) => (r.ok ? r.json() : { aliases: {} })).catch(() => ({ aliases: {} })),
          fetch("/api/model-editor").then((r) => (r.ok ? r.json() : { models: [] })).catch(() => ({ models: [] })),
          fetch("/api/keys").then((r) => (r.ok ? r.json() : { keys: [] })).catch(() => ({ keys: [] })),
          fetch("/api/prd").then((r) => (r.ok ? r.json() : { docs: [] })).catch(() => ({ docs: [] })),
        ]);
        setActiveProviders(providersRes.connections || []);
        setModelAliases(aliasesRes.aliases || {});
        const map = {};
        for (const studio of studioRes.models || []) map[studio.callName] = studio.targetModel;
        setStudioTargets(map);
        const firstActive = (keysRes.keys || []).find((k) => k.isActive !== false);
        if (firstActive?.key) setActiveApiKey(firstActive.key);
        setDocs(docsRes.docs || []);
      } catch (err) {
        console.error("Error loading PRD writer inputs:", err);
      }
    };
    load();
  }, []);

  // Keep the section selection valid when the document profile changes.
  useEffect(() => {
    setSectionsOn(outline.map((s) => s.id));
  }, [outline]);

  useEffect(() => {
    if (!running) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      return undefined;
    }
    const started = Date.now() - elapsed;
    timerRef.current = setInterval(() => setElapsed(Date.now() - started), 500);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const loadDocs = useCallback(async () => {
    try {
      const res = await fetch("/api/prd");
      if (res.ok) setDocs((await res.json()).docs || []);
    } catch {
      /* the list refresh is best-effort */
    }
  }, []);

  const streamChat = useCallback(
    async ({ callModel, messages, signal, onDelta }) => {
      const answer = await streamChatCompletion({
        model: callModel,
        messages,
        signal,
        onDelta,
        apiKey: activeApiKey,
        maxTokens,
      });
      if (answer.kind === "empty") {
        throw new Error(describeEmptyResponse({ finishReason: answer.finishReason, usage: answer.usage }));
      }
      return { text: answer.kind === "thinking" ? answer.thinking : answer.text, usage: answer.usage };
    },
    [activeApiKey, maxTokens]
  );

  const appendDelta = useCallback((chunk) => {
    draftRef.current += chunk;
    setMarkdown((prev) => prev + chunk);
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!canGenerate) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setError("");
    setErrorDetail("");
    setCritique("");
    setUsage(null);
    setCost(null);
    setSavedId("");
    setElapsed(0);
    setMarkdown("");
    draftRef.current = "";
    taskDraftRef.current = "";
    setTaskModelText("");
    setTaskStage("idle");
    setTaskError("");
    setView("markdown");
    setStage("drafting");

    try {
      const messages = buildPrdMessages({
        brief: effectiveBrief,
        fields: form,
        template,
        depth,
        language,
        sections: sectionsOn,
        includeAppendix,
      });
      const draft = await streamChat({
        callModel: model,
        messages,
        signal: controller.signal,
        onDelta: appendDelta,
      });
      let finalText = draft.text;
      let finalUsage = draft.usage;

      if (qualityPass && !controller.signal.aborted) {
        setStage("reviewing");
        setMarkdown("");
        draftRef.current = "";
        const audit = auditSections(finalText, activeSections);
        const review = await streamChat({
          callModel: reviewerModel || model,
          messages: buildReviewMessages({
            draft: finalText,
            template,
            language,
            missing: audit.missing,
          }),
          signal: controller.signal,
          onDelta: appendDelta,
        });
        const parsed = splitReviewOutput(review.text);
        if (parsed.markdown) {
          finalText = parsed.markdown;
          setMarkdown(parsed.markdown);
        } else {
          setCritique(review.text);
          setMarkdown(finalText);
        }
        if (parsed.critique) setCritique(parsed.critique);
        finalUsage = review.usage || draft.usage;
      }

      if (!finalText.trim()) {
        setError(describeEmptyResponse({ usage: finalUsage }));
        setStage("error");
        return;
      }
      setMarkdown(finalText);
      setUsage(finalUsage || null);
      setCost(estimateCost(model, finalUsage, studioTargets));
      setView("preview");
      setStage("done");
    } catch (err) {
      if (err?.name === "AbortError") {
        setStage(draftRef.current ? "done" : "idle");
      } else {
        setError(err?.message || T.genFail);
        setErrorDetail(err?.detail || "");
        setStage("error");
      }
    } finally {
      abortRef.current = null;
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [
    canGenerate,
    effectiveBrief,
    form,
    template,
    depth,
    language,
    sectionsOn,
    includeAppendix,
    qualityPass,
    model,
    reviewerModel,
    streamChat,
    appendDelta,
    activeSections,
    studioTargets,
  ]);

  const handleStop = () => {
    if (abortRef.current) abortRef.current.abort();
    setStage(markdown ? "done" : "idle");
  };

  const audit = useMemo(() => auditSections(markdown, activeSections), [markdown, activeSections]);
  const html = useMemo(
    () => (stage === "done" && view === "preview" ? sanitizeMarkdownHtml(marked.parse(markdown)) : ""),
    [markdown, view, stage]
  );

  useEffect(() => {
    if (view === "markdown" && outputRef.current && running) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [markdown, view, running]);

  const docTitle = form.product.trim() || brief.trim().split("\n")[0].slice(0, 70) || T.untitled;

  const handleSave = async () => {
    if (!markdown.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/prd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: savedId || undefined,
          title: docTitle,
          brief: [form.product, form.problem, brief].filter(Boolean).join("\n").slice(0, 6000),
          markdown,
          model,
          reviewerModel: qualityPass ? reviewerModel || model : "",
          template,
          depth,
          language,
          sections: activeSections.map((s) => s.heading),
          tokensIn: usage?.prompt_tokens || usage?.input_tokens || 0,
          tokensOut: usage?.completion_tokens || usage?.output_tokens || 0,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || T.saveFail);
        return;
      }
      setSavedId(data.doc?.id || "");
      loadDocs();
    } catch (err) {
      setError(err?.message || T.saveFail);
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = () => {
    if (!markdown.trim()) return;
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slugify(docTitle)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const taskPlan = useMemo(
    () => (showTasks && taskSource === "plan" ? extractPlanFromMarkdown(markdown) : null),
    [showTasks, taskSource, markdown]
  );
  const planTaskText = useMemo(() => (taskPlan ? renderTasksMarkdown(taskPlan) : ""), [taskPlan]);
  const taskText = taskSource === "plan" ? planTaskText : taskModelText;
  const taskRunning = taskStage === "running";
  const taskFollowUps = taskPlan ? taskPlan.groups.reduce((n, g) => n + g.items.length, 0) : 0;

  useEffect(() => {
    if (showTasks && taskSource === "model" && taskListRef.current) {
      taskListRef.current.scrollTop = taskListRef.current.scrollHeight;
    }
  }, [taskText, showTasks, taskSource]);

  const handleDownloadTasks = () => {
    if (!taskText.trim()) return;
    const blob = new Blob([taskText], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slugify(docTitle)}-tasks.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openTaskList = useCallback(() => {
    setTaskError("");
    setShowTasks(true);
  }, []);

  const closeTaskList = useCallback(() => {
    if (taskAbortRef.current) {
      taskAbortRef.current.abort();
      taskAbortRef.current = null;
    }
    setTaskStage("idle");
    setTaskError("");
    setShowTasks(false);
  }, []);

  const stopTaskRequest = useCallback(() => {
    if (taskAbortRef.current) taskAbortRef.current.abort();
    setTaskStage(taskDraftRef.current.trim() ? "done" : "idle");
  }, []);

  const handleAskModel = useCallback(async () => {
    if (!model || running || taskRunning || !markdown.trim()) return;
    const controller = new AbortController();
    taskAbortRef.current = controller;
    taskDraftRef.current = "";
    setTaskModelText("");
    setTaskError("");
    setTaskStage("running");
    try {
      const answer = await streamChat({
        callModel: model,
        messages: buildPlanExtractionMessages(markdown),
        signal: controller.signal,
        onDelta: (chunk) => {
          taskDraftRef.current += chunk;
          setTaskModelText(taskDraftRef.current);
        },
      });
      const text = cleanModelChecklist(answer?.text || taskDraftRef.current);
      taskDraftRef.current = text;
      setTaskModelText(text);
      setTaskStage(text.trim() ? "done" : "error");
      if (!text.trim()) setTaskError(T.emptyAnswer);
    } catch (err) {
      if (err?.name === "AbortError") {
        const partial = cleanModelChecklist(taskDraftRef.current);
        taskDraftRef.current = partial;
        setTaskModelText(partial);
        setTaskStage(partial.trim() ? "done" : "idle");
      } else {
        setTaskError(err?.message || T.taskFail);
        setTaskStage("error");
      }
    } finally {
      if (taskAbortRef.current === controller) taskAbortRef.current = null;
    }
  }, [model, running, taskRunning, markdown, streamChat]);

  const openDoc = async (id) => {
    try {
      const res = await fetch(`/api/prd?id=${encodeURIComponent(id)}`);
      if (!res.ok) return;
      const { doc } = await res.json();
      if (!doc) return;
      setMarkdown(doc.markdown || "");
      setSavedId(doc.id);
      setStage("done");
      setError("");
      setCritique("");
      taskDraftRef.current = "";
      setTaskModelText("");
      setTaskStage("idle");
      setUsage(null);
      setCost(null);
      setView("preview");
      setModel(doc.model || model);
      setTemplate(PRD_TEMPLATES.some((t) => t.value === doc.template) ? doc.template : template);
      setDepth(PRD_DEPTHS.some((d) => d.value === doc.depth) ? doc.depth : depth);
      setLanguage(PRD_LANGUAGES.some((l) => l.value === doc.language) ? doc.language : language);
    } catch {
      /* opening a saved doc is best-effort */
    }
  };

  const deleteDoc = async (id) => {
    try {
      await fetch(`/api/prd?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (id === savedId) setSavedId("");
      loadDocs();
    } catch {
      /* the list refresh reports failures */
    }
  };

  const promptPreview = useMemo(
    () =>
      buildPrdMessages({
        brief: effectiveBrief,
        fields: form,
        template,
        depth,
        language,
        sections: sectionsOn,
        includeAppendix,
      })
        .map((m) => `[${m.role}]\n${m.content}`)
        .join("\n\n"),
    [brief, effectiveBrief, form, template, depth, language, sectionsOn, includeAppendix]
  );

  return (
    <div className="flex min-w-0 flex-col gap-6 px-1 sm:px-0">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold leading-none text-text-main flex items-center gap-2">
            <span className="material-symbols-outlined size-[20px] text-[20px] leading-none shrink-0 text-primary">description</span>
            {T.pageTitle}
          </h1>
          <p className="text-xs text-text-muted mt-0.5">
            {T.pageSub}
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          <span className="text-[11px] text-text-muted">{T.uiLangLabel}</span>
          <SegmentedControl size="sm" value={uiLang} onChange={setUiLang} options={UI_LANGS} />
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-4">
          <InterviewPanel
            brief={brief}
            language={language}
            uiLang={uiLang}
            model={model}
            apiKey={activeApiKey}
            disabled={running}
            onApply={(enriched) => setEnrichedBrief(enriched)}
          />
          <Card padding="md" className="flex min-w-0 flex-col gap-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-text-main">{T.briefTitle}</h2>
              <button
                type="button"
                onClick={() => setShowDetails((v) => !v)}
                className="text-[11px] font-medium text-primary hover:underline shrink-0"
              >
                {showDetails ? T.hideDetails : T.addDetails(detailFields.length)}
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <label className="block text-xs font-medium text-text-main">
                {T.productIdea} <span className="text-red-500">*</span>
              </label>
              <textarea
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                rows={5}
                placeholder={T.productPh}
                className="w-full min-w-0 rounded-[10px] border border-border/50 bg-surface-2 p-2.5 text-sm text-text-main placeholder-text-muted/70 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all duration-150 ease-out resize-y"
              />
            </div>

            {showDetails && (
              <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
                {detailFields.map((field) => (
                  <Input
                    key={field.key}
                    label={field.label}
                    value={form[field.key]}
                    onChange={(e) => setField(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    className="min-w-0"
                  />
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Card padding="md" className="flex min-w-0 flex-col gap-4">
            <h2 className="text-sm font-semibold text-text-main">{T.shapeTitle}</h2>

            <Select
              label={T.profileLabel}
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              options={PRD_TEMPLATES.map((t) => ({ value: t.value, label: uiLang === "id" ? TEMPLATE_ID[t.value]?.label || t.label : t.label }))}
            />
            <p className="text-[11px] text-text-muted -mt-2">
              {uiLang === "id" ? TEMPLATE_ID[template]?.hint : PRD_TEMPLATES.find((t) => t.value === template)?.hint}
            </p>

            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-text-main">{T.depthLabel}</span>
              <SegmentedControl
                size="sm"
                value={depth}
                onChange={setDepth}
                options={PRD_DEPTHS.map((d) => ({ value: d.value, label: uiLang === "id" ? DEPTH_ID[d.value]?.label || d.label : d.label }))}
              />
              <p className="text-[11px] text-text-muted">
                {uiLang === "id" ? DEPTH_ID[depth]?.guidance : PRD_DEPTHS.find((d) => d.value === depth)?.guidance}
              </p>
            </div>

            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
              <Select
                label={T.docLangLabel}
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                options={PRD_LANGUAGES}
              />
              <Input
                label={T.maxTokensLabel}
                type="number"
                min="0"
                value={maxTokens}
                onChange={(e) => setMaxTokens(e.target.value)}
                placeholder={T.maxTokensPh}
                className="min-w-0"
              />
            </div>

            <Toggle
              size="sm"
              checked={includeAppendix}
              onChange={setIncludeAppendix}
              label={T.appendixLabel}
            />

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-text-main">{T.sectionsLabel}</span>
                <button
                  type="button"
                  onClick={() =>
                    setSectionsOn(sectionsOn.length === outline.length ? [] : outline.map((s) => s.id))
                  }
                  className="text-[11px] font-medium text-primary hover:underline shrink-0"
                >
                  {sectionsOn.length === outline.length ? T.clearAll : T.selectAll}
                </button>
              </div>
              <p className="text-[11px] text-text-muted">
                {T.sectionsCount(sectionsOn.length, outline.length)}
              </p>
              <div className="flex max-h-[190px] min-w-0 flex-col gap-1 overflow-y-auto custom-scrollbar pr-1">
                {outline.map((section, index) => {
                  const on = sectionsOn.includes(section.id);
                  return (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() =>
                        setSectionsOn((prev) =>
                          prev.includes(section.id) ? prev.filter((id) => id !== section.id) : [...prev, section.id]
                        )
                      }
                      title={section.spec}
                      className={`flex min-w-0 items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors ${
                        on
                          ? "border-primary/40 bg-primary/5 text-text-main"
                          : "border-border/40 text-text-muted hover:border-primary/30"
                      }`}
                    >
                      <span className="w-4 shrink-0 text-[10px] tabular-nums text-text-muted">{index + 1}</span>
                      <span
                        className={`material-symbols-outlined text-[15px] shrink-0 ${on ? "text-primary" : "text-text-muted/40"}`}
                      >
                        {on ? "check_circle" : "radio_button_unchecked"}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs font-medium">{section.heading}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </Card>

          <Card padding="md" className="flex min-w-0 flex-col gap-4">
            <h2 className="text-sm font-semibold text-text-main">{T.modelsTitle}</h2>

            <ModelSlot
              label={T.writerLabel}
              required
              value={model}
              onPick={() => setPickerFor("writer")}
              onClear={() => setModel("")}
              pickHint={T.pickWriterPh}
            />

            <div className="flex flex-col gap-3">
              <Toggle
                size="sm"
                checked={qualityPass}
                onChange={setQualityPass}
                label={T.reviewLabel}
              />
              {qualityPass && (
                <ModelSlot
                  label={T.reviewerLabel}
                  value={reviewerModel}
                  fallback={model ? T.sameAsWriter(model) : ""}
                  onPick={() => setPickerFor("reviewer")}
                  onClear={() => setReviewerModel("")}
                />
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button
                icon={running ? "stop_circle" : "auto_fix_high"}
                onClick={running ? handleStop : handleGenerate}
                disabled={running ? false : !canGenerate}
                variant={running ? "secondary" : "primary"}
              >
                {stage === "drafting" ? T.writing : stage === "reviewing" ? T.reviewing : running ? T.stop : T.generate}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                icon="code"
                onClick={() => setShowPrompt(true)}
              >
                {T.promptBtn}
              </Button>
            </div>
            {!model && (
              <p className="text-[11px] text-amber-500 -mt-1">
                {T.needModel}
              </p>
            )}
            {model && !brief.trim() && !form.product.trim() && (
              <p className="text-[11px] text-text-muted -mt-1">
                {T.needIdea}
              </p>
            )}
          </Card>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-4">
          <Card padding="none" className="flex min-w-0 flex-col overflow-hidden">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <SegmentedControl
                  size="sm"
                  value={view}
                  onChange={setView}
                  options={[
                    { value: "preview", label: T.previewTab, icon: "visibility" },
                    { value: "markdown", label: T.markdownTab, icon: "code" },
                  ]}
                />
                {running && (
                  <span className="flex items-center gap-1 text-[11px] text-text-muted">
                    <span className="material-symbols-outlined text-[15px] animate-spin">progress_activity</span>
                    {formatTime(elapsed)}
                  </span>
                )}
              </div>
              <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
                <Button size="sm" variant="ghost" icon="save" onClick={handleSave} disabled={!markdown.trim() || saving}>
                  {savedId ? T.update : T.save}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={copied === docTitle ? "check" : "content_copy"}
                  onClick={() => copy(markdown, docTitle)}
                  disabled={!markdown.trim()}
                >
                  {T.copy}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon="checklist"
                  onClick={openTaskList}
                  disabled={!markdown.trim()}
                >
                  {T.taskList}
                </Button>
                <Button size="sm" variant="ghost" icon="download" onClick={handleDownload} disabled={!markdown.trim()}>
                  .md
                </Button>
              </div>
            </div>

            {error && (
              <div className="m-4 mb-0 flex min-w-0 flex-col gap-1.5 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2">
                <div className="flex min-w-0 items-start gap-2">
                  <span className="material-symbols-outlined text-[16px] text-red-500 shrink-0">error</span>
                  <p className="min-w-0 flex-1 break-words text-xs text-red-500">{error}</p>
                </div>
                {errorDetail && (
                  <details className="min-w-0">
                    <summary className="cursor-pointer text-[11px] text-red-500/80 hover:text-red-500">
                      Show the raw error
                    </summary>
                    <pre className="mt-1 max-h-40 overflow-auto custom-scrollbar whitespace-pre-wrap break-words rounded bg-black/5 dark:bg-white/5 p-2 text-[10px] text-text-muted">
                      {errorDetail}
                    </pre>
                  </details>
                )}
              </div>
            )}

            {markdown.trim() ? (
              <div className="flex min-w-0 flex-col">
                <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/60 px-4 py-2 text-[11px] text-text-muted">
                  <span className="min-w-0 truncate">
                    <code className="font-mono text-text-main">{model || "—"}</code>
                    {qualityPass && reviewerModel && reviewerModel !== model ? (
                      <>
                        {" · reviewed by "}
                        <code className="font-mono text-text-main">{reviewerModel}</code>
                      </>
                    ) : null}
                  </span>
                  <span>
                    {audit.present}/{audit.total} sections
                  </span>
                  {usage ? (
                    <span>
                      {T.outTokens(usage.total_tokens || usage.output_tokens || 0)}
                    </span>
                  ) : null}
                  {cost != null ? <span>~{showCost(cost)}</span> : null}
                  {elapsed ? <span>{formatTime(elapsed)}</span> : null}
                </div>

                <div
                  ref={outputRef}
                  className="max-h-[70vh] min-w-0 overflow-y-auto custom-scrollbar px-4 py-3"
                >
                  {view === "preview" && !running ? (
                    <div
                      className="prd-markdown min-w-0 text-sm text-text-main"
                      dangerouslySetInnerHTML={{ __html: html }}
                    />
                  ) : (
                    <pre className="min-w-0 whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-text-main">
                      {markdown}
                      {running ? <span className="animate-pulse">▍</span> : null}
                    </pre>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex min-w-0 flex-col items-center gap-2 px-6 py-14 text-center">
                <span className="material-symbols-outlined text-[34px] text-text-muted/40">
                  {running ? "edit_note" : "description"}
                </span>
                <p className="text-sm font-medium text-text-main">
                  {running ? T.writingDoc : T.emptyTitle}
                </p>
                <p className="max-w-md text-xs text-text-muted">
                  {T.emptySub}
                </p>
              </div>
            )}
          </Card>

          <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">
          {markdown.trim() && !running && (
            <Card padding="md" className="flex min-w-0 flex-col gap-3">
              <div className="flex min-w-0 items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-text-main">{T.checklistTitle}</h2>
                <span className="shrink-0 text-[11px] text-text-muted">
                  {audit.present === audit.total ? T.complete : T.missing(audit.total - audit.present)}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${audit.total ? Math.round((audit.present / audit.total) * 100) : 0}%` }}
                />
              </div>
              <div className="flex min-w-0 flex-wrap gap-1.5">
                {audit.report.map((row) => (
                  <span
                    key={row.id}
                    className={`inline-flex min-w-0 max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${
                      row.present ? "bg-green-500/10 text-green-600 dark:text-green-500" : "bg-red-500/10 text-red-500"
                    }`}
                  >
                    <span className="material-symbols-outlined text-[13px] shrink-0">
                      {row.present ? "check_small" : "remove"}
                    </span>
                    <span className="truncate">{row.heading}</span>
                  </span>
                ))}
              </div>
              {critique && (
                <div className="min-w-0 rounded-lg border border-border/50 bg-black/5 dark:bg-white/5 p-3">
                  <p className="mb-1 text-[10px] uppercase tracking-wide text-text-muted/70">{T.critiqueTitle}</p>
                  <pre className="max-h-56 min-w-0 overflow-y-auto custom-scrollbar whitespace-pre-wrap break-words text-[11px] leading-relaxed text-text-muted">
                    {critique}
                  </pre>
                </div>
              )}
            </Card>
          )}

          <Card padding="md" className="flex min-w-0 flex-col gap-3">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-text-main">{T.savedTitle}</h2>
              <span className="shrink-0 text-[11px] text-text-muted">{T.savedCount(docs.length)}</span>
            </div>
            {docs.length === 0 ? (
              <p className="text-xs text-text-muted">
                {T.savedEmpty}
              </p>
            ) : (
              <div className="flex min-w-0 flex-col gap-1.5">
                {docs.map((doc) => (
                  <div
                    key={doc.id}
                    className={`flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors ${
                      doc.id === savedId
                        ? "border-primary/40 bg-primary/5"
                        : "border-black/5 dark:border-white/5 bg-black/5 dark:bg-white/5 hover:border-primary/30"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => openDoc(doc.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <span className="material-symbols-outlined text-[16px] text-primary shrink-0">description</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium text-text-main">{doc.title}</span>
                        <span className="block min-w-0 truncate text-[11px] text-text-muted">
                          {T.docMeta(doc.model || "—", doc.sectionCount, (doc.chars || 0).toLocaleString())}
                          {formatDate(doc.updatedAt) ? ` · ${formatDate(doc.updatedAt)}` : ""}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteDoc(doc.id)}
                      title={T.deleteTitle}
                      className="shrink-0 rounded-lg p-1.5 text-text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[16px]">delete</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>
          </div>
        </div>

      {pickerFor && (
        <ModelSelectModal
          isOpen
          onClose={() => setPickerFor(null)}
          onSelect={(picked) => {
            const value = picked?.value || "";
            if (value) {
              if (pickerFor === "writer") setModel(value);
              else setReviewerModel(value);
            }
            setPickerFor(null);
          }}
          activeProviders={activeProviders}
          modelAliases={modelAliases}
          selectedModel={pickerFor === "writer" ? model : reviewerModel}
          title={pickerFor === "writer" ? "Pick writer model" : "Pick reviewer model"}
        />
      )}

      {showTasks && (
        <Modal isOpen onClose={closeTaskList} title={T.taskModal} size="full">
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <SegmentedControl
                size="sm"
                value={taskSource}
                onChange={setTaskSource}
                options={[
                  { value: "plan", label: T.fromPlan, icon: "account_tree" },
                  { value: "model", label: T.askModel(model), icon: "smart_toy" },
                ]}
              />
              {taskSource === "model" && (
                <div className="flex min-w-0 shrink-0 items-center gap-2">
                  {taskRunning ? (
                    <span className="flex min-w-0 items-center gap-1 text-[11px] text-text-muted">
                      <span className="material-symbols-outlined text-[15px] animate-spin">progress_activity</span>
                      {T.writingList}
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      icon="auto_fix_high"
                      onClick={handleAskModel}
                      disabled={!model || running || !markdown.trim()}
                    >
                      {taskModelText.trim() ? T.askAgain : T.ask}
                    </Button>
                  )}
                  {taskRunning && (
                    <Button size="sm" variant="ghost" icon="stop_circle" onClick={stopTaskRequest}>
                      {T.stop}
                    </Button>
                  )}
                </div>
              )}
            </div>
            {taskSource === "model" && !model && (
              <p className="min-w-0 break-words text-[11px] text-amber-500">
                {T.needWriterFirst}
              </p>
            )}
            {taskError && <p className="min-w-0 break-words text-[11px] text-red-500">{taskError}</p>}
            {taskSource === "plan" && taskPlan && !taskPlan.tasks.length && (
              <p className="min-w-0 break-words text-[11px] text-amber-500">
                {T.noPlanFound}
              </p>
            )}
            {taskSource === "plan" && taskPlan && taskPlan.tasks.length > 0 && (
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-muted">
                <span className="min-w-0 truncate">
                  {T.tasksCount(taskPlan.tasks.length)}
                </span>
                {taskFollowUps > 0 && (
                  <span className="min-w-0 truncate">{T.followUps(taskFollowUps)}</span>
                )}
                {taskPlan.warnings.slice(0, 3).map((warning) => (
                  <span key={warning} className="min-w-0 break-words text-amber-500">
                    {warning}
                  </span>
                ))}
              </div>
            )}
            {taskText ? (
              <pre
                ref={taskListRef}
                className="max-h-[45vh] min-w-0 overflow-auto custom-scrollbar whitespace-pre-wrap break-words rounded-lg bg-black/5 dark:bg-white/5 p-3 font-mono text-[11px] leading-relaxed text-text-main"
              >
                {taskText}
                {taskRunning ? <span className="animate-pulse">▍</span> : null}
              </pre>
            ) : (
              taskSource === "model" && (
                <div className="flex min-w-0 flex-col items-center gap-2 rounded-lg border border-dashed border-border px-4 py-10 text-center">
                  <span className="material-symbols-outlined text-[28px] text-text-muted/40">
                    {taskRunning ? "hourglass_top" : "task_alt"}
                  </span>
                  <p className="max-w-sm text-xs text-text-muted">
                    {taskRunning
                      ? T.askingModel
                      : T.noChecklist}
                  </p>
                </div>
              )
            )}
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                icon={copied === "tasks" ? "check" : "content_copy"}
                onClick={() => copy(taskText, "tasks")}
                disabled={!taskText.trim()}
              >
                {T.copy}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon="download"
                onClick={handleDownloadTasks}
                disabled={!taskText.trim()}
              >
                .md
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {showPrompt && (
        <Modal isOpen onClose={() => setShowPrompt(false)} title={T.promptModal}>
          <div className="flex min-w-0 flex-col gap-3">
            <p className="text-[11px] text-text-muted">
              {T.promptSub}
            </p>
            <pre
              className="max-h-[55vh] min-w-0 overflow-auto custom-scrollbar whitespace-pre-wrap break-words rounded-lg bg-black/5 dark:bg-white/5 p-3 font-mono text-[11px] leading-relaxed text-text-muted"
            >
              {promptPreview}
            </pre>
            <div className="flex justify-end">
              <Button variant="secondary" size="sm" icon="content_copy" onClick={() => copy(promptPreview, "prompt")}>
                {T.copyPrompt}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ModelSlot({ label, required, value, fallback, onPick, onClear, pickHint }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-medium text-text-main">
          {label} {required && <span className="text-red-500">*</span>}
        </span>
        {value && (
          <button
            type="button"
            onClick={onClear}
            className="shrink-0 text-[11px] text-text-muted hover:text-red-500 transition-colors"
          >
            clear
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={onPick}
        className={`flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors ${
          value ? "border-primary/40 bg-primary/5" : "border-dashed border-border hover:border-primary/50"
        }`}
      >
        <span className="min-w-0 flex-1">
          {value ? (
            <span className="block truncate font-mono text-sm text-text-main">{value}</span>
          ) : (
            <span className="block truncate text-sm text-text-muted">
              {fallback || pickHint}
            </span>
          )}
        </span>
        <span className="material-symbols-outlined shrink-0 text-[18px] text-primary">
          {value ? "swap_horiz" : "search"}
        </span>
      </button>
    </div>
  );
}
