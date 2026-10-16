"use client";

import { create } from "zustand";

/**
 * Who is signed in, once.
 *
 * Sidebar, HeaderMenu and the theme store all needed the same answer, and each
 * was fetching /api/auth/status on its own. The role decides what a session may
 * open (and whether it may change the site-wide theme), so it is cached here and
 * every consumer reads the same value.
 */
export const useSessionStore = create((set) => ({
  role: null,
  permissions: null,
  homePath: null,
  displayName: "",
  loginMethod: "",
  loaded: false,

  setSession: (data) =>
    set({
      role: data?.role || null,
      permissions: data?.permissions || null,
      homePath: data?.homePath || null,
      displayName: data?.displayName || "",
      loginMethod: data?.loginMethod || "",
      loaded: true,
    }),

  clearSession: () =>
    set({
      role: null,
      permissions: null,
      homePath: null,
      displayName: "",
      loginMethod: "",
      loaded: false,
    }),
}));

export default useSessionStore;
