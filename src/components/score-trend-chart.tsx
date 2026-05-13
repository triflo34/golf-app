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
import type { LeaderboardRow, SeriesPoint } from "@/app/api/leaderboard/route";
import { wmoLabel } from "@/lib/weather-labels";

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

  type ChartRow = Record<string, unknown> & { played_at: string; _weather?: SeriesPoint };
  const dateMap = new Map<string, ChartRow>();
  for (const p of players) {
    for (const point of p.series) {
      let row = dateMap.get(point.played_at);
      if (!row) {
        row = { played_at: point.played_at, _weather: point };
        dateMap.set(point.played_at, row);
      }
      row[p.key] = fieldFor(point);
    }
  }
  const data = Array.from(dateMap.values()).sort((a, b) =>
    a.played_at.localeCompare(b.played_at),
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
          <Tooltip content={<WeatherTooltip metric={metric} />} />
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

type TooltipPayloadItem = {
  name?: string | number;
  value?: number | string | null;
  color?: string;
  payload?: { _weather?: SeriesPoint };
};

function WeatherTooltip({
  active,
  payload,
  label,
  metric,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string | number;
  metric: Metric;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const weather = payload[0]?.payload?._weather;
  const dateLabel =
    typeof label === "string"
      ? new Date(label + "T00:00:00").toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })
      : "";
  const suffix = metric === "points" ? " pts" : metric === "placement" ? "" : "";
  const prefix = metric === "placement" ? "#" : "";
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-md px-2.5 py-2 text-xs">
      <div className="font-semibold text-gray-800 mb-1">{dateLabel}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ backgroundColor: p.color }}
          />
          <span className="text-gray-600">{p.name}:</span>
          <span className="font-medium text-gray-800">
            {p.value == null ? "—" : `${prefix}${p.value}${suffix}`}
          </span>
        </div>
      ))}
      {weather && weather.weather_code != null && (
        <div className="mt-1.5 pt-1.5 border-t border-gray-100 text-gray-600">
          <div className="font-medium text-gray-700">{wmoLabel(weather.weather_code)}</div>
          <div className="text-[11px] flex flex-wrap gap-x-2">
            {weather.temp_high_f != null && weather.temp_low_f != null && (
              <span>
                {Math.round(weather.temp_high_f)}° / {Math.round(weather.temp_low_f)}°
              </span>
            )}
            {weather.wind_max_mph != null && (
              <span>{Math.round(weather.wind_max_mph)} mph</span>
            )}
            {weather.precip_in != null && weather.precip_in > 0 && (
              <span>{weather.precip_in.toFixed(2)}&quot; rain</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
