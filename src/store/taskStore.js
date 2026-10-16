"use client";

import { create } from "zustand";

/**
 * Long operations that outlive the page that started them.
 *
 * A 10 000-proxy import runs as a client-side loop of POSTs; the page component
 * that drives it unmounts when the operator navigates, and with it went the
 * banner - the loop kept running invisibly with nowhere to report progress.
 * Moving the operation's progress into this store lets a banner mounted in the
 * dashboard layout keep reporting it, keep offering cancel, and stay collapsed
 * in a corner while the operator works somewhere else.
 *
 * A task carries its own `onCancel` (an AbortController.abort wired by the
 * caller), so cancelling from anywhere aborts the real request loop.
 */
export const useTaskStore = create((set, get) => ({
  /** [{ id, title, message, section, progress, onCancel }] */
  tasks: [],

  start(task) {
    set((s) => ({ tasks: [...s.tasks.filter((t) => t.id !== task.id), task] }));
  },

  update(id, patch) {
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }));
  },

  finish(id) {
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }));
  },

  /** Fire a task's own cancel hook; the caller's finally{} removes it. */
  cancel(id) {
    const task = get().tasks.find((t) => t.id === id);
    task?.onCancel?.();
  },
}));

export default useTaskStore;