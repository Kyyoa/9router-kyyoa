// One matching rule for "is this plugin on for this model", shared by the
// request runtime and the dashboard badge. They must agree: a badge that claims
// a plugin is on for a model it would not run for is worse than no badge.
//
// This module is pure on purpose. customPluginsRuntime.js imports getSettings
// and open-sse, so a client component cannot import it without dragging server
// code into the client bundle.

/** Same rule the runtime uses: exact match, or bare id behind a namespace. */
export function matchesModel(modelList, modelKey) {
  if (!Array.isArray(modelList) || !modelKey) return false;
  const key = String(modelKey).toLowerCase();
  const bare = key.includes("/") ? key.split("/").pop() : key;
  return modelList.some((m) => {
    const s = String(m).toLowerCase();
    const sBare = s.includes("/") ? s.split("/").pop() : s;
    return s === key || sBare === bare || s === bare || key === sBare;
  });
}

/** Every alias a row could be listed under, from its id alone. */
export function modelKeys(modelId) {
  const key = String(modelId || "");
  if (!key) return [];
  const keys = [key];
  if (key.includes("/")) keys.push(key.split("/").pop());
  return keys;
}

/** Does an entry ({enabled, models}) apply to this model id? */
export function pluginAppliesToModel(entry, modelId) {
  if (!entry?.enabled) return false;
  const keys = modelKeys(modelId);
  if (!keys.length) return false;
  return keys.some((key) => matchesModel(entry.models, key));
}
