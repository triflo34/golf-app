"use client";

import { useEffect, useMemo, useState } from "react";
import type { PlayerSummary } from "@/app/api/players/route";

type Props = {
  value: string | null;
  onChange: (key: string | null, name: string | null) => void;
  excludeKey?: string | null;
  placeholder?: string;
  label?: string;
};

export function PlayerPicker({
  value,
  onChange,
  excludeKey,
  placeholder = "Pick a player…",
  label,
}: Props) {
  const [players, setPlayers] = useState<PlayerSummary[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/players")
      .then((r) => r.json())
      .then((d) => setPlayers(d.players ?? []));
  }, []);

  useEffect(() => {
    if (!value) return;
    const selected = players.find((p) => p.key === value);
    if (selected) return;
    const [kind, id] = value.split(":");
    if (kind !== "u" || !id) return;

    fetch(`/api/player?key=${encodeURIComponent(value)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d && typeof d.name === "string") {
          setPlayers((current) => [
            ...current,
            {
              key: value,
              name: d.name,
              is_guest: false,
              user_id: id,
            },
          ]);
        }
      });
  }, [value, players]);

  const selected = players.find((p) => p.key === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return players
      .filter((p) => p.key !== excludeKey)
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .slice(0, 30);
  }, [players, query, excludeKey]);

  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
        </label>
      )}
      {selected ? (
        <div className="flex items-center justify-between bg-green-50 rounded-lg px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-800">{selected.name}</span>
            {selected.is_guest && (
              <span className="text-[10px] font-semibold text-yellow-700 bg-yellow-100 px-1.5 py-0.5 rounded">
                guest
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              onChange(null, null);
              setOpen(true);
            }}
            className="text-sm text-green-700 font-medium"
          >
            Change
          </button>
        </div>
      ) : (
        <>
          <input
            type="text"
            value={query}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            placeholder={placeholder}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
          />
          {open && (
            <div className="mt-2 max-h-60 overflow-y-auto border border-gray-200 rounded-lg">
              {filtered.length === 0 ? (
                <div className="p-3 text-sm text-gray-400">No players</div>
              ) : (
                filtered.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => {
                      onChange(p.key, p.name);
                      setQuery("");
                      setOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-green-50 border-b border-gray-100 last:border-b-0 flex items-center justify-between"
                  >
                    <span className="text-sm font-semibold text-gray-800">
                      {p.name}
                    </span>
                    {p.is_guest && (
                      <span className="text-[10px] font-semibold text-yellow-700 bg-yellow-100 px-1.5 py-0.5 rounded">
                        guest
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
