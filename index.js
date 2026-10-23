// 9router standalone bootstrap for Botkeep.
// payload.tgz is split into parts/ so each file stays under the 4 MB import cap.
// On first run the parts are concatenated and expanded, then the real
// standalone entrypoint takes over.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = __dirname;
const inner = path.join(root, "package");
const startScript = path.join(inner, "start.js");

// Botkeep writes managed variables to /home/container/.env, but the Next
// standalone server loads .env relative to its own directory. Bridge the two
// before anything reads process.env.
function loadParentEnv() {
  const candidates = [path.join(root, ".env"), path.join(root, "..", ".env")];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
    console.log(`[bootstrap] loaded managed environment from ${file}`);
    return;
  }
  console.log("[bootstrap] no managed .env found");
}

// apiKeysRepo writes a createdBy column that the shipped schema never creates,
// so POST /api/keys dies with "table apiKeys has no column named createdBy".
// The server creates the database itself during startup, so the patch has to
// retry until the table shows up. Idempotent and safe to run repeatedly.
function patchOnce() {
  const dataDir = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.join(inner, "data");
  const dbFile = path.join(dataDir, "db", "data.sqlite");
  if (!fs.existsSync(dbFile)) return false;

  let DatabaseSync;
  try {
    ({ DatabaseSync } = require("node:sqlite"));
  } catch {
    console.log("[bootstrap] node:sqlite unavailable, skipping db patch");
    return true;
  }

  let db;
  try {
    db = new DatabaseSync(dbFile);
    const cols = db
      .prepare("PRAGMA table_info(apiKeys)")
      .all()
      .map((r) => r.name);
    if (!cols.length) return false;
    if (!cols.includes("createdBy")) {
      db.exec("ALTER TABLE apiKeys ADD COLUMN createdBy TEXT DEFAULT ''");
      console.log("[bootstrap] patched apiKeys.createdBy");
    }
    return true;
  } catch (err) {
    return false;
  } finally {
    try {
      db?.close();
    } catch {}
  }
}

function scheduleDbPatch() {
  if (patchOnce()) return;
  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    if (patchOnce() || attempts >= 60) {
      clearInterval(timer);
      if (attempts >= 60) {
        console.log("[bootstrap] db patch gave up after 60 attempts");
      }
    }
  }, 1000);
  timer.unref();
}

function rebuild() {
  const partsDir = path.join(root, "parts");
  const parts = fs
    .readdirSync(partsDir)
    .filter((n) => n.startsWith("part-"))
    .sort();
  if (!parts.length) throw new Error("[bootstrap] no payload parts found");

  const joined = path.join(root, "payload.tgz");
  const fd = fs.openSync(joined, "w");
  for (const name of parts) {
    fs.writeSync(fd, fs.readFileSync(path.join(partsDir, name)));
  }
  fs.closeSync(fd);
  console.log(`[bootstrap] reassembled ${parts.length} parts -> payload.tgz`);

  execFileSync("tar", ["-xzf", joined, "-C", root], { stdio: "inherit" });
  fs.unlinkSync(joined);
  console.log("[bootstrap] extracted package/");
}

loadParentEnv();

if (!fs.existsSync(startScript)) {
  rebuild();
}

if (!fs.existsSync(startScript)) {
  console.error("[bootstrap] package/start.js still missing after extraction");
  process.exit(1);
}

scheduleDbPatch();

require(startScript);
