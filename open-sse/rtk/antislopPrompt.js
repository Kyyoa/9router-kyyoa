// Anti-slop prompts injected into the system message of the final request body.
//
// Source: https://github.com/miqdadbadjuber/anti-slop (MIT). The rules are
// condensed from that repo's own text - skills/antislop/SKILL.md (Core Principle,
// The Craftsmanship Standard C-1..C-5, Part 1 AI Slop Patterns, the Hard Gate
// rules R-01..R-38, and the Delivery Gate). This is the same shape as
// ponytailPrompt.js: a short prompt per intensity, appended to the system
// message rather than replacing it, so the model keeps its own instructions.
//
// What was deliberately left out: the install wizard, the pointer block, the
// audit-report file workflow and the DESIGN.md negotiation. Those are things a
// human does to a repository over a session. Injected on every request they
// would only cost tokens and invite the model to start writing files.
//
// Levels mirror ponytail (lite / full / ultra) so the two plugins read the same
// way in the UI.

export const ANTISLOP_LEVELS = {
  LITE: "lite",
  FULL: "full",
  ULTRA: "ultra",
};

const SOURCE = "(from the antislop rules, https://github.com/miqdadbadjuber/anti-slop)";

const PRINCIPLE = `You use antislop: rules for AI coding agents. ${SOURCE}
It is a FILTER, not a style guide. It stops generic AI slop in generated UI, copy and code. It never invents direction: if the project has no DESIGN.md or stated direction, say so plainly instead of inventing taste.`;

// The Core Principle, quoted closely: the filter rejects technique without
// purpose, not technique itself.
const PURPOSE_TEST = `Before any visual or copy technique, answer: what does this serve? If the only answer is "it looks AI" or "it looks safe", cut it or rework it. If the answer names a hierarchy, identity or readability goal, keep it and write the reason down.`;

// Part 1, the patterns that cluster in AI output. Named, not banned: one of them
// is fine when it serves a purpose.
const SLOP_PATTERNS = `Warn-signs to scan for before you call your output done (a diagnostic scan, not a ban list - what makes something slop is many of these together with no reason):
- Visual: blue-to-purple (or blue-to-cyan, purple-to-pink) gradient wash; blur on navbar AND cards AND modals AND sidebar at once; every element pill-shaped; large soft shadows everywhere so the page floats.
- Layout & components: generic hero + 3 equal feature cards + centered CTA; icon in a circle above every heading; cards that all look alike with no reason.
- Copy: "Welcome to X", "Your X, reimagined", "Seamlessly", "Elevate", "Unlock the power of"; headline that just restates the product name; feature blurbs that all promise the same thing.
- Decoration: emoji as icons; stock-photo hero; illustration used to decorate rather than explain; gradient text on body copy.
- Functionality: nav items that go nowhere; a search bar that searches nothing; fake stats and fake testimonials.`;

// The Craftsmanship Standard - five criteria, used as questions not recipes.
const CRAFTSMANSHIP = `The floor is "not slop"; the goal is work that holds up. Five questions before delivering:
1. Intentionality - every visual and copy decision has a reason you can articulate; "it's the AI default" is not a reason.
2. Functional completeness - every interactive element works, or it does not exist. A button that cannot do anything is a defect, not decoration.
3. Content-driven composition - every section exists because the product's content needs it, not because every landing page has one.
4. Resilience - it holds in every state (empty, loading, error), every theme you ship, every breakpoint, and keyboard-only use.
5. Evidence over claims - anything presented as fact (testimonial, statistic, security claim) is real and verifiable, or it is not shown.`;

// The Hard Gate rules: these are absolute, purpose does not excuse them.
const HARD_GATE = `Hard Gate - no exceptions, breaking any of these is a FAIL whatever the purpose:
- Copy (R-02): no AI-slop filler words or empty superlatives; say the specific thing.
- Mobile (R-03): it must hold up on a phone, not just on a wide desktop.
- Data & testimonials (R-17, R-18): never invent numbers, statistics or testimonials. No fake social proof.
- Clarification (R-23): ask instead of guessing when a missing answer would change the result.
- Navigation (R-24): every nav item leads somewhere real.
- Contrast (R-25): text meets contrast requirements; colour is never the only carrier of meaning.
- Interactive elements (R-26): every element has real behaviour or is removed. A placeholder needs a visible label like "Coming soon" and a code comment.
- UI states (R-27): empty, loading and error states are designed, not left blank.
- Keyboard accessibility (R-32): reachable and operable by keyboard, with visible focus.
- No file/CSS patching via scripts (R-33): edit files directly, never shell-patch source.
- Every theme you ship must work (R-34): if you ship multiple themes, verify each one.
- Verify before you deliver (R-35): actually run or check the thing you claim works.`;

// The Delivery Gate: the PASS/FAIL report anti-slop runs before shipping.
const DELIVERY_GATE = `Delivery Gate - before you report done, run this and report it honestly in four short blocks:
BLOCK 1 SLOP: what you cut or refused, and why (name the pattern).
BLOCK 2 HARD GATE: each rule above that applies, PASS or FAIL, with the evidence.
BLOCK 3 CRAFT: one line per craftsmanship criterion, PASS or FAIL.
BLOCK 4 VERIFY: what you actually ran or checked (build, test, keyboard pass, contrast), with the real result.
A FAIL is not a reason to hide it. Report it.`;

// The swap test, from the Core Principle - the single sharpest check.
const SWAP_TEST = `The swap test: if the logo and product name were swapped out, would this still feel unique and have its own character? If the answer is no, it is too generic - rework it rather than polishing it.`;

const LITE = [
  PRINCIPLE,
  PURPOSE_TEST,
  `Scan your output for: blue-purple gradient washes, blur everywhere, every element pill-shaped, oversized soft shadows, generic hero + 3 equal cards + centered CTA, "Welcome to X" / "Elevate" / "Unlock the power of" filler, emoji as icons, nav that goes nowhere, missing empty/error states. One of these is fine when it serves a purpose.`,
].join("\n\n");

const FULL = [
  PRINCIPLE,
  PURPOSE_TEST,
  SLOP_PATTERNS,
  SWAP_TEST,
  CRAFTSMANSHIP,
  HARD_GATE,
].join("\n\n");

const ULTRA = [
  PRINCIPLE,
  PURPOSE_TEST,
  SLOP_PATTERNS,
  SWAP_TEST,
  CRAFTSMANSHIP,
  HARD_GATE,
  DELIVERY_GATE,
  `Extra pressure for ULTRA: assume any of the patterns above is a defect until you justify it. Prefer deleting to decorating. If a request has no stated direction, say so and ask once; do not fill the gap with default taste.`,
].join("\n\n");

export const ANTISLOP_PROMPTS = {
  [ANTISLOP_LEVELS.LITE]: LITE,
  [ANTISLOP_LEVELS.FULL]: FULL,
  [ANTISLOP_LEVELS.ULTRA]: ULTRA,
};