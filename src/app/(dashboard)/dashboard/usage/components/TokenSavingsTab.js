"use client";
import { useState, useEffect } from "react";
import EmptyWithAction from "./EmptyWithAction.js";

const fmt = (n) => {
  n = Number(n) || 0;
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(Math.round(n));
};

const money = (n) => "$" + (Number(n) || 0).toFixed(4);

function Bars({ daily }) {
  if (!daily || daily.length === 0) return null;
  const max = Math.max(...daily.map((d) => d.savedTokens), 1);
  return (
    <div role="img" aria-label="Daily saved tokens">
      <div className="flex h-28 items-stretch gap-1.5">
        {daily.map((d) => (
          <div key={d.date} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
            <div
              title={`${d.date}: ${fmt(d.savedTokens)} tokens saved (${d.requests} req)`}
              className="w-full rounded-t bg-emerald-500/70 hover:bg-emerald-400"
              style={{ height: `${Math.max(4, Math.round((d.savedTokens / max) * 100))}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1.5">
        {daily.map((d) => (
          <div key={d.date} className="min-w-0 flex-1 text-center text-[10px] text-text-muted">
            {d.date.slice(5)}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TokenSavingsTab({ period }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modelFilter, setModelFilter] = useState("");

  useEffect(() => {
    setLoading(true);
    fetch(`/api/usage/token-savings?period=${period}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [period]);

  if (loading) return <div className="text-text-muted text-sm">Loading savings...</div>;
  if (!data || !data.totals) {
    return <div className="text-text-muted text-sm">Couldn't load savings - refresh the page and try again.</div>;
  }

  const rows = (data.models || []).filter((m) =>
    modelFilter ? m.model.toLowerCase().includes(modelFilter.toLowerCase()) : true
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface-2 p-4">
          <div className="text-xs text-text-muted">Tokens saved</div>
          <div className="mt-1 text-2xl font-semibold text-emerald-400">{fmt(data.totals.savedTokens)}</div>
          <div className="text-xs text-text-muted">across {fmt(data.totals.requests)} requests</div>
        </div>
        <div className="rounded-xl border border-border bg-surface-2 p-4">
          <div className="text-xs text-text-muted">Est. cost avoided</div>
          <div className="mt-1 text-2xl font-semibold text-emerald-400">{money(data.totals.savedCost)}</div>
          <div className="text-xs text-text-muted">at live model rates</div>
        </div>
        <div className="rounded-xl border border-border bg-surface-2 p-4">
          <div className="text-xs text-text-muted">Coverage</div>
          <div className="mt-1 text-2xl font-semibold text-text-main">{(data.models || []).length} models</div>
          <div className="text-xs text-text-muted">with recorded savings</div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface-2 p-4">
        <div className="mb-2 text-sm font-medium text-text-main">Daily savings</div>
        {data.daily && data.daily.length > 0 ? (
          <Bars daily={data.daily} />
        ) : (
          <EmptyWithAction
            icon="savings"
            title="No savings recorded in this period yet"
            hint="Pruning, tool-output compression, and cache hits are counted here once Token Saver does some work."
            actionHref="/dashboard/token-saver"
            actionLabel="Open Token Saver"
          />
        )}
      </div>

      <div className="rounded-xl border border-border bg-surface-2 p-4">
        <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm font-medium text-text-main">Per model</div>
          <input
            value={modelFilter}
            onChange={(e) => setModelFilter(e.target.value)}
            placeholder="Filter models..."
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-text-main placeholder:text-text-muted sm:w-56"
          />
        </div>
        {rows.length === 0 ? (
          <div className="text-text-muted text-sm">
            {(data.models || []).length === 0
              ? "No savings recorded in this period yet."
              : "No models match your filter."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-left text-text-muted font-medium whitespace-nowrap">Model</th>
                  <th className="px-3 py-2 text-right text-text-muted font-medium whitespace-nowrap">Requests</th>
                  <th className="px-3 py-2 text-right text-text-muted font-medium whitespace-nowrap">Saved tokens</th>
                  <th className="px-3 py-2 text-right text-text-muted font-medium whitespace-nowrap">Est. saved</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.model} className="border-b border-border/50 hover:bg-state-hover">
                    <td className="px-3 py-2.5 max-w-[240px] truncate text-text-main" title={m.model}>{m.model}</td>
                    <td className="px-3 py-2.5 text-right text-text-main">{fmt(m.requests)}</td>
                    <td className="px-3 py-2.5 text-right text-emerald-400">{fmt(m.savedTokens)}</td>
                    <td className="px-3 py-2.5 text-right text-text-muted">{money(m.savedCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-2 text-xs text-text-muted">
          Cost is an estimate at live per-model rates; free-tier models record $0.
        </div>
      </div>
    </div>
  );
}
