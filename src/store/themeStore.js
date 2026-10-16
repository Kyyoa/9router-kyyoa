"use client";

import { create } from "zustand";
import { THEME_CONFIG } from "@/shared/constants/config";

// Two modes, both dark-based: glass is the default (a glassmorphism variant
// that keeps the exact same palette while surfaces turn translucent), and solid
// dark stays as the fallback.
export const THEME_IDS = ["glass", "dark"];

// The mode belongs to the installation, not to one browser. It is stored in
// settings.theme, written only by a password session, and mirrored into the
// document for every visitor, so switching it changes the whole site at once
// instead of quietly applying to whoever happened to click.
function normalize(theme) {
  return THEME_IDS.includes(theme) ? theme : "glass";
}

const useThemeStore = create((set, get) => ({
  theme: "glass",
  canChangeTheme: false,
  hydrated: false,

  /** Called by the shell with the server value; also used for the SSR default. */
  setServerTheme: (theme, canChange = false) => {
    const id = normalize(theme);
    set({ theme: id, canChangeTheme: !!canChange, hydrated: true });
    applyTheme(id);
  },

  /**
   * Applies and persists a new mode. Returns false without touching anything
   * when the session is not allowed to change it (an API-key sign-in), so the
   * control can never repaint the site behind the administrator's back.
   */
  setTheme: async (theme) => {
    if (!get().canChangeTheme) return false;
    const id = normalize(theme);
    set({ theme: id });
    applyTheme(id);
    try {
      const res = await fetch("/api/theme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: id }),
      });
      if (!res.ok) throw new Error(await res.text());
      return true;
    } catch (error) {
      // Roll back so the document never shows a mode the server refused.
      const previous = get().theme;
      set({ theme: previous });
      applyTheme(previous);
      console.error("Theme change rejected:", error);
      return false;
    }
  },

  toggleTheme: () => get().setTheme(get().theme === "glass" ? "dark" : "glass"),
}));

// Apply theme to document. "dark" always stays on (both modes are dark);
// "glass" adds the frosted-token overrides in globals.css.
export function applyTheme(theme) {
  if (typeof window === "undefined") return;
  const root = document.documentElement;
  root.classList.add("dark");
  root.classList.toggle("glass", normalize(theme) === "glass");
}

export default useThemeStore;
