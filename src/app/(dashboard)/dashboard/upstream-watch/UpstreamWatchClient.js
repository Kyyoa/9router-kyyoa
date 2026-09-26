"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, Button } from "@/shared/components";

function timeAgo(iso) {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function statusBadge(r) {
  if (r.aheadBy === null && !r.status) {
    return <span className="text-xs px-2 py-0.5 rounded bg-black/5 dark:bg-white/5 text-text-muted">unknown</span>;
  }
  if (r.status === "identical" || r.aheadBy === 0) {
    return <span className="text-xs px-2 py-0.5 rounded bg-green-500/10 text-green-500">up to date</span>;
  }
  if (r.status === "diverged") {
    return <span className="text-xs px-2 py-0.5 rounded bg-amber-500/10 text-amber-500">diverged · +{r.aheadBy}</span>;
  }
  return <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary font-medium">+{r.aheadBy} ahead</span>;
}

export default function UpstreamWatchClient() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/upstream-watch").then((r) => r.json());
      setData(res);
      setError(res.lookupFailed ? "GitHub unreachable — showing nothing. Retry in a few minutes." : "");
    } catch (e) {
      setError(e?.message || "Failed to load upstream status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div className="flex min-w-0 flex-col gap-6 px-1 sm:px-0">
      <div className="min-w-0 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold leading-none text-text-main">Upstream Watch</h1>
          <p className="text-xs text-text-muted mt-0.5">
            What Decolua (utama) and Serenhope (acuan 2) have that this fork doesn&apos;t — read-only, nothing auto-pulls.
            {data?.localShort && <> Local: <code className="font-mono">{data.localShort}</code>.</>}
          </p>
        </div>
        <Button size="sm" variant="secondary" icon="refresh" onClick={fetchData}>
          Refresh
        </Button>
      </div>

      {loading ? (
        <Card padding="md"><div className="text-xs text-text-muted py-4">Checking upstreams...</div></Card>
      ) : error ? (
        <Card padding="md"><div className="text-xs text-red-500 py-4">{error}</div></Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {(data?.remotes || []).map((r) => (
            <Card key={r.id} padding="md" className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-main truncate">{r.label}</p>
                  <p className="text-[11px] text-text-muted font-mono truncate">{r.repo}@{r.branch}</p>
                </div>
                {statusBadge(r)}
              </div>
              <div className="rounded-lg bg-black/5 dark:bg-white/5 px-2.5 py-2">
                <p className="text-xs text-text-main break-words">{r.message || "—"}</p>
                <p className="text-[11px] text-text-muted mt-0.5 font-mono">
                  {r.headShort}{r.date && <> · {timeAgo(r.date)}</>}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a href={r.compareUrl} target="_blank" rel="noreferrer">
                  <Button size="sm" variant="secondary" icon="difference">
                    Lihat diff{r.aheadBy ? ` (+${r.aheadBy})` : ""}
                  </Button>
                </a>
                <span className="text-[11px] text-text-muted self-center">
                  Apply via CLI (nomor 3): <code className="font-mono">9router-kyyoa-update --from {r.id}</code>
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
      {data?.partial && (
        <p className="text-[11px] text-amber-500">One upstream failed to answer — showing partial data.</p>
      )}
    </div>
  );
}
