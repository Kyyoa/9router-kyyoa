"use client";

// Plugin marks for one model, from the same config GET /api/plugins serves the
// plugins page. One fetch answers over the whole key list, and the matching
// uses the shared rule so this badge cannot disagree with the request runtime.
import { useEffect, useState } from "react";
import { pluginAppliesToModel } from "@/shared/utils/pluginModelMatch";

export function useModelPluginMarks(modelId) {
  const [marks, setMarks] = useState(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/plugins", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!alive || !data?.customPlugins) return;
        setMarks(
          Object.entries(data.customPlugins)
            .filter(([, entry]) => pluginAppliesToModel(entry, modelId))
            .map(([key]) => key)
        );
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [modelId]);

  return marks;
}
