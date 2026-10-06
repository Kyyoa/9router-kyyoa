// Deterministic reading of a generated PRD: pull the implementation plan out of
// the document as an ordered task list, plus the loose ends that are easy to lose
// when the PRD ships (unchecked boxes in test/release lists, open questions).
// Pure string processing with no imports, so it runs in plain node for tests.

const PLAN_PATTERNS = [
  /implementation\s*(?:plan|roadmap|approach|sequenc|schedule)/,
  /delivery\s*(?:plan|schedule|timeline|roadmap)/,
  /build\s*(?:plan|sequence)/,
  /execution\s*plan/,
  /work\s*stream/,
  /milestone/,
  /phasing/,
  /^implementation\b/,
  /^plan\b/,
  /^roadmap\b/,
  /^sequenc/,
];

// Sections whose unchecked boxes are worth keeping as tasks.
const FOLLOWUP_PATTERNS = [
  /test\s*strateg/,
  /\bqa\b/,
  /checklist/,
  /release/,
  /launch/,
  /go\s*live/,
  /deploy/,
  /rollout/,
  /runbook/,
  /definition\s*of\s*done/,
  /handover/,
];

const OPEN_QUESTION_PATTERNS = [/open\s*question/, /assumption/, /^questions?\b/, /unresolved/];

// Header text -> task field, first rule that matches wins, first column wins a field.
const COLUMN_RULES = [
  ["depends", /depend|\bdeps?\b|blocker|blocked|require|\bneed\b|predecessor|\bafter\b/],
  ["owner", /owner|\brole\b|team|assignee|responsible|\bwho\b/],
  ["estimate", /estimat|\beffort\b|\bsize\b|duration|\bdays?\b|\bweeks?\b|\bpoints?\b|t-?shirt|window/],
  ["risk", /\brisk\b|likelihood|\bimpact\b/],
  ["id", /\bid\b|^no?\b|^number|^num\b|^#$/],
  [
    "title",
    /deliverable|\btask\b|scope|output|\bwork\b|\bitem\b|description|summary|\bname\b|title|milestone|activit|component|feature|\bstory\b|\bepic\b/,
  ],
];

const FENCE_RE = /^\s*(`{3,}|~{3,})/;
const HEADING_RE = /^(#{1,6})\s+(\S.*?)\s*#*$/;
const ITEM_RE = /^\s*(?:[-*+]|\d+[.)]|\([a-z0-9]+\))\s+(.*)$/i;
const CHECKBOX_RE = /^\[([ xX])\]\s*(.*)$/;
const CELL_DASH_RE = /^\s*:?-{1,}:?\s*$/;
const NO_VALUE_RE = /^(?:none|n\s*\/?\s*a|nothing|nil|tbd|-+|—+|\.\.+)$/i;
// Prose a "Depends on" cell can contain on top of the ids themselves.
const ID_NOISE_RE = /(?:\b(?:and|plus|then|once|after|before|due to|following|the|to|of|on|by|for|its|our|all|will|block(?:ed)?\s*by|blockers?|depends?(?:\s*on)?|requires?|needs?)\b|[^\p{L}\p{N}._-]+)|(?: {2,})/giu;
// Only tokens shaped like an id are worth reporting when they resolve to nothing.
const ID_LIKE_RE = /^(?:\d{1,4}|[A-Za-z]{1,6}[-_.]?\d{1,4}|[A-Za-z]{1,3})$/;

function toLines(md) {
  return String(md || "").replace(/\r\n?/g, "\n").split("\n");
}

function cleanText(value) {
  let text = String(value === undefined || value === null ? "" : value);
  text = text.replace(/<br\s*\/?>/gi, " ").replace(/&nbsp;/gi, " ");
  text = text.replace(/!?\[([^\]]*)\]\([^)\s]*\)/g, "$1");
  text = text.replace(/[*_`]+/g, "");
  text = text.replace(/\s+/g, " ").trim();
  return text.replace(/\s*[:;]\s*$/, "").trim();
}

/** Heading text with the numbering, bold markers and trailing punctuation removed. */
function headingTitle(text) {
  return String(text || "")
    .replace(/^#+\s*/, "")
    .replace(/^\s*\(?\d+[.)]\s*/, "")
    .replace(/[*_`]/g, "")
    .replace(/\s+#+\s*$/, "")
    .replace(/[\s.:;!–—-]+$/, "")
    .trim();
}

/** Lowercased word-only form used for matching headings against the patterns. */
function headingKey(text) {
  return headingTitle(text)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toLowerCase();
}

function toggleFence(state, line) {
  const match = FENCE_RE.exec(line || "");
  if (!match) return state;
  const marker = match[1][0];
  if (!state) return marker;
  return marker === state ? null : state;
}

/** Headings plus the line range each one owns, with fenced code blocks skipped. */
function scanSections(lines) {
  const found = [];
  let fence = null;
  for (let i = 0; i < lines.length; i += 1) {
    fence = toggleFence(fence, lines[i]);
    if (fence) continue;
    const heading = HEADING_RE.exec(lines[i]);
    if (!heading) continue;
    found.push({
      level: heading[1].length,
      title: headingTitle(heading[2]),
      key: headingKey(heading[2]),
      start: i + 1,
      end: lines.length,
    });
  }
  for (let i = 0; i < found.length; i += 1) {
    for (let j = i + 1; j < found.length; j += 1) {
      if (found[j].level <= found[i].level) {
        found[i].end = found[j].start - 1;
        break;
      }
    }
  }
  return found;
}

/** Sections whose heading matches, nested hits folded into their parent. */
function pickSections(sections, patterns) {
  const picked = [];
  for (const section of sections) {
    if (!patterns.some((re) => re.test(section.key))) continue;
    if (picked.some((p) => section.start > p.start && section.end <= p.end)) continue;
    picked.push(section);
  }
  return picked;
}

function splitRow(line) {
  let text = String(line || "").trim();
  if (text.startsWith("|")) text = text.slice(1);
  if (text.endsWith("|") && !text.endsWith("\\|")) text = text.slice(0, -1);
  const cells = [];
  let current = "";
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === "\\" && text[i + 1] === "|") {
      current += "|";
      i += 1;
      continue;
    }
    if (char === "|") {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function isSeparatorRow(line) {
  if (!line || !line.includes("-") || !line.includes("|")) return false;
  const cells = splitRow(line);
  return cells.length > 1 && cells.every((cell) => CELL_DASH_RE.test(cell));
}

function headingAbove(section, lines, index) {
  for (let i = index - 1; i >= section.start; i -= 1) {
    const heading = HEADING_RE.exec(lines[i] || "");
    if (heading) return headingTitle(heading[2]);
  }
  return section.title;
}

/** Every pipe table in a range as { headers, rows, source }. */
function findTables(lines, section) {
  const tables = [];
  let fence = null;
  let i = section.start;
  while (i < section.end) {
    const before = fence;
    fence = toggleFence(fence, lines[i]);
    if (fence || before) {
      i += 1;
      continue;
    }
    const header = lines[i] || "";
    if (header.includes("|") && isSeparatorRow(lines[i + 1])) {
      const headers = splitRow(header);
      const rows = [];
      let j = i + 2;
      while (j < section.end && (lines[j] || "").includes("|") && !HEADING_RE.test(lines[j])) {
        if (!isSeparatorRow(lines[j])) {
          const cells = splitRow(lines[j]);
          if (cells.some((cell) => cell !== "")) rows.push(cells);
        }
        j += 1;
      }
      tables.push({ headers, rows, source: headingAbove(section, lines, i) });
      i = j;
      continue;
    }
    i += 1;
  }
  return tables;
}

function fieldFor(header) {
  const key = cleanText(header).toLowerCase();
  if (!key) return null;
  for (const [field, re] of COLUMN_RULES) {
    if (re.test(key)) return field;
  }
  return null;
}

function mapColumns(headers) {
  const map = {};
  headers.forEach((header, index) => {
    const field = fieldFor(header);
    if (field && map[field] === undefined) map[field] = index;
  });
  return map;
}

function cellAt(cells, index) {
  return index === undefined || index === null ? "" : cleanText(cells[index]);
}

/** Cell text before markdown is stripped, so a bold id marker survives. */
function rawAt(cells, index) {
  return index === undefined || index === null ? "" : String(cells[index] || "").trim();
}

/** Bullet, numbered and checkbox items in a range, with their checkbox state. */
function findListItems(lines, section) {
  const items = [];
  let fence = null;
  for (let i = section.start; i < section.end; i += 1) {
    const line = lines[i] || "";
    fence = toggleFence(fence, line);
    if (fence) continue;
    const match = ITEM_RE.exec(line);
    if (!match) continue;
    const body = match[1].replace(/^\d+[.)]\s+/, "");
    const checkbox = CHECKBOX_RE.exec(body);
    items.push({
      raw: checkbox ? checkbox[2] : body,
      checked: checkbox ? checkbox[1] !== " " : null,
      source: headingAbove(section, lines, i),
      index: i,
    });
  }
  return items;
}

/** "M2 — Lock the schema" splits into an id plus the remaining text. */
function splitLeadingId(text) {
  const value = String(text || "").trim();
  const patterns = [
    /^\*{1,3}\s*([A-Za-z]{1,6}[-_.]?\d{1,4})\s*\*{1,3}\s*[:.–—-]?\s*(.*)$/s,
    /^\[\s*([A-Za-z]{1,6}[-_.]?\d{1,4})\s*\]\s*[:.–—-]?\s*(.*)$/s,
    /^\(?\s*([A-Za-z]{1,6}[-_.]?\d{1,4})\s*\)?\s*[:.–—-]\s*(.*)$/s,
  ];
  for (const re of patterns) {
    const match = re.exec(value);
    if (match && cleanText(match[2])) {
      return { id: match[1].replace(/[.\s]+$/, ""), title: cleanText(match[2]) };
    }
  }
  return { id: "", title: cleanText(value) };
}

/** Id-shaped candidates from a "Depends on" cell; matching against real ids comes later. */
function extractIdTokens(cell) {
  if (!cell || NO_VALUE_RE.test(cell)) return [];
  return String(cell)
    .replace(/[*_`]/g, " ")
    .split(ID_NOISE_RE)
    .map((token) => token.replace(/[.)\-_,;:]+$/g, ""))
    .filter((token) => token && token.length <= 16);
}

function taskFromRow(cells, columns, source) {
  const rawId = cleanText(rawAt(cells, columns.id));
  const rawTitle = rawAt(cells, columns.title);
  if (!rawId && !rawTitle) return null;
  let id = rawId;
  let title = "";
  if (rawTitle) {
    const label = splitLeadingId(rawTitle);
    if (!id) id = label.id;
    title = label.title;
  } else {
    const label = splitLeadingId(rawId);
    id = label.id;
    title = label.title;
  }
  const dependsCell = cellAt(cells, columns.depends);
  return {
    id,
    title: cleanText(title),
    owner: cellAt(cells, columns.owner),
    dependsOn: extractIdTokens(dependsCell),
    estimate: cellAt(cells, columns.estimate),
    risk: cellAt(cells, columns.risk),
    source: cleanText(source),
  };
}

function tasksFromTable(table) {
  const columns = mapColumns(table.headers);
  const tasks = [];
  if (columns.title === undefined && columns.id === undefined) {
    return { tasks, unreadable: true };
  }
  for (const cells of table.rows) {
    const task = taskFromRow(cells, columns, table.source);
    if (task && task.title) tasks.push(task);
  }
  return { tasks, unreadable: false };
}

function tasksFromItems(items) {
  const tasks = [];
  for (const item of items) {
    if (item.checked === true) continue;
    const label = splitLeadingId(item.raw);
    if (!label.title) continue;
    tasks.push({
      id: label.id,
      title: label.title,
      owner: "",
      dependsOn: [],
      estimate: "",
      risk: "",
      source: cleanText(item.source),
    });
  }
  return tasks;
}

/** Tasks with no id in the document get one from their position in it. */
function giveMissingIds(tasks) {
  const used = new Set(tasks.map((task) => task.id.toLowerCase()).filter(Boolean));
  let next = 0;
  let assigned = 0;
  for (const task of tasks) {
    if (task.id) continue;
    let candidate = "";
    do {
      next += 1;
      candidate = `T${next}`;
    } while (used.has(candidate.toLowerCase()));
    used.add(candidate.toLowerCase());
    task.id = candidate;
    assigned += 1;
  }
  return assigned;
}

function dedupeTasks(tasks, warnings) {
  const seenId = new Set();
  const seenTitle = new Set();
  const kept = [];
  for (const task of tasks) {
    const idKey = task.id.toLowerCase();
    const titleKey = task.title.toLowerCase();
    if ((idKey && seenId.has(idKey)) || seenTitle.has(titleKey)) {
      warnings.push(`Duplicate task ${task.id || `"${task.title}"`} was skipped.`);
      continue;
    }
    if (idKey) seenId.add(idKey);
    seenTitle.add(titleKey);
    kept.push(task);
  }
  return kept;
}

/** Rewrites every dependency token to a real task id, dropping the rest. */
function resolveDependencies(tasks, warnings) {
  const byId = new Map();
  for (const task of tasks) {
    if (!byId.has(task.id.toLowerCase())) byId.set(task.id.toLowerCase(), task);
  }
  const unknown = new Set();
  for (const task of tasks) {
    const deps = [];
    for (const token of task.dependsOn) {
      const match = byId.get(token.toLowerCase());
      if (!match) {
        if (ID_LIKE_RE.test(token)) unknown.add(token);
        continue;
      }
      if (match === task) continue;
      if (!deps.includes(match.id)) deps.push(match.id);
    }
    task.dependsOn = deps;
  }
  if (unknown.size) {
    const list = [...unknown].slice(0, 6).join(", ");
    warnings.push(`Dependencies on ids that are not in the plan were ignored (${list}).`);
  }
  return byId;
}

/** Kahn's algorithm with document order as the tie-break; cycles unravel from the earliest task. */
function topoSort(tasks) {
  const placed = new Set();
  const pending = [...tasks];
  const ordered = [];
  const cycles = [];
  while (pending.length) {
    let take = pending.findIndex((task) => task.dependsOn.every((dep) => placed.has(dep.toLowerCase())));
    if (take === -1) {
      take = 0;
      const stuck = pending[0];
      const unmet = stuck.dependsOn.filter((dep) => !placed.has(dep.toLowerCase()));
      cycles.push(`${stuck.id} ← ${unmet.join(", ")}`);
    }
    const [task] = pending.splice(take, 1);
    ordered.push(task);
    placed.add(task.id.toLowerCase());
  }
  return { ordered, cycles };
}

function groupItem(section, item) {
  const text = cleanText(item.raw);
  if (!text) return "";
  const sub = cleanText(item.source);
  return sub && sub !== section.title ? `**${sub}**: ${text}` : text;
}

/** Loose ends worth not losing: unchecked boxes in test/release lists, then open questions. */
function buildGroups(lines, sections, planSections) {
  const outside = (section) =>
    !planSections.some((p) => section.start >= p.start && section.end <= p.end);
  const collected = [];

  for (const section of pickSections(sections.filter(outside), FOLLOWUP_PATTERNS)) {
    const items = findListItems(lines, section)
      .filter((item) => item.checked === false)
      .map((item) => groupItem(section, item))
      .filter(Boolean);
    if (items.length) collected.push({ start: section.start, title: section.title, items });
  }

  for (const section of pickSections(sections.filter(outside), OPEN_QUESTION_PATTERNS)) {
    const items = [];
    for (const item of findListItems(lines, section)) {
      if (item.checked === true) continue;
      const label = splitLeadingId(item.raw);
      if (!label.title) continue;
      items.push(`Resolve: ${label.id ? `**${label.id}** ` : ""}${label.title}`);
    }
    if (items.length) collected.push({ start: section.start, title: section.title, items });
  }

  return collected
    .sort((a, b) => a.start - b.start)
    .map((group) => ({ title: group.title, items: group.items }));
}

/**
 * Reads a PRD and returns its implementation tasks in dependency order, plus the
 * follow-up groups merged in from the rest of the document.
 */
export function extractPlanFromMarkdown(md) {
  const warnings = [];
  const lines = toLines(md);
  const sections = scanSections(lines);
  const planSections = pickSections(sections, PLAN_PATTERNS);

  let tasks = [];
  for (const section of planSections) {
    const tables = findTables(lines, section);
    if (tables.length) {
      for (const table of tables) {
        const parsed = tasksFromTable(table);
        tasks = tasks.concat(parsed.tasks);
        if (parsed.unreadable) {
          warnings.push(`A table in "${section.title}" has no task or deliverable column, so it was skipped.`);
        }
      }
      continue;
    }
    const items = findListItems(lines, section);
    if (items.length) {
      tasks = tasks.concat(tasksFromItems(items));
      warnings.push(`"${section.title}" has no table, so its list was read as tasks.`);
    } else {
      warnings.push(`"${section.title}" exists but holds no task table or list.`);
    }
  }

  tasks = dedupeTasks(tasks, warnings);
  if (giveMissingIds(tasks)) {
    warnings.push("Tasks without an id were numbered in document order.");
  }
  resolveDependencies(tasks, warnings);
  const { ordered, cycles } = topoSort(tasks);
  if (cycles.length) {
    warnings.push(`Dependency cycle ${cycles.join("; ")} was broken in document order.`);
  }

  const groups = buildGroups(lines, sections, planSections);
  if (!planSections.length) {
    warnings.push("No implementation plan section was found in this document.");
  }
  return { tasks: ordered, groups, found: planSections.length > 0, warnings };
}

function taskLine(task) {
  const bits = [];
  const owner = cleanText(task && task.owner);
  const estimate = cleanText(task && task.estimate);
  const deps = (Array.isArray(task && task.dependsOn) ? task.dependsOn : []).map(cleanText).filter(Boolean);
  if (owner) bits.push(owner);
  if (deps.length) bits.push(`blocked by ${deps.join(", ")}`);
  if (estimate) bits.push(estimate);
  const id = cleanText(task && task.id) || "T?";
  const title = cleanText(task && task.title) || "(untitled task)";
  return `- [ ] **${id}** ${title}${bits.length ? ` *(${bits.join(" · ")})*` : ""}`;
}

/** GitHub-style checkbox list: the plan tasks first, then every merged-in group. */
export function renderTasksMarkdown(result) {
  const tasks = Array.isArray(result && result.tasks) ? result.tasks : [];
  const groups = Array.isArray(result && result.groups) ? result.groups : [];
  const lines = [];
  if (tasks.length) {
    lines.push("## Implementation tasks", "");
    for (const task of tasks) lines.push(taskLine(task));
    lines.push("");
  }
  for (const group of groups) {
    const items = (Array.isArray(group && group.items) ? group.items : [])
      .map((item) => String(item || "").trim())
      .filter(Boolean);
    if (!items.length) continue;
    lines.push(`## ${cleanText(group.title) || "Tasks"}`, "");
    for (const item of items) lines.push(`- [ ] ${item}`);
    lines.push("");
  }
  const body = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return body ? `${body}\n` : "";
}

function clip(text, max) {
  const value = String(text || "").trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max).trimEnd()}\n\n…(truncated)`;
}

/** The plan part of the document, so a long PRD still fits in one request. */
function planSectionText(md) {
  const lines = toLines(md);
  const planSections = pickSections(scanSections(lines), PLAN_PATTERNS);
  if (!planSections.length) return { title: "", text: "" };
  const chunks = planSections.map((section) => {
    const body = lines.slice(section.start - 1, section.end).join("\n").trim();
    return `## ${section.title}\n\n${body}`;
  });
  return { title: planSections[0].title, text: chunks.join("\n\n") };
}

/** Messages for the "ask the model" route to the same task list. */
export function buildPlanExtractionMessages(prdMarkdown) {
  const markdown = String(prdMarkdown || "").trim();
  const plan = planSectionText(markdown);
  const source = plan.text
    ? `PLAN SECTION (${plan.title}):\n\n${clip(plan.text, 26000)}`
    : `DOCUMENT:\n\n${clip(markdown, 48000)}`;

  const system = [
    "Turn the product requirements document below into an implementation task checklist.",
    "Output Markdown only: no preamble, no closing note, and never wrap the answer in a code fence.",
    "One task per line, written exactly as `- [ ] **<id>** <what to build>`, using the ids the document already uses and never inventing new ones.",
    "Put one `## <heading>` line above each group of tasks, following the document's own workstreams, milestones or phases.",
    "When a task depends on another, end its line with `*(blocked by <id>, <id>)*`, and add the owner and estimate inside the same parentheses when the document states them.",
    "Also give one line per unchecked box in the test and release sections, and one line per open question written as `Resolve: <question>`.",
    "Invent nothing: every line must be traceable to something the document says.",
    "Order the tasks so a blocker always comes before the work it blocks, and keep every line under 200 characters.",
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: `${source}\n\nWrite the task checklist now.` },
  ];
}

/** Strips fence markers and lead-in prose from a model-written checklist. */
export function cleanModelChecklist(text) {
  let value = String(text || "").trim();
  const fence = /```[a-zA-Z]*\s*\n([\s\S]*?)\n?\s*```/.exec(value);
  if (fence) value = fence[1].trim();
  const lines = value.split("\n").filter((line) => !/^\s*```/.test(line));
  const first = lines.findIndex((line) => /^\s*(?:#{1,6}\s|[-*+]\s\[[ xX]\])/.test(line));
  value = first > 0 ? lines.slice(first).join("\n").trim() : lines.join("\n").trim();
  return value ? `${value}\n` : "";
}
