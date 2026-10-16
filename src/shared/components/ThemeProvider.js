"use client";

import { useEffect } from "react";
import useThemeStore from "@/store/themeStore";

export function ThemeProvider({ children }) {
  const setServerTheme = useThemeStore((state) => state.setServerTheme);

  useEffect(() => {
    let cancelled = false;

    // The administrator's stored mode is the site's mode. A key-signed session
    // is told it may not change it (canChangeTheme=false), which is what keeps
    // the theme control off that session entirely.
    async function loadTheme() {
      try {
        // The theme itself is public (it is rendered for every visitor),
        // but only a password session may rewrite it. /api/theme answers with
        // just that one value, so nothing else in settings is exposed.
        const themeRes = await fetch("/api/theme", { cache: "no-store" });
        const themeData = themeRes.ok ? await themeRes.json() : {};
        if (cancelled) return;
        const statusRes = await fetch("/api/auth/status", { cache: "no-store" });
        const status = statusRes.ok ? await statusRes.json() : {};
        if (cancelled) return;
        setServerTheme(themeData.theme || "glass", status.role !== "apikey");
      } catch {
        if (!cancelled) setServerTheme("glass", false);
      }
    }

    loadTheme();
    return () => {
      cancelled = true;
    };
  }, [setServerTheme]);

  return <>{children}</>;
}

