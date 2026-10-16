// JSON Guard - repair a model answer so a caller can parse it.
//
// Free and small models are unreliable at machine-readable output: they wrap
// JSON in prose, fence it, emit Python literals, leave a trailing comma, or get
// cut off by the output limit mid-object. Every one of those is a parse error on
// the caller's side, and for an agent driving tools that error ends the turn.
//
// The repair ladder, cheapest first:
//   1. parse the answer as-is
//   2. take the fenced block, or the first balanced JSON value inside the prose
//   3. rewrite the coding slips that make an otherwise-complete payload invalid
//   4. close off a truncated payload by dropping its incomplete last member
//
// Nothing here rewrites a value. A payload that parses on step 1 is returned
// untouched, so a model that already knows how to emit JSON is never changed.

/** Parse-or-undefined. */
function tryParse(text) {
  const candidate = typeof text === "string" ? text.trim() : text;
  if (!candidate) return undefined;
  try {
    return JSON.parse(candidate);
  } catch {
    return undefined;
  }
}

/**
 * The first balanced JSON value in `text`, ignoring braces that live inside
 * string literals.
 *
 * Returns null when nothing opens, when the brackets never balance (a truncated
 * answer), or when the closing bracket does not match the opener.
 */
export function scanBalancedJson(text) {
  const start = text.search(/[[{]/);
  if (start === -1) return null;

  const closerFor = { "{": "}", "[": "]" };
  const stack = [];
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "{" || ch === "[") { stack.push(closerFor[ch]); continue; }
    if (ch === "}" || ch === "]") {
      if (stack.length === 0 || stack.pop() !== ch) return null;
      if (stack.length === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/** The contents of the first fenced code block, or null when there is none. */
export function fencedBlock(text) {
  const match = text.match(/```(?:json|jsonc|json5)?[ \t]*\r?\n([\s\S]*?)```/i);
  return match ? match[1].trim() : null;
}

/**
 * Apply `fn` to every stretch of `text` that is outside a JSON string literal.
 *
 * Used so a global rewrite (True -> true) cannot corrupt a value that happens
 * to contain the same letters inside quotes.
 */
function mapOutsideStrings(text, fn) {
  let out = "";
  let inString = false;
  let escaped = false;
  let segment = "";

  const flush = () => { if (segment) { out += fn(segment); segment = ""; } };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') { inString = false; }
      continue;
    }
    if (ch === '"') { flush(); out += ch; inString = true; continue; }
    segment += ch;
  }
  flush();
  return out;
}

/**
 * Fix the coding slips that make an otherwise-complete payload invalid.
 *
 * Python/JS literals, single-quoted strings, and trailing commas - in that order,
 * because a single-quoted payload cannot be rewritten after double quotes exist.
 */
export function repairJsonText(text) {
  if (typeof text !== "string") return text;

  let out = mapOutsideStrings(text, (seg) =>
    seg
      .replace(/\bTrue\b/g, "true")
      .replace(/\bFalse\b/g, "false")
      .replace(/\bNone\b/g, "null")
      .replace(/\bNaN\b/g, "null")
      .replace(/\bInfinity\b/g, "null")
      .replace(/-Infinity\b/g, "null")
  );

  if (!out.includes('"') && out.includes("'")) {
    out = out.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_, inner) => `"${inner}"`);
  }

  return out.replace(/,\s*([}\]])/g, "$1");
}

/**
 * Close a payload the output limit cut off.
 *
 * Three candidates, tried in order, first that parses wins:
 *
 *   1. append the missing closers to the whole text - only legal when the cut
 *      did not land inside a string literal, because a half-written string that
 *      gets closed reads as a complete (but wrong) value
 *   2. roll back to the comma at the innermost still-open level, then close
 *   3. drop the innermost container's partial member entirely, then close
 *
 * Order matters: in `{"outer":{"inner":[1,2,3` the trailing `3` is a complete
 * value, so candidate 1 keeps it and only the brackets get added. In
 * `{"path":"/a","content":"abc","opt` the cut landed inside a string, so
 * candidate 1 is skipped and candidate 2 drops the partial member instead of
 * handing back a silently truncated value.
 */
export function closeTruncatedJson(text) {
  if (typeof text !== "string" || !text.trim()) return text;

  const openerPos = []; // index of each still-open container's opening bracket
  let inString = false;
  let escaped = false;
  let lastComma = -1; // last comma inside the innermost open container
  let lastOpener = -1;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "{" || ch === "[") {
      openerPos.push(i);
      lastOpener = i;
      lastComma = -1; // a comma before this opener belongs to the outer level
      continue;
    }
    if (ch === "}" || ch === "]") {
      if (openerPos.length === 0) return text;
      openerPos.pop();
      lastComma = -1; // this container closed cleanly; nothing to roll back
      continue;
    }
    if (ch === ",") lastComma = i;
  }

  if (openerPos.length === 0) return text;

  const closers = openerPos
    .slice()
    .reverse()
    .map((pos) => (text[pos] === "{" ? "}" : "]"))
    .join("");

  const cutInsideString = inString;
  const candidates = [];

  if (!cutInsideString) candidates.push(text + closers);
  if (lastComma >= 0) candidates.push(text.slice(0, lastComma) + closers);
  candidates.push(text.slice(0, lastOpener + 1) + closers);

  for (const candidate of candidates) {
    if (tryParse(candidate) !== undefined) return candidate;
  }
  return candidates[0];
}

/**
 * Coerce a model answer into a value a caller can parse.
 *
 * Returns { value, repaired, truncated } on success and null when nothing in the
 * answer parses - the caller then decides between surfacing an error and passing
 * the original text through.
 */
export function coerceJsonOutput(text) {
  if (typeof text !== "string") return null;

  const direct = tryParse(text);
  if (direct !== undefined) return { value: direct, repaired: false, truncated: false };

  const trimmed = text.trim();
  if (!trimmed) return null;

  const fence = fencedBlock(trimmed);
  if (fence) {
    const fromFence = tryParse(fence) ?? tryParse(repairJsonText(fence));
    if (fromFence !== undefined) {
      return { value: fromFence, repaired: true, truncated: false, source: "fence" };
    }
  }

  const balanced = scanBalancedJson(trimmed);
  if (balanced) {
    const fromProse = tryParse(balanced);
    if (fromProse !== undefined) {
      return { value: fromProse, repaired: true, truncated: false, source: "balanced" };
    }
  }

  const repaired = repairJsonText(trimmed);
  const afterRepair = tryParse(repaired);
  if (afterRepair !== undefined) {
    return { value: afterRepair, repaired: true, truncated: false, source: "repair" };
  }

  const closed = closeTruncatedJson(repaired);
  const afterClose = tryParse(closed);
  if (afterClose !== undefined) {
    return { value: afterClose, repaired: true, truncated: true, source: "truncated" };
  }

  return null;
}

/**
 * The `function.arguments` string of one tool call, coerced to an object.
 *
 * Returns { args, repaired } with args === null when the arguments are not an
 * object at all - an array or a bare scalar is valid JSON but not a valid
 * argument list, and the caller must not treat it as one.
 */
export function coerceToolArguments(raw) {
  if (raw == null) return { args: {}, repaired: false };
  if (typeof raw === "object" && !Array.isArray(raw)) return { args: raw, repaired: false };

  const text = typeof raw === "string" ? raw : JSON.stringify(raw);
  const parsed = coerceJsonOutput(text);
  if (!parsed) return { args: null, repaired: false, unparseable: true };
  if (typeof parsed.value !== "object" || parsed.value === null || Array.isArray(parsed.value)) {
    return { args: null, repaired: parsed.repaired, notAnObject: true };
  }
  return { args: parsed.value, repaired: parsed.repaired, truncated: parsed.truncated };
}

/**
 * Rewrite a completion payload so its text and tool-call arguments are parseable.
 *
 * Operates on the client's format (choices[] for Chat Completions, content blocks
 * for Claude), because that is what the caller validates. Mutates and returns
 * `payload` so it drops into the existing response pipeline, and reports what it
 * did so the request log can show it.
 *
 * `tools` is the schema list from the request. When present, a call carrying
 * argument names the schema never declared is fixed (dropped) rather than left
 * to fail client-side validation.
 */
export function applyJsonGuard(payload, tools = null) {
  if (!payload || typeof payload !== "object") return { changed: false, stats: null };

  const stats = {
    textRepaired: 0,
    argsRepaired: 0,
    argsDropped: 0,
    argsCleaned: 0,
    argsFilled: 0,
    argsMissing: 0,
  };
  const schemas = indexToolSchemas(tools);

  for (const choice of payload.choices || []) {
    const message = choice?.message;
    if (!message) continue;

    if (typeof message.content === "string" && message.content.trim() && wantsJsonAnswer(message.content, payload)) {
      const coerced = coerceJsonOutput(message.content);
      if (coerced && coerced.repaired) {
        message.content = JSON.stringify(coerced.value);
        stats.textRepaired += 1;
      }
    }

    for (const call of message.tool_calls || []) {
      const fn = call?.function;
      if (!fn) continue;
      const coerced = coerceToolArguments(fn.arguments);
      if (coerced.args === null) {
        stats.argsDropped += 1;
        continue;
      }
      if (coerced.repaired) {
        fn.arguments = JSON.stringify(coerced.args);
        stats.argsRepaired += 1;
      }
      if (schemas) {
        const cleaned = filterArguments(coerced.args, schemas.get(fn.name));
        if (cleaned.dropped.length || cleaned.filled.length) {
          stats.argsCleaned += 1;
          stats.argsFilled += cleaned.filled.length;
          stats.argsMissing += cleaned.missing.length;
          fn.arguments = JSON.stringify(cleaned.args);
        }
      }
    }
  }

  for (const block of payload.content || []) {
    if (block?.type === "tool_use" && block.input && typeof block.input !== "object") {
      const coerced = coerceToolArguments(block.input);
      if (coerced.args) {
        block.input = coerced.args;
        stats.argsRepaired += 1;
      }
    }
  }

  const changed = stats.textRepaired + stats.argsRepaired + stats.argsDropped + stats.argsCleaned > 0;
  return { changed, stats: changed ? stats : null };
}

/**
 * Whether the text even tries to carry JSON.
 *
 * Guarded narrowly on purpose: free text without a JSON payload must pass
 * untouched, so this answers yes only for a fenced JSON block or a leading
 * balanced JSON value.
 */
function wantsJsonAnswer(text, payload) {
  if (!text) return false;
  if (payload?.response_format?.type === "json_object") return true;
  if (/```(?:json|jsonc|json5)?/i.test(text)) return true;
  const probe = text.trim();
  const opener = probe.search(/[[{]/);
  if (opener === -1) return false;
  // A balanced opener (optionally after short prose) says the payload exists.
  return scanBalancedJson(probe.slice(opener)) !== null;
}

/** name -> parameter schema, for calls whose arguments need schema filtering. */
function indexToolSchemas(tools) {
  if (!Array.isArray(tools) || tools.length === 0) return null;
  const map = new Map();
  for (const tool of tools) {
    const fn = tool?.type === "function" ? tool.function : (tool?.function || tool);
    if (fn?.name) map.set(fn.name, fn.parameters || fn.input_schema || null);
  }
  return map.size ? map : null;
}

/**
 * Drop argument names the tool schema never declared and fill safe defaults for
 * required arguments the model forgot.
 *
 * A model asked to call `read_file(path)` often emits `{"path": "...",
 * "lines": 20}`. The extra key fails client-side validation, so the agent sees
 * an error instead of a file. Missing required arguments get the schema default
 * when the schema names one, a neutral value for plain scalar types, and are
 * reported when nothing safe exists to fill.
 */
export function filterArguments(args, schema) {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return { args, dropped: [], filled: [], missing: [] };
  }
  if (!schema || typeof schema !== "object") {
    return { args, dropped: [], filled: [], missing: [] };
  }

  const properties = schema.properties && typeof schema.properties === "object" ? schema.properties : null;
  const allowed = properties ? new Set(Object.keys(properties)) : null;
  const required = Array.isArray(schema.required) ? schema.required : [];

  const result = {};
  const dropped = [];
  for (const [key, value] of Object.entries(args)) {
    if (allowed && !allowed.has(key)) {
      dropped.push(key);
      continue;
    }
    result[key] = value;
  }

  const filled = [];
  const missing = [];
  for (const key of required) {
    if (result[key] !== undefined) continue;
    const prop = properties?.[key];
    if (prop && typeof prop === "object" && "default" in prop) {
      result[key] = prop.default;
      filled.push(key);
    } else if (prop?.type === "boolean") {
      result[key] = false;
      filled.push(key);
    } else if (prop?.type === "number" || prop?.type === "integer") {
      result[key] = 0;
      filled.push(key);
    } else if (prop?.type === "array") {
      result[key] = [];
      filled.push(key);
    } else {
      missing.push(key);
    }
  }

  return { args: result, dropped, filled, missing };
}
