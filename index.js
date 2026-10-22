// 9router standalone bootstrap for Botkeep.
// The build ships as payload.tgz; npm postinstall expands it once, then this
// file hands control to the real standalone entrypoint.
const fs = require("fs");
const path = require("path");

const root = __dirname;
const marker = path.join(root, "payload.tgz");
const inner = path.join(root, "package");
const startScript = path.join(inner, "start.js");

if (!fs.existsSync(startScript)) {
  if (!fs.existsSync(marker)) {
    console.error("[bootstrap] payload.tgz missing and package/ not extracted");
    process.exit(1);
  }
  const { execFileSync } = require("child_process");
  console.log("[bootstrap] extracting payload.tgz");
  execFileSync("tar", ["-xzf", marker, "-C", root], { stdio: "inherit" });
}

if (!fs.existsSync(startScript)) {
  console.error("[bootstrap] extraction finished but package/start.js is absent");
  process.exit(1);
}

require(startScript);
