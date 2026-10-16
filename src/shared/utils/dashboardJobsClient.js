"use client";

// Client half of the dashboard background operations (see lib/db/dashboardJobs).
//
// One POST starts the operation; after that the page only reads progress.
// Closing the browser, refreshing, or moving to another menu leaves the server
// job untouched. The job id is kept in localStorage so a reloaded page can
// put the banner back without starting a second run.

export const DASHBOARD_JOB_KEYS = {
  "health-check": "9r:job-health-check",
  "deploy-relay": "9r:job-deploy-relay",
};

const TERMINAL = ["done", "error", "cancelled"];

function sleep(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    if (typeof timer.unref === "function") timer.unref();
  });
}

export function readStoredDashboardJob(kind) {
  try {
    const raw = localStorage.getItem(DASHBOARD_JOB_KEYS[kind]);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.jobId !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeStoredDashboardJob(kind, jobId) {
  try {
    localStorage.setItem(DASHBOARD_JOB_KEYS[kind], JSON.stringify({ jobId }));
  } catch {
    // Private mode or full quota: reattach after a reload just won't work.
  }
}

export function clearStoredDashboardJob(kind) {
  try {
    localStorage.removeItem(DASHBOARD_JOB_KEYS[kind]);
  } catch {
    // The job record expires on its own.
  }
}

/** Start a server-side operation. Returns `{ jobId, pollMs }`. */
export async function startDashboardJob(kind, payload, title = "") {
  const res = await fetch("/api/dashboard-jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, payload, title }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Could not start");
  writeStoredDashboardJob(kind, data.jobId);
  return { jobId: data.jobId, pollMs: Number(data.pollMs) || 1000 };
}

/** One status read. `null` when the record has expired. */
export async function fetchDashboardJob(jobId) {
  const res = await fetch(`/api/dashboard-jobs?id=${encodeURIComponent(jobId)}`, {
    cache: "no-store",
  });
  if (res.status === 404) return null;
  const data = await res.json().catch(() => ({}));
  return data?.job || null;
}

/**
 * Poll until the job reaches a terminal state. Callers that navigate away
 * simply stop awaiting; the job continues on the server. Returns the final job
 * (or `null` if the record vanished).
 */
export async function pollDashboardJob(jobId, onProgress, { pollMs = 1000, signal = null } = {}) {
  for (;;) {
    await sleep(pollMs);
    if (signal?.aborted) return null;

    let job = null;
    try {
      job = await fetchDashboardJob(jobId);
    } catch {
      // Transient fetch failure: keep polling rather than declaring the run
      // dead because one request dropped.
    }

    if (!job) return null;
    onProgress?.(job);
    if (TERMINAL.includes(job.status)) return job;
  }
}

/** Ask the server to stop. Safe to call for a job that already finished. */
export async function cancelDashboardJob(jobId) {
  try {
    await fetch(`/api/dashboard-jobs?id=${encodeURIComponent(jobId)}`, {
      method: "DELETE",
    });
  } catch {
    // Best effort.
  }
}