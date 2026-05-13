"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { LeaderboardRow } from "@/app/api/leaderboard/route";

const COLORS = [
  "#16a34a",
  "#2563eb",
  "#ea580c",
  "#9333ea",
  "#dc2626",
  "#ca8a04",
  "#0891b2",
  "#db2777",
];

type Metric = "scores" | "points" | "placement";

type Props = {
  rows: LeaderboardRow[];
};

export function ScoreTrendChart({ rows }: Props) {
  const [metric, setMetric] = useState<Metric>("scores");
  const players = rows.filter((r) => r.series.length > 0);
  if (players.length === 0) return null;

  const fieldFor = (p: (typeof players)[number]["series"][number]) => {
    if (metric === "scores") return p.gross_score;
    if (metric === "points") return p.points;
    return p.rank;
  };

  const dateMap = new Map<string, Record<string, number | string | null>>();
  for (const p of players) {
    for (const point of p.series) {
      let row = dateMap.get(point.played_at);
      if (!row) {
        row = { played_at: point.played_at };
        dateMap.set(point.played_at, row);
      }
      row[p.key] = fieldFor(point);
    }
  }
  const data = Array.from(dateMap.values()).sort((a, b) =>
    (a.played_at as string).localeCompare(b.played_at as string),
  );

  const formatDate = (s: string) =>
    new Date(s + "T00:00:00").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });

  const yReversed = metric === "placement";
  const yDomain: [number | string, number | string] =
    metric === "placement"
      ? [1, "dataMax"]
      : metric === "points"
        ? [0, "dataMax + 1"]
        : ["dataMin - 2", "dataMax + 2"];
  const yAllowDecimals = metric === "scores";

  return (
    <div>
      <div className="flex justify-center mb-2">
        <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs font-medium">
          {(
            [
              ["scores", "Scores"],
              ["points", "Points"],
              ["placement", "Place"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setMetric(k)}
              className={`px-2.5 py-1 rounded transition ${
                metric === k ? "bg-white text-green-700 shadow-sm" : "text-gray-500"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 5, right: 8, bottom: 5, left: -10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="played_at"
            tickFormatter={formatDate}
            tick={{ fontSize: 11, fill: "#6b7280" }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#6b7280" }}
            domain={yDomain}
            reversed={yReversed}
            allowDecimals={yAllowDecimals}
          />
          <Tooltip
            labelFormatter={(label) =>
              typeof label === "string" ? formatDate(label) : ""
            }
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
          />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
          {players.map((p, i) => (
            <Line
              key={p.key}
              dataKey={p.key}
              name={p.name}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
