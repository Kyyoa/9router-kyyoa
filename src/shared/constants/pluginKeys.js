// The six custom plugins, in the order they are listed on the plugin page.
//
// This lives in its own leaf module on purpose. src/dashboardGuard.js pulls
// settings -> localDb -> settingsRepo, and settingsRepo needs this list. models.js
// also exports it, but models.js starts with `from "open-sse/config/..."`, and the
// guard runs from .next/standalone where that bare specifier does not resolve -
// importing it there failed the guard load and every route answered
// 503 "Authorization check unavailable". Nothing here imports anything.
export const CUSTOM_PLUGIN_KEYS = [
  "imageVision",
  "thinkDeeper",
  "speedMode",
  "jsonGuard",
  "contextSqueezer",
  "openaiToolBridge",
  "antiSlop",
];
