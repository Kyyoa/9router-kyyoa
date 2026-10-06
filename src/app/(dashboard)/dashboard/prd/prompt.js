// Prompt catalogue for the PRD Document Writer: one library of sections, five document
// profiles, three depth levels. Kept as data so the checklist and the prompt can
// never disagree about what a complete PRD contains.

export const PRD_TEMPLATES = [
  {
    value: "product",
    label: "New Product",
    hint: "A 0→1 product: market, positioning, launch plan and full spec.",
    extraSections: ["market", "gtm"],
  },
  {
    value: "feature",
    label: "Feature Enhancement",
    hint: "A change inside a product that already has users and data.",
    extraSections: ["baseline", "compat"],
  },
  {
    value: "api",
    label: "API / Backend Service",
    hint: "Endpoints, contracts, limits, migrations and operations.",
    extraSections: ["limits", "dataops"],
  },
  {
    value: "internal",
    label: "Internal Tool",
    hint: "Admin or ops tooling with roles, audit trail and a runbook.",
    extraSections: ["permissions", "runbook"],
  },
  {
    value: "mobile",
    label: "Client / Mobile App",
    hint: "Device UX, offline behaviour, store release and telemetry.",
    extraSections: ["offline", "store"],
  },
  {
    value: "rfc",
    label: "RFC / Tech Spec",
    hint: "A design decision record: options weighed, choice made, cost and risk.",
    sections: [
      "overview", "problem", "goals", "scope", "alternatives", "decisions", "ux",
      "data", "api", "capacity", "integrations", "nonFunctional", "security",
      "migration", "observability", "testStrategy", "implementation", "rollout",
      "risks", "openQuestions", "release",
    ],
  },
  {
    value: "release",
    label: "Release Notes",
    hint: "A shipped release written for humans, with migration and known issues.",
    sections: [
      "headline", "whatNew", "fixes", "breaking", "userMigration", "performance",
      "metrics", "knownIssues", "support", "nextUp",
    ],
  },
  {
    value: "competitive",
    label: "Competitive Analysis",
    hint: "Rivals scored on capability, price and positioning, ending in a decision.",
    sections: [
      "overview", "problem", "scope", "market", "capabilityMatrix", "pricingLandscape",
      "positioningMap", "gaps", "personas", "metrics", "recommendations", "watchlist",
      "risks", "openQuestions",
    ],
  },
  {
    value: "incident",
    label: "Bug Report → Fix Plan",
    hint: "Root-cause analysis that ends in a fix, verification and prevention.",
    sections: [
      "overview", "symptom", "impact", "timeline", "baseline", "rootCause",
      "fixOptions", "decisions", "data", "api", "implementation", "testStrategy",
      "verification", "migration", "observability", "prevention", "risks",
      "openQuestions", "release",
    ],
  },
];

export const PRD_DEPTHS = [
  {
    value: "standard",
    label: "Standard",
    guidance:
      "Per section: 2-4 crisp bullets or one table, plus at most one short paragraph (60-120 words per section).",
  },
  {
    value: "deep",
    label: "Deep",
    guidance:
      "Per section: one table or 4-7 bullets, plus two short paragraphs of reasoning (180-280 words per section).",
  },
  {
    value: "exhaustive",
    label: "Exhaustive",
    guidance:
      "Per section: use ### sub-headings, tables, one worked example with real numbers, and an explicit counter-argument or failure analysis (300-450 words per section).",
  },
];

export const PRD_LANGUAGES = [
  { value: "en", label: "English" },
  { value: "id", label: "Bahasa Indonesia" },
];

const SECTION_LIBRARY = {
  overview: {
    heading: "Executive Summary",
    spec: "What is being built, for whom, why now, and the one headline number that defines success. Close with a metadata block: Status, Owner, Document version, Target release, Reviewers.",
  },
  problem: {
    heading: "Problem Statement & Evidence",
    spec: "The current pain, who feels it, how often, and what it costs today (time, money, churn, risk). List the evidence behind each claim: user quotes, support tickets, funnel numbers, incident history. State the cost of doing nothing.",
  },
  goals: {
    heading: "Goals & Non-Goals",
    spec: "Numbered goals G-1..G-n, each with a measurable outcome and the date it must be true. Numbered non-goals NG-1..NG-n that a stakeholder is likely to assume are in scope, each with the reason it is excluded.",
  },
  personas: {
    heading: "Target Users & Personas",
    spec: "Table: persona | job to be done | current workaround | pain severity | technical level | frequency of use | who pays vs who uses. Name the primary persona and what is sacrificed for secondary ones.",
  },
  scope: {
    heading: "Scope & Constraints",
    spec: "Explicit in-scope and out-of-scope lists, then the hard constraints: platform, existing stack, budget, headcount, deadline, regulatory or contractual limits, and any dependency that cannot be moved.",
  },
  userStories: {
    heading: "User Stories & Acceptance Criteria",
    spec: "US-1..US-n written as 'As a <persona>, I want <capability> so that <outcome>'. Each gets Given/When/Then acceptance criteria with at least one happy path and one failure path, a priority (P1/P2/P3), and the FR ids that implement it.",
  },
  functional: {
    heading: "Functional Requirements",
    spec: "Table: ID | Requirement | Priority | Source story | Verification method. Requirements are single, testable 'shall' statements with no adjectives like fast or robust; split any requirement that contains the word and.",
  },
  nonFunctional: {
    heading: "Non-Functional Requirements",
    spec: "NFR-1.. with hard numbers: latency percentiles, availability SLO and error budget, throughput and concurrency ceiling, payload and storage limits, data retention, RTO/RPO, security baseline, accessibility target, i18n and timezone rules.",
  },
  ux: {
    heading: "UX Flows & Screen Specification",
    spec: "Primary flow as numbered steps with the decision points, then a state matrix (empty, loading, partial, error, offline, success) saying exactly what each screen shows, including the microcopy, and how the user recovers from each error.",
  },
  data: {
    heading: "Data Model & Information Architecture",
    spec: "For each entity: field | type | nullability | default | indexed | owner | retention | PII flag. Then relationships, unique constraints, deletion and cascade rules, and what happens to rows that already exist when this ships.",
  },
  api: {
    heading: "API Contract",
    spec: "Method | path | auth | idempotent | rate-limited table, then one realistic request body and response body per endpoint as JSON code blocks, an error-code table (code | meaning | retryable | client action), and the versioning plus deprecation rule.",
  },
  integrations: {
    heading: "Dependencies & Integrations",
    spec: "Table: system | direction | protocol | credentials | owner | failure mode | timeout | fallback behaviour | what happens on partial success. Name any third-party limit or pricing cliff this feature can hit.",
  },
  edgeCases: {
    heading: "Edge Cases & Error States",
    spec: "Table: scenario | expected behaviour | user-facing message | severity | test id. Cover concurrency and double-submit, empty and maximum input, unicode and very long values, clock and timezone edges, network loss mid-operation, permission revoked mid-session, and upstream timeout.",
  },
  security: {
    heading: "Security, Privacy & Compliance",
    spec: "Threat list with mitigation (spoofing, tampering, repudiation, information disclosure, denial of service, elevation of privilege), the authn/authz matrix per action, PII inventory with legal basis, encryption in transit and at rest, audit log fields, abuse and rate-limit evasion cases, and the data-residency answer.",
  },
  migration: {
    heading: "Migration & Backward Compatibility",
    spec: "How old and new behaviour coexist: schema migration order, backfill size and batch plan, dual-write or shadow-read windows, feature flag defaults per stage, supported client versions, and the exact rollback procedure with its data consequences.",
  },
  observability: {
    heading: "Observability & Quality Gates",
    spec: "Event table (event | trigger | required properties | sampled), dashboards to build, alerts with threshold, window, severity and owner, the log fields that make a request traceable end to end, and the CI/CD quality gates that block a release.",
  },
  metrics: {
    heading: "Success Metrics",
    spec: "Table: metric | definition | baseline | target | measurement window | source of truth | owner. Then guardrail metrics with the trip-wire value that pauses the rollout, and what decision each outcome drives.",
  },
  rollout: {
    heading: "Rollout & Experiment Plan",
    spec: "Phased plan with entry and exit criteria per phase and a canary size, kill switch mechanics, and if an experiment is used: hypothesis, variants, primary metric, minimum detectable effect with the sample-size maths, guardrails, and the stop rule.",
  },
  testStrategy: {
    heading: "Test Strategy",
    spec: "Coverage targets per layer (unit, integration, contract, e2e, load, security, accessibility), the manual QA checklist keyed to acceptance-criteria ids, test data and seeding, flake and failure policy, and the definition of done for this feature.",
  },
  implementation: {
    heading: "Implementation Plan & Milestones",
    spec: "Workstream table: id | deliverable | depends on | owner role | estimate | risk. Then sequencing that respects the dependencies, milestone dates, what can be cut if the deadline holds, and the staffing or skill gap this plan assumes away.",
  },
  risks: {
    heading: "Risks & Mitigations",
    spec: "Table: risk | likelihood | impact | early warning signal | mitigation | contingency | owner. Include at least one product, one technical, one data or privacy, and one delivery risk, and the single assumption whose failure invalidates the plan.",
  },
  openQuestions: {
    heading: "Open Questions & Assumptions",
    spec: "Numbered open questions with who must answer and by when, then an assumptions table: assumption | confidence | how it will be validated | cost if wrong. Every number in the document that was invented must appear here.",
  },
  release: {
    heading: "Release Checklist",
    spec: "Ordered checkboxes in three groups - pre-launch, launch day, first week after - covering docs, telemetry, support handover, flag cleanup, backup or snapshot point, and the exact revert command if the launch goes wrong.",
  },
  // profile-specific sections
  market: {
    heading: "Market & Competitive Landscape",
    spec: "Table: competitor or alternative | positioning | pricing | what they do better | what they cannot do | our wedge. Size the audience with the arithmetic shown, and name the substitute people use today instead of a competitor.",
  },
  gtm: {
    heading: "Go-to-Market Plan",
    spec: "Launch tier and rationale, the first 100 users and how each channel is measured, pricing or packaging change, sales and support enablement, the messaging per persona, and the launch calendar with dependencies on other teams.",
  },
  baseline: {
    heading: "Current Behaviour Baseline",
    spec: "Describe what happens today, measured not remembered: current flow, current numbers, current complaints, and which of those this change is expected to move. State what must not regress.",
  },
  compat: {
    heading: "Compatibility & Coexistence",
    spec: "Old versus new behaviour side by side, which users keep the old path and for how long, the notification and documentation plan, and the compatibility test cases proving existing integrations survive.",
  },
  limits: {
    heading: "Rate Limits, Quota & Fair Use",
    spec: "Per key, per user, per tenant and per endpoint limits with the arithmetic behind them, burst handling, queueing or shedding policy, 429 contract with retry-after semantics, and the cost model at the free tier.",
  },
  dataops: {
    heading: "Data Operations",
    spec: "Growth projections with the maths, partitioning and index strategy, archival and deletion jobs, hot versus cold storage, backup and restore rehearsal cadence, and the query that will become expensive first.",
  },
  permissions: {
    heading: "Roles & Permission Matrix",
    spec: "Matrix: role | can view | can edit | can approve | can export | can administer, plus how permission changes are audited, who is the break-glass admin, and what happens to a leaver's sessions and owned records.",
  },
  runbook: {
    heading: "Support & Runbook",
    spec: "Triage table: symptom | first check | likely cause | fix | escalation path, the queries an operator runs to diagnose, known failure modes with their recovery time, and the on-call handover artefacts to write.",
  },
  offline: {
    heading: "Offline, Sync & Device Behaviour",
    spec: "What works with no network, the queue and conflict-resolution rule when two devices edit the same record, battery and data budget, background refresh cadence, cache invalidation, and the low-storage and clock-skew cases.",
  },
  store: {
    heading: "Store & Device Release Plan",
    spec: "Minimum OS and device matrix, staged rollout percentages with hold-back criteria, review-risk items and the reviewer note, forced-upgrade floor version with its support window, and the hotfix path when a release is already in review.",
  },
  // --- RFC, release notes, competitive analysis and incident profiles ---
  alternatives: {
    heading: "Alternatives Considered",
    spec: "Table: option | what it is | why it was rejected or kept | the cost of being wrong about it | the evidence that decided it. Include doing nothing as a real option, and name the option a smart opponent would still argue for.",
  },
  decisions: {
    heading: "Design Decisions",
    spec: "Numbered DEC-1.. decisions in the form 'we chose X over Y because Z', each with the rejected alternative, the consequence accepted, the condition that would reopen it, and which FR or NFR it satisfies.",
  },
  capacity: {
    heading: "Capacity & Cost Model",
    spec: "Show the arithmetic: units of work per day, peak multiplier, per-request size, storage growth per month, and the resulting compute, egress and provider spend at the free tier, current scale and 10× scale, with the line item that dominates.",
  },
  headline: {
    heading: "Release Headline",
    spec: "The release in one paragraph a non-engineer can repeat correctly, plus a metadata table: version, date, packages touched, upgrade risk level, and who to ping when it breaks.",
  },
  whatNew: {
    heading: "What's New",
    spec: "Group the changes by area a user cares about, each entry as 'capability - what it does now - how to start using it', with the exact setting, endpoint or button involved.",
  },
  fixes: {
    heading: "Fixes & Improvements",
    spec: "Table: id | symptom users saw | what changed | issue or ticket reference. Every entry must be phrased as the user's complaint, not the internal diff.",
  },
  breaking: {
    heading: "Breaking Changes",
    spec: "Table: change | who is affected | the exact symptom if ignored | required action | deadline. State 'none' explicitly when nothing broke, and list the deprecation clock for anything removed.",
  },
  performance: {
    heading: "Performance & Reliability Delta",
    spec: "Before/after table: metric | baseline | this release | method of measurement, plus the regression you accepted and the error budget it consumed.",
  },
  userMigration: {
    heading: "User Migration Guide",
    spec: "Step-by-step upgrade path with copy-pasteable commands, the config or data each step touches, how long the dual-run window stays open, and the exact rollback for someone who upgrades and regrets it.",
  },
  knownIssues: {
    heading: "Known Issues",
    spec: "Table: issue | who hits it | workaround | severity | planned fix version - and do not omit the embarrassing one just because a fix already exists in a branch.",
  },
  support: {
    heading: "Support & Communications",
    spec: "The docs and in-app copy that changed, the changelog or newsletter line, the escalation path with names, and the three questions support will get asked in week one with their answers.",
  },
  nextUp: {
    heading: "Next Up",
    spec: "What ships next and why that order, the follow-ups deliberately cut from this release with their trigger condition, and the open experiment or flag that will be retired next.",
  },
  capabilityMatrix: {
    heading: "Capability Matrix",
    spec: "Table of competitor | each must-have capability | their answer | ours | the evidence source and its date. Mark unknown cells as unverified rather than guessing, and state how the matrix will be re-validated.",
  },
  pricingLandscape: {
    heading: "Pricing & Packaging",
    spec: "Compare plans, metering unit, free-tier ceiling, contract traps and effective price at three usage levels, then state where a buyer churns to a rival on price alone.",
  },
  positioningMap: {
    heading: "Positioning Map",
    spec: "Pick the two axes customers actually buy on, place every player with the reasoning, then name the quadrant that is empty and whether it is empty because nobody wants it or because nobody can build it.",
  },
  gaps: {
    heading: "Gaps & Opportunities",
    spec: "Table: gap | severity | how fast a rival closes it | effort for us | revenue or retention impact, separated into feature gaps, trust gaps and distribution gaps.",
  },
  recommendations: {
    heading: "Strategic Recommendations",
    spec: "Ranked REC-1.. with the action, the expected measurable effect, the cost, the owner, and the strongest counter-argument that must be answered before the recommendation is accepted.",
  },
  watchlist: {
    heading: "Watchlist & Refresh Cadence",
    spec: "Which rivals, signals and dates to monitor, the trip-wire that forces a re-analysis, who owns the watch, and the exact source each signal will be measured from.",
  },
  symptom: {
    heading: "Symptom & Detection",
    spec: "What broke as the user experienced it, when it started, how it was detected (alert, ticket, someone noticed), the blast radius in real numbers, and the first signal that was missed.",
  },
  impact: {
    heading: "User & Business Impact",
    spec: "Quantify affected users, requests, revenue, trust and internal time, plus the SLA or contractual exposure and the support cost. Separate what is confirmed from what is estimated.",
  },
  timeline: {
    heading: "Timeline of Events",
    spec: "Timestamped table from the change that started it to detection, mitigations attempted, resolution and the residual state, each row marking what was known at that moment versus what turned out to be true.",
  },
  rootCause: {
    heading: "Root Cause Analysis",
    spec: "Walk the causal chain to the root cause and prove it with evidence, separate contributing factors from the root cause, list what allowed it to spread (tests, review, flags, monitoring), and name the hypothesis still unconfirmed.",
  },
  fixOptions: {
    heading: "Fix Options",
    spec: "Table: option | blast radius | effort | risk | rollback difficulty | how long until users are safe, and name the option that only buys time so nobody mistakes it for the fix.",
  },
  verification: {
    heading: "Verification & Regression Guard",
    spec: "How the fix is proven - the reproduction that fails before and passes after, the new automated test that locks it in, the monitoring that would have caught it, and the manual check for the affected population.",
  },
  prevention: {
    heading: "Prevention & Follow-ups",
    spec: "Numbered ACTION-1.. items with owner, due date and the mechanism that makes the class of failure impossible (lint rule, migration guard, default change, alert), plus the process assumption being fixed rather than the code.",
  },
};

// Every document gets these, in this order.
const CORE_SECTIONS = [
  "overview",
  "problem",
  "goals",
  "personas",
  "scope",
  "userStories",
  "functional",
  "nonFunctional",
  "ux",
  "data",
  "api",
  "integrations",
  "edgeCases",
  "security",
  "migration",
  "observability",
  "metrics",
  "rollout",
  "testStrategy",
  "implementation",
  "risks",
  "openQuestions",
  "release",
];

/**
 * Ordered section descriptors for a profile. A profile either replaces the whole
 * outline (`sections`) or extends the core list with extras after the functional
 * requirements; ids that do not exist in the library are dropped.
 */
export function resolveSections(template) {
  const profile = PRD_TEMPLATES.find((t) => t.value === template) || PRD_TEMPLATES[0];
  const ids = Array.isArray(profile.sections) && profile.sections.length
    ? [...profile.sections]
    : [...CORE_SECTIONS];
  const extras = (profile.extraSections || []).filter((id) => SECTION_LIBRARY[id]);
  if (extras.length) {
    const at = ids.indexOf("functional") + 1;
    ids.splice(at > 0 ? at : ids.length, 0, ...extras);
  }
  return ids.filter((id) => SECTION_LIBRARY[id]).map((id) => ({ id, ...SECTION_LIBRARY[id] }));
}

const HINT_FIELDS = [
  ["product", "Product / feature name"],
  ["users", "Primary users"],
  ["problem", "Problem to solve"],
  ["stack", "Platform / stack"],
  ["constraints", "Hard constraints"],
  ["nonGoals", "Already-known non-goals"],
  ["metrics", "Metrics that matter"],
  ["timeline", "Timeline or target date"],
  ["team", "Team building it"],
  ["notes", "Extra context, prior art, links"],
];

function renderBrief(fields) {
  return HINT_FIELDS.filter(([key]) => String(fields?.[key] || "").trim())
    .map(([key, label]) => `- ${label}: ${String(fields[key]).trim()}`)
    .join("\n");
}

/**
 * Builds the two messages that produce a full PRD. Everything the model must do
 * lives here so the checklist in the UI can prove which sections arrived.
 */
export function buildPrdMessages({ brief, fields, template, depth, language, sections, includeAppendix }) {
  const outline = resolveSections(template).filter(
    (s) => !sections?.length || sections.includes(s.id)
  );
  const depthLevel = PRD_DEPTHS.find((d) => d.value === depth) || PRD_DEPTHS[1];
  const langLine =
    language === "id"
      ? "Write the whole document in Bahasa Indonesia; keep section ids, JSON keys and code samples in English."
      : "Write the whole document in English.";

  const system = [
    "You are a principal product manager writing an enterprise-grade Product Requirements Document that an engineering team can build from without asking a single follow-up question.",
    langLine,
    "Output Markdown only: no preamble, no closing note, no apologies, and never wrap the answer in a code fence.",
    "First line is `# PRD: <product name>`. Then a one-paragraph summary under 60 words. Then the sections below as `## <heading>`, in exactly this order and with exactly these headings.",
    `${depthLevel.guidance}`,
    "Never leave a section as a stub: no TBD, no lorem ipsum, no 'as needed', no 'etc'.",
    "Quantify: every claim carries a number, a percentile, a count, or a named source. When the brief lacks a number, propose a defensible one and mark it `[assumed]`.",
    "Use pipe tables for anything enumerable, code blocks for JSON or payloads, and stable ids (G-, NG-, US-, FR-, NFR-, RISK-, Q-, ASM-, EVT-) that never repeat or skip.",
    "Cross-reference instead of repeating: user stories cite FR ids, FR ids cite US ids, tests cite both.",
    "Every requirement must be falsifiable - a reviewer can decide pass or fail from the words alone.",
    "Consider hostile and accidental misuse in every flow, not only the happy path.",
    includeAppendix
      ? "End the document with `## Appendix` containing a glossary of every term used, then the full assumption register repeated as a numbered list."
      : "Do not add an Appendix section.",
    "Stay inside a single model response. If you must trim, trim prose before structure - every required heading must still be present.",
    ...outline.map((s, i) => `${i + 1}. ${s.heading} — ${s.spec}`),
  ].join("\n");

  const user = [
    `Document profile: ${PRD_TEMPLATES.find((t) => t.value === template)?.label || template}.`,
    `Depth: ${depthLevel.label}.`,
    "",
    "BRIEF",
    String(brief || "").trim() || "(none supplied - infer a defensible product from the name and state every guess in Assumptions)",
    "",
    "SUPPLIED DETAILS",
    renderBrief(fields) || "- none; assume sensible defaults and record them in Open Questions & Assumptions",
    "",
    "Write the complete document now.",
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/** Second pass: the same or another model audits the draft, then rewrites it. */
export function buildReviewMessages({ draft, template, language, missing }) {
  const outline = resolveSections(template);
  const headings = outline.map((s) => s.heading);
  const langLine =
    language === "id" ? "Tulis ulang dokumen dalam Bahasa Indonesia." : "Rewrite the document in English.";

  return [
    {
      role: "system",
      content: [
        "You are a demanding VP of Product red-teaming a PRD before it reaches engineering. You find what is missing, vague, unmeasurable, unpriced, or unsafe.",
        "Step 1: list up to 12 concrete defects as `- DEFECT: <section> — <what is wrong> — <the fix>`. No praise, no summary.",
        "Step 2: output `---REWRITTEN-PRD-BELOW---` on its own line, then the FULL corrected document.",
        "Fix every defect in the rewrite, do not delete or rename any existing section, and keep the original Markdown structure: `# PRD: <name>` then each `## <heading>` in order.",
        "Required headings, all of which must still be present:",
        ...headings.map((h) => `- ${h}`),
        missing.length
          ? `These headings are currently MISSING and must be written: ${missing.join(", ")}.`
          : "No heading is missing; deepen the weakest ones instead.",
        "Strengthen weak parts with numbers, tables, edge cases, and explicit acceptance criteria. Never pad with restated text.",
        langLine,
        "Output nothing after the rewritten document.",
      ].join("\n"),
    },
    { role: "user", content: `DRAFT:\n\n${draft}` },
  ];
}

const SPLIT_MARKERS = ["---REWRITTEN-PRD-BELOW---", "--- REWRITTEN PRD BELOW ---"];

/** Splits the review pass into its critique and the rewritten document. */
export function splitReviewOutput(text) {
  const raw = String(text || "");
  for (const marker of SPLIT_MARKERS) {
    const at = raw.indexOf(marker);
    if (at !== -1) {
      return {
        critique: raw.slice(0, at).trim(),
        markdown: raw.slice(at + marker.length).trim(),
      };
    }
  }
  const fenced = /```(?:markdown|md)?\s*([\s\S]*)```/.exec(raw);
  if (fenced && fenced[1].trim().startsWith("#")) return { critique: "", markdown: fenced[1].trim() };
  const heading = raw.indexOf("\n# ");
  if (heading !== -1 && raw.slice(0, heading).includes("DEFECT")) {
    return { critique: raw.slice(0, heading).trim(), markdown: raw.slice(heading + 1).trim() };
  }
  return { critique: raw.trim(), markdown: "" };
}

const normalise = (line) =>
  String(line || "")
    .replace(/^#+\s*/, "")
    .replace(/^\s*[\d.]+\s*/, "")
    .replace(/[^a-z0-9 ]/gi, "")
    .trim()
    .toLowerCase();

/** Headings the document actually contains, and which required ones are absent. */
export function auditSections(markdown, sections) {
  const found = String(markdown || "")
    .split("\n")
    .filter((line) => /^##\s+\S/.test(line))
    .map(normalise);
  const report = sections.map((s) => ({
    id: s.id,
    heading: s.heading,
    present: found.includes(normalise(s.heading)),
  }));
  return {
    report,
    present: report.filter((r) => r.present).length,
    total: report.length,
    missing: report.filter((r) => !r.present).map((r) => r.heading),
  };
}

/** Minimal sanitiser for Markdown the model produced, so raw HTML cannot run scripts. */
export function sanitizeMarkdownHtml(html) {
  return String(html || "")
    .replace(/<\s*(script|style|iframe|object|embed|link|meta|base|form)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|link|meta|base|form)\b[^>]*\/?>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"')
    .replace(/(href|src)\s*=\s*javascript:[^\s>]*/gi, '$1="#"');
}
