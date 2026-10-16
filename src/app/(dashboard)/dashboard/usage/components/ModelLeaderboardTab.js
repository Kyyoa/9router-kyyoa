"use client";
import { useState, useEffect } from "react";
import EmptyWithAction from "./EmptyWithAction.js";

export default function ModelLeaderboardTab({ period }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/usage/leaderboard?period=${period}`)
      .then(r => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [period]);

  if (loading) return <div className="text-text-muted text-sm">Loading leaderboard...</div>;
  if (!data || !data.leaderboard || data.leaderboard.length === 0) {
    return <EmptyWithAction icon="leaderboard" title="No model traffic yet" hint="The leaderboard ranks models by request volume once your first request lands." actionHref="/dashboard/endpoint" actionLabel="Get an API key" secondaryHref="/dashboard/arena" secondaryLabel="Send a test request" />;
  }

  const fmt = (n) => {
    if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
    return String(n);
  };

  return (
    <div className="rounded-xl border border-border bg-surface-2 p-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-3 py-2 text-left text-text-muted font-medium whitespace-nowrap">#</th>
              <th className="px-3 py-2 text-left text-text-muted font-medium whitespace-nowrap">Model</th>
              <th className="px-3 py-2 text-right text-text-muted font-medium whitespace-nowrap">Requests</th>
              <th className="px-3 py-2 text-right text-text-muted font-medium whitespace-nowrap">Success Rate</th>
              <th className="px-3 py-2 text-right text-text-muted font-medium whitespace-nowrap">Prompt Tokens</th>
              <th className="px-3 py-2 text-right text-text-muted font-medium whitespace-nowrap">Completion</th>
              <th className="px-3 py-2 text-right text-text-muted font-medium whitespace-nowrap">Avg/Req</th>
            </tr>
          </thead>
          <tbody>
            {data.leaderboard.map((m, i) => (
              <tr key={i} className="border-b border-border/50 hover:bg-state-hover">
                <td className="px-3 py-2.5 text-text-muted">{i + 1}</td>
                <td className="px-3 py-2.5 max-w-[240px] truncate text-text-main" title={m.model}>{m.model}</td>
                <td className="px-3 py-2.5 text-right text-text-main">{fmt(m.requests)}</td>
                <td className="px-3 py-2.5 text-right">
                  <span className={Number(m.successRate) >= 95 ? "text-emerald-400" : Number(m.successRate) >= 80 ? "text-amber-400" : "text-red-400"}>
                    {m.successRate}%
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right text-text-muted">{fmt(m.promptTokens)}</td>
                <td className="px-3 py-2.5 text-right text-text-muted">{fmt(m.completionTokens)}</td>
                <td className="px-3 py-2.5 text-right text-text-muted">{fmt(m.avgTokensPerRequest)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
