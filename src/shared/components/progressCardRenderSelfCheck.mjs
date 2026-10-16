/**
 * ProgressCard Render Self-Check
 *
 * Pins the unified loading style: every long operation (backup export/import,
 * bulk imports, bulk adds) renders the same centered card over a dark blurred
 * backdrop - title, message, optional percent, optional section line, and an
 * optional progress bar. No operation may fall back to a different look.
 *
 * Render smoke-check on purpose: esbuild only proves a file parses. The card
 * is a pile of conditional classNames and conditional blocks, so a renamed
 * prop or a dropped branch parses fine and shows up only when the operation
 * runs - with no other place that would surface it.
 *
 * Run with: node src/shared/components/progressCardRenderSelfCheck.mjs
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const outDir = mkdtempSync(path.join(tmpdir(), "progresscard-render-"));

const w = (name, body) => {
  const p = path.join(outDir, name);
  writeFileSync(p, body, "utf8");
  return p;
};

const reactStub = w("react-stub.js", `
module.exports = {
  useState: (i) => [typeof i === "function" ? i() : i, () => {}],
  useEffect: () => {}, useLayoutEffect: () => {}, useMemo: (fn) => fn(),
  useCallback: (fn) => fn, useRef: (i) => ({ current: i }),
  useContext: () => ({}),
  createContext: () => ({ Provider: () => null, Consumer: () => null }),
  forwardRef: (fn) => fn, memo: (fn) => fn,
  Fragment: Symbol("Fragment"), default: {}, __esModule: true,
};
`);

const jsxStub = w("jsx-runtime-stub.js", `
module.exports = {
  jsx: (type, props) => ({ type, props }),
  jsxs: (type, props) => ({ type, props }),
  jsxDEV: (type, props) => ({ type, props }),
  Fragment: Symbol("Fragment"), __esModule: true,
};
`);

const cnStub = w("cn-stub.js", `
module.exports = {
  cn: (...xs) => xs.filter(Boolean).join(" "),
  __esModule: true,
};
`);

function loadLoading() {
  const outfile = path.join(outDir, "Loading.cjs");
  execFileSync("npx", [
    "esbuild", path.join(here, "Loading.js"),
    "--bundle", "--format=cjs", "--platform=node",
    "--loader:.js=jsx", "--jsx=automatic",
    `--alias:react=${reactStub}`,
    `--alias:react/jsx-runtime=${jsxStub}`,
    `--alias:@/shared/utils/cn=${cnStub}`,
    "--outfile=" + outfile, "--log-level=error",
  ], { stdio: ["ignore", "pipe", "pipe"] });
  return require(outfile);
}

const { ProgressCard, CenterLoading, BusyOverlay } = loadLoading();

const results = [];
function run(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (err) {
    results.push({ name, ok: false, err: err.message });
  }
}
const assert = {
  ok(v, msg) { if (!v) throw new Error(msg || "expected truthy"); },
  no(v, msg) { if (v) throw new Error(msg || "expected falsy"); },
};

// Walk the stub JSX tree into a plain string: types, props and text.
function flatten(node) {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flatten).join("|");
  if (typeof node === "object") {
    const { type, props } = node;
    const name = typeof type === "string" ? type : (type?.name || "fn");
    const kids = props ? flatten(props.children) : "";
    const attrs = props
      ? Object.entries(props)
        .filter(([k]) => k !== "children")
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join(" ")
      : "";
    return `<${name} ${attrs}>${kids}</${name}>`;
  }
  return "";
}

const render = (props) => flatten(ProgressCard(props));

run("ProgressCard exists alongside CenterLoading", () => {
  assert.ok(typeof ProgressCard === "function", "ProgressCard exported");
  assert.ok(typeof CenterLoading === "function", "CenterLoading kept");
  assert.ok(BusyOverlay === CenterLoading, "BusyOverlay still aliases CenterLoading");
});

run("the card shows title, message, percent and section", () => {
  const tree = render({ title: "Importing database", message: "Reading backup file", section: "settings", progress: 42 });
  assert.ok(tree.includes("Importing database"), "title shown");
  assert.ok(tree.includes("Reading backup file"), "message shown");
  assert.ok(tree.includes("settings"), "section shown");
  assert.ok(tree.includes("42%"), "percent shown");
  assert.ok(tree.includes("width") && tree.includes("42%"), "bar filled to 42%");
});

run("the backdrop blocks the page: dark, blurred, fullscreen, high z", () => {
  const tree = render({ title: "Working" });
  assert.ok(tree.includes("bg-black/55"), "dark backdrop");
  assert.ok(tree.includes("backdrop-blur"), "blurred backdrop");
  assert.ok(tree.includes("fixed") && tree.includes("inset-0"), "fullscreen when fixed");
  assert.ok(tree.includes("z-[70]"), "above modals");
  assert.no(tree.includes("pointer-events-none"), "blocking, not click-through");
});

run("progress accepts both the 0-100 and 0-1 scales", () => {
  assert.ok(render({ title: "W", progress: 50 }).includes("50%"), "0-100 scale");
  assert.ok(render({ title: "W", progress: 0.5 }).includes("50%"), "0-1 scale");
});

run("progress clamps instead of overflowing the bar", () => {
  assert.ok(render({ title: "W", progress: 250 }).includes("100%"), "clamped high");
  assert.ok(render({ title: "W", progress: -5 }).includes("0%"), "clamped low");
});

run("without progress there is no bar and no percent", () => {
  const tree = render({ title: "Preparing backup", message: "Exporting database" });
  assert.no(tree.includes("rounded-full bg-primary"), "no bar fill");
  assert.ok(tree.includes("Preparing backup"), "title still shown");
  assert.ok(tree.includes("Exporting database"), "message still shown");
});

run("a missing title falls back instead of rendering empty", () => {
  assert.ok(render({}).includes("Working"), "fallback title");
});

run("fixed={false} renders an in-modal fill, not a fullscreen takeover", () => {
  const tree = render({ title: "Importing accounts", progress: 30, fixed: false });
  assert.ok(tree.includes("absolute") && tree.includes("inset-0"), "absolute fill");
  assert.no(tree.includes("fixed inset-0"), "not fullscreen");
  assert.ok(tree.includes("30%"), "progress still shown");
});

const failed = results.filter((r) => !r.ok);
for (const r of results) {
  console.log(`${r.ok ? "  ok  " : "  FAIL"} ${r.name}${r.err ? ` - ${r.err}` : ""}`);
}
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length === 0 ? 0 : 1);