import { NextResponse } from "next/server";
import { CUSTOM_PLUGIN_KEYS } from "@/shared/constants/pluginKeys";
import { getSettings, updateSettings } from "@/lib/localDb";
import { clearPluginCache } from "@/lib/plugins/customPluginsRuntime";

export const dynamic = "force-dynamic";

// Anti Slop intensity, kept in step with the page's picker. "full" is the
// fallback: a plugin that silently stops filtering is worse than one that
// filters hard.
const ANTISLOP_LEVELS = new Set(["lite", "full", "ultra"]);
function normalizeAntislopLevel(level) {
  return ANTISLOP_LEVELS.has(level) ? level : "full";
}

export async function GET() {
  try {
    const settings = await getSettings();
    const stored = settings.customPlugins || {};
    // Answer over the key list, not whatever shape settings happen to hold:
    // settings written by older code have five keys, and returning them verbatim
    // left openaiToolBridge undefined (its toggle would render OFF even after a
    // correct save). A plugin missing from settings reads as off, never undefined.
    const customPlugins = {};
    for (const key of CUSTOM_PLUGIN_KEYS) {
      const entry = stored[key];
      customPlugins[key] = {
        enabled: Boolean(entry?.enabled),
        models: Array.isArray(entry?.models) ? entry.models.filter(Boolean) : [],
        ...(key === "antiSlop" ? { level: normalizeAntislopLevel(entry?.level) } : {}),
      };
    }
    return NextResponse.json({ customPlugins }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Error getting custom plugins:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const body = await request.json();
    const { customPlugins } = body;
    if (!customPlugins || typeof customPlugins !== "object") {
      return NextResponse.json({ error: "Invalid customPlugins payload" }, { status: 400 });
    }

    // Merged over the key list, not a hand-written literal: the literal had five
    // keys while six plugins existed, so saving from the page silently dropped
    // openaiToolBridge from settings and it could never stay enabled.
    const merged = {};
    for (const key of CUSTOM_PLUGIN_KEYS) {
      const entry = customPlugins[key];
      merged[key] = {
        enabled: Boolean(entry?.enabled),
        models: Array.isArray(entry?.models) ? entry.models.filter(Boolean) : [],
        // Anti Slop's level rides on the same entry. Without this line the merge
        // rebuilt every entry as {enabled, models} and the level was dropped on
        // every save - the same failure shape as the lost openaiToolBridge key.
        ...(key === "antiSlop" ? { level: normalizeAntislopLevel(entry?.level) } : {}),
      };
    }

    await updateSettings({ customPlugins: merged });
    clearPluginCache();
    return NextResponse.json({ success: true, customPlugins: merged });
  } catch (error) {
    console.error("Error updating custom plugins:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
