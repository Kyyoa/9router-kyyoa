"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  Button,
  Badge,
  Toggle,
  ModelSelectModal,
  CapacityBadges,
} from "@/shared/components";
import { useModelCaps } from "@/shared/hooks/useModelCaps";
import { useNotificationStore } from "@/store/notificationStore";
import PluginMark from "@/shared/components/PluginMark";
import { CUSTOM_PLUGIN_KEYS } from "@/shared/constants/pluginKeys";

const PLUGINS = [
  {
    key: "imageVision",
    title: "Image Vision",
    iconColor: "text-sky-400",
    description:
      "Enable image understanding for models that don't natively support vision. Images are converted to text descriptions, allowing any model to process visual content in CLI tools and agents.",
  },
  {
    key: "thinkDeeper",
    title: "Think Deeper",
    iconColor: "text-violet-400",
    description:
      "Enhance reasoning with multi-step chain-of-thought analysis. Forces the model to break problems into steps before answering, producing more thorough and accurate responses.",
  },
  {
    key: "speedMode",
    title: "Speed Mode",
    iconColor: "text-cyan-300",
    description:
      "Skip thinking for faster responses. Disables reasoning mode on the selected models and instructs them to answer directly, ideal for simple tasks where low latency matters more than deep analysis.",
  },
  {
    key: "jsonGuard",
    title: "JSON Guard",
    iconColor: "text-emerald-400",
    description:
      "Keep machine-readable output parseable. Strips prose and markdown fences around JSON, fixes Python-style literals and trailing commas, closes payloads the output limit cut off, and drops tool-call arguments the schema never declared.",
  },
  {
    key: "contextSqueezer",
    title: "Context Squeezer",
    iconColor: "text-amber-300",
    description:
      "Fit long conversations into the model's context window. The oldest turns are replaced with a short recap and oversized tool output is trimmed, so the newest turns always arrive intact instead of the provider rejecting the request.",
  },
  {
    key: "openaiToolBridge",
    title: "OpenAI Tool Bridge",
    iconColor: "text-fuchsia-400",
    description:
      "Keep tool calling working on models that cannot do it natively. Text-only providers (browser-session models with tools disabled) answer in prose; the bridge reads the tools you offered, picks the calls the model wrote out in its answer, and hands your client proper tool_calls with arguments filtered to the schema it declared.",
  },
  {
    key: "antiSlop",
    title: "Anti Slop",
    iconColor: "text-teal-300",
    levelled: true,
    description:
      "Injects the antislop rules (https://github.com/miqdadbadjuber/anti-slop) into the system prompt of the models you pick, so they stop shipping generic AI UI, copy and code. Three intensities: Lite catches the obvious patterns, Full adds the hard-gate rules and the craftsmanship standard, Ultra adds the mandatory PASS/FAIL delivery report.",
  },
];

// One shape for every plugin: enabled flag plus the model list it applies to.
// `stored` is whatever settings held, so an unknown key in settings is ignored
// and a plugin missing from settings comes back off rather than undefined.
// Anti Slop ships three intensities, mirroring Ponytail's levels. The level is
// stored on the plugin entry so it rides along in settings rather than living in
// a second place that could disagree with the toggle.
export const ANTISLOP_LEVELS = [
  { id: "lite", label: "Lite", desc: "Purpose test plus a scan for the obvious AI patterns." },
  { id: "full", label: "Full", desc: "Adds the Hard Gate rules, the craftsmanship standard and the swap test." },
  { id: "ultra", label: "Ultra", desc: "Adds the mandatory four-block PASS/FAIL delivery report." },
];

const DEFAULT_ANTISLOP_LEVEL = "full";

function normalizeAntislopLevel(level) {
  return ANTISLOP_LEVELS.some((l) => l.id === level) ? level : DEFAULT_ANTISLOP_LEVEL;
}

function defaultPluginsFrom(stored) {
  const out = {};
  for (const key of CUSTOM_PLUGIN_KEYS) {
    const entry = stored?.[key];
    out[key] = {
      enabled: Boolean(entry?.enabled),
      models: Array.isArray(entry?.models) ? entry.models.filter(Boolean) : [],
      // Only Anti Slop has a level; every other plugin keeps {enabled, models}.
      ...(key === "antiSlop" ? { level: normalizeAntislopLevel(entry?.level) } : {}),
    };
  }
  return out;
}

const DEFAULT_PLUGINS_STATE = defaultPluginsFrom(null);

function formatModelName(modelVal) {
  if (!modelVal) return "";
  return modelVal.includes("/")
    ? modelVal.split("/").slice(1).join("/")
    : modelVal;
}

export default function PluginsPage() {
  const [customPlugins, setCustomPlugins] = useState(DEFAULT_PLUGINS_STATE);
  const [activeProviders, setActiveProviders] = useState([]);
  const [pickerPlugin, setPickerPlugin] = useState(null);
  const { getCaps } = useModelCaps();
  const addNotification = useNotificationStore((state) => state.addNotification);

  useEffect(() => {
    async function loadData() {
      try {
        const [pluginsRes, providersRes] = await Promise.all([
          fetch("/api/plugins", { cache: "no-store" }),
          fetch("/api/providers", { cache: "no-store" }),
        ]);

        if (pluginsRes.ok) {
          const data = await pluginsRes.json();
          if (data.customPlugins) {
            // Derived from CUSTOM_PLUGIN_KEYS rather than spelled out again:
            // a hand-written literal had drifted to five keys while the plugin
            // table has six, so openaiToolBridge always came back undefined and
            // its toggle rendered OFF after every reload.
            setCustomPlugins(defaultPluginsFrom(data.customPlugins));
          }
        }

        if (providersRes.ok) {
          const provData = await providersRes.json();
          setActiveProviders(provData.connections || []);
        }
      } catch (err) {
        console.error("Failed to load plugin data:", err);
      }
    }

    loadData();
  }, []);

  const savePlugins = useCallback(
    async (updatedPlugins) => {
      try {
        const res = await fetch("/api/plugins", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customPlugins: updatedPlugins }),
        });
        if (res.ok) {
          window.dispatchEvent(new Event("customModelChanged"));
        }
      } catch (err) {
        console.error("Failed to save plugins:", err);
      }
    },
    []
  );

  // Level lives on the plugin entry, so it saves through the same path as the
  // toggle - no second settings key that could disagree with it.
  const handleLevelChange = useCallback(
    (pluginKey, level) => {
      setCustomPlugins((prev) => {
        const updated = {
          ...prev,
          [pluginKey]: { ...prev[pluginKey], level },
        };
        savePlugins(updated);
        return updated;
      });
    },
    [savePlugins]
  );

  const handleToggle = useCallback(
    (pluginKey, enabled) => {
      setCustomPlugins((prev) => {
        const updated = {
          ...prev,
          [pluginKey]: {
            ...prev[pluginKey],
            enabled,
          },
        };
        savePlugins(updated);
        return updated;
      });
    },
    [savePlugins]
  );

  const handleAddModel = useCallback(
    (pluginKey, model) => {
      const modelVal =
        typeof model === "string"
          ? model
          : model?.value || model?.name || model?.id || "";
      if (!modelVal || !pluginKey) return;

      setCustomPlugins((prev) => {
        const currentModels = prev[pluginKey]?.models || [];
        if (currentModels.includes(modelVal)) return prev;

        const updated = {
          ...prev,
          [pluginKey]: {
            ...prev[pluginKey],
            models: [...currentModels, modelVal],
          },
        };
        savePlugins(updated);
        return updated;
      });
    },
    [savePlugins]
  );

  const handleRemoveModel = useCallback(
    (pluginKey, model) => {
      const modelVal =
        typeof model === "string"
          ? model
          : model?.value || model?.name || model?.id || "";
      if (!modelVal || !pluginKey) return;

      setCustomPlugins((prev) => {
        const currentModels = prev[pluginKey]?.models || [];
        if (!currentModels.includes(modelVal)) return prev;

        const updated = {
          ...prev,
          [pluginKey]: {
            ...prev[pluginKey],
            models: currentModels.filter((m) => m !== modelVal),
          },
        };
        savePlugins(updated);
        return updated;
      });
    },
    [savePlugins]
  );

  const activePickerConfig = PLUGINS.find((p) => p.key === pickerPlugin);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-main">Custom Plugins</h1>
        <p className="text-sm text-text-muted mt-1">
          Extend model capabilities with plugins
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {PLUGINS.map((plugin) => {
          const config = customPlugins[plugin.key] || {
            enabled: false,
            models: [],
          };
          const isEnabled = config.enabled;
          const selectedModels = config.models || [];

          return (
            <Card key={plugin.key} className="flex flex-col h-full">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex items-center gap-3">
                  {/* Single plugin mark: one tile in the plugin's own colour.
                      An earlier pass drew the same glyph twice (tile plus a
                      docked mini badge); the duplicate read as a second logo,
                      so the badge is gone. The tile gets a solid coloured ring
                      when the plugin is enabled and a flat hairline when off. */}
                  {/* One shared tile for all seven cards: neutral glass, thin hairline,
                      and the plugin's own saturated colour carried by the glyph
                      itself. Seven translucent colourwashes never read as a
                      system; the glyph does the differentiating now. */}
                  <div
                    className={`size-11 rounded-xl flex items-center justify-center border shrink-0 bg-surface text-text-main border-border-subtle ${isEnabled ? "ring-1 ring-primary/50 shadow-[var(--shadow-elev)]" : ""}`}
                  >
                    <span className={`inline-flex items-center justify-center ${plugin.iconColor}`}>
                      <PluginMark name={plugin.key} size={24} strokeWidth={2} />
                    </span>
                  </div>
                  <h3 className="font-semibold text-base text-text-main">
                    {plugin.title}
                  </h3>
                </div>
                <Toggle
                  checked={isEnabled}
                  onChange={(val) => handleToggle(plugin.key, val)}
                />
              </div>

              <p className="text-sm text-text-muted leading-relaxed mb-5">
                {plugin.description}
              </p>

              {/* Intensity, shown only while the plugin is on - same shape as the
                  Ponytail level picker on the Token Saver page. */}
              {plugin.levelled && isEnabled && (
                <div className="mb-4 space-y-1.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {ANTISLOP_LEVELS.map((lvl) => (
                      <button
                        key={lvl.id}
                        type="button"
                        onClick={() => handleLevelChange(plugin.key, lvl.id)}
                        className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
                          (customPlugins[plugin.key]?.level || "full") === lvl.id
                            ? "bg-primary text-white border-primary"
                            : "bg-transparent border-border text-text-muted hover:bg-surface-2"
                        }`}
                      >
                        {lvl.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-text-muted">
                    {ANTISLOP_LEVELS.find(
                      (lvl) => lvl.id === (customPlugins[plugin.key]?.level || "full")
                    )?.desc}
                  </p>
                </div>
              )}

              {isEnabled && (
                <div className="mt-auto pt-4 border-t border-border-subtle">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                      Selected Models
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon="add"
                      onClick={() => setPickerPlugin(plugin.key)}
                    >
                      Add Models
                    </Button>
                  </div>

                  {selectedModels.length === 0 ? (
                    <div className="p-4 rounded-xl border border-dashed border-border-subtle bg-surface-2/30 text-center">
                      <p className="text-xs text-text-muted">
                        Select models to apply this plugin
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {selectedModels.map((modelVal) => (
                        <Badge
                          key={modelVal}
                          variant="default"
                          size="md"
                          className="font-medium bg-surface-2 text-text-main border border-border-subtle"
                        >
                          <span className="truncate max-w-[180px]">
                            {formatModelName(modelVal)}
                          </span>
                          <CapacityBadges caps={getCaps(modelVal)} />
                          <button
                            type="button"
                            onClick={() => handleRemoveModel(plugin.key, modelVal)}
                            className="text-text-muted hover:text-red-500 transition-colors cursor-pointer leading-none ml-0.5"
                            title="Remove model"
                          >
                            <span className="material-symbols-outlined text-[14px]">
                              close
                            </span>
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {pickerPlugin && (
        <ModelSelectModal
          isOpen={Boolean(pickerPlugin)}
          onClose={() => setPickerPlugin(null)}
          onSelect={(m) => handleAddModel(pickerPlugin, m)}
          onDeselect={(m) => handleRemoveModel(pickerPlugin, m)}
          activeProviders={activeProviders}
          title={`Select Models - ${activePickerConfig?.title || "Plugin"}`}
          addedModelValues={customPlugins[pickerPlugin]?.models || []}
          closeOnSelect={false}
        />
      )}
    </div>
  );
}
