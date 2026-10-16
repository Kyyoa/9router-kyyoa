"use client";

// Client half of the server-side proxy import (see lib/db/proxyImportJobs).
//
// The page posts the parsed list once and then only reads progress. Nothing
// here writes to the database, and nothing here can stall the run: if this
// component unmounts mid-poll, the server job carries on regardless.

export const PROXY_IMPORT_JOB_KEY = "9r:proxy-import-job";

const TERMINAL = ["done", "error", "cancelled"];

function sleep(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    if (typeof timer.unref === "function") timer.unref();
  });
}

export function readStoredJob() {
  try {
    const raw = localStorage.getItem(PROXY_IMPORT_JOB_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.jobId !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeStoredJob(jobId, total) {
  try {
    localStorage.setItem(PROXY_IMPORT_JOB_KEY, JSON.stringify({ jobId, total }));
  } catch {
    // Private-mode or full quota: reattach after a reload just won't work.
  }
}

export function clearStoredJob() {
  try {
    localStorage.removeItem(PROXY_IMPORT_JOB_KEY);
  } catch {
    // Nothing to do; the job record expires on its own.
  }
}

/** Start a server-side import. Returns `{ jobId, total, pollMs }`. */
export async function startProxyImportJob(entries) {
  const res = await fetch("/api/proxy-pools/import-jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      entries: entries.map((e) => ({ name: e.name, proxyUrl: e.proxyUrl })),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Could not start the import");
  return { jobId: data.jobId, total: Number(data.total) || entries.length, pollMs: Number(data.pollMs) || 1000 };
}

/** One status read. `null` when the record has expired. */
export async function fetchProxyImportJob(jobId) {
  const res = await fetch(`/api/proxy-pools/import-jobs?id=${encodeURIComponent(jobId)}`, {
    cache: "no-store",
  });
  if (res.status === 404) return null;
  const data = await res.json().catch(() => ({}));
  return data?.job || null;
}

/**
 * Poll until the job reaches a terminal state.
 *
 * `onProgress` is called on every read so a mounted page can render it;
 * callers that navigate away simply stop awaiting, and the job continues.
 * Returns the final job (or `null` if the record vanished).
 */
export async function pollProxyImportJob(jobId, onProgress, { pollMs = 1000, signal = null } = {}) {
  for (;;) {
    await sleep(pollMs);
    if (signal?.aborted) return null;

    let job = null;
    try {
      job = await fetchProxyImportJob(jobId);
    } catch {
      // Transient fetch failure: keep polling rather than declaring the run
      // dead because one request dropped.
    }

    if (!job) {
      clearStoredJob();
      return null;
    }
    onProgress?.(job);
    if (TERMINAL.includes(job.status)) {
      clearStoredJob();
      return job;
    }
  }
}

/** Ask the server to stop. Safe to call for a job that already finished. */
export async function cancelProxyImportJob(jobId) {
  try {
    await fetch(`/api/proxy-pools/import-jobs?id=${encodeURIComponent(jobId)}`, {
      method: "DELETE",
    });
  } catch {
    // Best effort; a cancel that cannot reach the server will be picked up
    // when the operator closes the dashboard or the job completes.
  }
}
