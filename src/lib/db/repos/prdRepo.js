import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";
import { parseJson, stringifyJson } from "../helpers/jsonCol.js";

// PRD Document Writer records: one kv row per generated product requirement document.
const SCOPE = "prdDocs";
const MAX_DOCS = 50;

function store() {
  return {
    async all() {
      const db = await getAdapter();
      const rows = db.all(`SELECT key, value FROM kv WHERE scope = ?`, [SCOPE]);
      const out = {};
      for (const row of rows) out[row.key] = parseJson(row.value, {});
      return out;
    },
    async get(key) {
      const db = await getAdapter();
      const row = db.get(`SELECT value FROM kv WHERE scope = ? AND key = ?`, [SCOPE, key]);
      return row ? parseJson(row.value, {}) : null;
    },
    async set(key, value) {
      const db = await getAdapter();
      db.run(
        `INSERT INTO kv(scope, key, value) VALUES(?, ?, ?)
         ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value`,
        [SCOPE, key, stringifyJson(value)]
      );
    },
    async remove(key) {
      const db = await getAdapter();
      db.run(`DELETE FROM kv WHERE scope = ? AND key = ?`, [SCOPE, key]);
    },
  };
}

const text = (value, max = 4000) =>
  String(value ?? "")
    .replace(/\r\n/g, "\n")
    .slice(0, max)
    .trim();

function toDoc(id, value) {
  if (!value || typeof value !== "object") return null;
  return {
    id,
    title: text(value.title, 160) || "Untitled PRD",
    brief: text(value.brief, 6000),
    model: text(value.model, 160),
    reviewerModel: text(value.reviewerModel, 160),
    template: text(value.template, 40) || "product",
    depth: text(value.depth, 20) || "deep",
    language: text(value.language, 20) || "en",
    sections: Array.isArray(value.sections) ? value.sections.map((s) => text(s, 80)).filter(Boolean).slice(0, 60) : [],
    markdown: text(value.markdown, 400000),
    tokensIn: Number(value.tokensIn) || 0,
    tokensOut: Number(value.tokensOut) || 0,
    createdAt: value.createdAt || "",
    updatedAt: value.updatedAt || "",
  };
}

function summarize(doc) {
  return {
    id: doc.id,
    title: doc.title,
    model: doc.model,
    template: doc.template,
    depth: doc.depth,
    language: doc.language,
    sectionCount: doc.sections.length,
    chars: doc.markdown.length,
    tokensOut: doc.tokensOut,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/** Every saved document, newest change first, without the markdown body. */
export async function getPrdDocs() {
  const rows = await store().all();
  return Object.entries(rows)
    .map(([id, value]) => toDoc(id, value))
    .filter(Boolean)
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
    .map(summarize);
}

/** One full document including its markdown, or null. */
export async function getPrdDoc(id) {
  if (!id) return null;
  const value = await store().get(id);
  return value ? toDoc(id, value) : null;
}

/**
 * Insert or replace a document. `id` is generated when missing, and the oldest
 * documents are dropped once the store passes MAX_DOCS.
 */
export async function savePrdDoc(input = {}) {
  const now = new Date().toISOString();
  const id = text(input.id, 60) || uuidv4();
  const existing = await getPrdDoc(id);
  const markdown = text(input.markdown, 400000);

  const payload = {
    title: text(input.title, 160) || existing?.title || "Untitled PRD",
    brief: markdown === "" && existing ? existing.brief : text(input.brief, 6000),
    model: text(input.model, 160) || existing?.model || "",
    reviewerModel: text(input.reviewerModel, 160) || existing?.reviewerModel || "",
    template: text(input.template, 40) || existing?.template || "product",
    depth: text(input.depth, 20) || existing?.depth || "deep",
    language: text(input.language, 20) || existing?.language || "en",
    sections: Array.isArray(input.sections) && input.sections.length ? input.sections : existing?.sections || [],
    markdown: markdown || existing?.markdown || "",
    tokensIn: Number(input.tokensIn) || existing?.tokensIn || 0,
    tokensOut: Number(input.tokensOut) || existing?.tokensOut || 0,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  await store().set(id, payload);
  await trim();
  return toDoc(id, payload);
}

export async function deletePrdDoc(id) {
  if (!id) return false;
  await store().remove(id);
  return true;
}

async function trim() {
  const rows = await store().all();
  const docs = Object.entries(rows)
    .map(([id, value]) => ({ id, updatedAt: toDoc(id, value)?.updatedAt || "" }))
    .filter((d) => d.updatedAt)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  for (const doc of docs.slice(MAX_DOCS)) {
    await store().remove(doc.id);
  }
}
