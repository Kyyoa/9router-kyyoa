import { getAdapter } from "../driver.js";
import { parseJson, stringifyJson } from "../helpers/jsonCol.js";

// Favorite models: user-pinned shortcuts shown first in ModelSelectModal.
// Single JSON array under one kv key — no schema migration needed.
// Values are picker `value` strings (e.g. "cc/claude-sonnet-4.5").
const SCOPE = "favoriteModels";
const KEY = "list";
const MAX_FAVORITES = 20;

export async function getFavoriteModels() {
  const db = await getAdapter();
  const row = db.get(`SELECT value FROM kv WHERE scope = ? AND key = ?`, [SCOPE, KEY]);
  const list = row ? (parseJson(row.value, []) || []) : [];
  return Array.isArray(list) ? list.filter(Boolean) : [];
}

function saveList(db, list) {
  db.run(
    `INSERT INTO kv(scope, key, value) VALUES(?, ?, ?) ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value`,
    [SCOPE, KEY, stringifyJson(list)]
  );
}

export async function addFavoriteModel(value) {
  const v = String(value || "").trim();
  if (!v || v.startsWith("__placeholder__")) return await getFavoriteModels();
  const db = await getAdapter();
  let out = [];
  db.transaction(() => {
    const row = db.get(`SELECT value FROM kv WHERE scope = ? AND key = ?`, [SCOPE, KEY]);
    const current = row ? (parseJson(row.value, []) || []) : [];
    const next = [v, ...current.filter((x) => x !== v)].slice(0, MAX_FAVORITES);
    saveList(db, next);
    out = next;
  });
  return out;
}

export async function removeFavoriteModel(value) {
  const v = String(value || "").trim();
  const db = await getAdapter();
  let out = [];
  db.transaction(() => {
    const row = db.get(`SELECT value FROM kv WHERE scope = ? AND key = ?`, [SCOPE, KEY]);
    const current = row ? (parseJson(row.value, []) || []) : [];
    const next = current.filter((x) => x !== v);
    if (next.length === 0) {
      db.run(`DELETE FROM kv WHERE scope = ? AND key = ?`, [SCOPE, KEY]);
    } else {
      saveList(db, next);
    }
    out = next;
  });
  return out;
}
