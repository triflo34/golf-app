"use client";

import { useEffect, useMemo, useState } from "react";
import type { PlayerSummary } from "@/app/api/players/route";

type Variant = "classic" | "v2";

type Props = {
  value: string | null;
  onChange: (key: string | null, name: string | null) => void;
  excludeKey?: string | null;
  placeholder?: string;
  label?: string;
  /** Visual variant. Defaults to "classic" for backwards compatibility. */
  variant?: Variant;
};

export function PlayerPicker({
  value,
  onChange,
  excludeKey,
  placeholder = "Pick a player…",
  label,
  variant = "classic",
}: Props) {
  const v2 = variant === "v2";
  const cls = {
    label: v2
      ? "block text-sm font-medium text-[var(--v2-muted)] mb-1"
      : "block text-sm font-medium text-gray-700 mb-1",
    selectedBox: v2
      ? "flex items-center justify-between rounded-lg bg-[var(--v2-surface-2)] px-3 py-2"
      : "flex items-center justify-between bg-green-50 rounded-lg px-3 py-2",
    selectedName: v2 ? "font-semibold text-white" : "font-semibold text-gray-800",
    guestBadge: v2
      ? "text-[10px] font-semibold text-[var(--v2-accent)] bg-[var(--v2-accent)]/20 px-1.5 py-0.5 rounded"
      : "text-[10px] font-semibold text-yellow-700 bg-yellow-100 px-1.5 py-0.5 rounded",
    changeBtn: v2
      ? "text-sm font-medium text-[var(--v2-accent)]"
      : "text-sm text-green-700 font-medium",
    input: v2
      ? "w-full rounded-lg border border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-3 py-2 text-white placeholder-[var(--v2-muted)] focus:border-[var(--v2-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--v2-accent)]/40"
      : "w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900",
    dropdown: v2
      ? "mt-2 max-h-60 overflow-y-auto rounded-lg border border-[var(--v2-border)] bg-[var(--v2-surface-2)]"
      : "mt-2 max-h-60 overflow-y-auto border border-gray-200 rounded-lg",
    dropdownEmpty: v2
      ? "p-3 text-sm text-[var(--v2-muted)]"
      : "p-3 text-sm text-gray-400",
    dropdownRow: v2
      ? "w-full px-3 py-2 text-left hover:bg-[var(--v2-surface)] border-b border-[var(--v2-border)] last:border-b-0 flex items-center justify-between"
      : "w-full text-left px-3 py-2 hover:bg-green-50 border-b border-gray-100 last:border-b-0 flex items-center justify-between",
    dropdownName: v2 ? "text-sm font-semibold text-white" : "text-sm font-semibold text-gray-800",
  };
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
      {label && <label className={cls.label}>{label}</label>}
      {selected ? (
        <div className={cls.selectedBox}>
          <div className="flex items-center gap-2">
            <span className={cls.selectedName}>{selected.name}</span>
            {selected.is_guest && (
              <span className={cls.guestBadge}>guest</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              onChange(null, null);
              setOpen(true);
            }}
            className={cls.changeBtn}
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
            className={cls.input}
          />
          {open && (
            <div className={cls.dropdown}>
              {filtered.length === 0 ? (
                <div className={cls.dropdownEmpty}>No players</div>
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
                    className={cls.dropdownRow}
                  >
                    <span className={cls.dropdownName}>{p.name}</span>
                    {p.is_guest && (
                      <span className={cls.guestBadge}>guest</span>
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
