"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { RoundForm, type RoundFormInitial } from "@/components/round-form";
import {
  ScorecardRoundForm,
  type ScorecardFormInitial,
} from "@/components/scorecard-round-form";
import type { RoundDetail } from "@/app/api/rounds/[id]/route";
import type { User } from "@/lib/types";

type Mode = "type" | "scorecard";

export function ClassicEditRound() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user: me } = useAuth();
  const [initial, setInitial] = useState<RoundFormInitial | null>(null);
  const [scorecardInitial, setScorecardInitial] =
    useState<ScorecardFormInitial | null>(null);
  const [hasGuests, setHasGuests] = useState(false);
  const [mode, setMode] = useState<Mode>("type");
  const [notFound, setNotFound] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    fetch("/api/users")
      .then((r) => r.json())
      .then((d) => setUsers(d.users ?? []));
  }, []);

  useEffect(() => {
    if (!params?.id) return;
    fetch(`/api/rounds/${params.id}`, { cache: "no-store" }).then(async (r) => {
      if (r.status === 404) {
        setNotFound(true);
        return;
      }
      const d = (await r.json()) as RoundDetail;
      if (!d.can_edit) {
        setForbidden(true);
        return;
      }
      const userMap = new Map(users.map((u) => [u.id, u]));
      const players: RoundFormInitial["players"] = d.scores.map((s) => {
        if (s.player_id) {
          const u = userMap.get(s.player_id);
          if (u) {
            return { kind: "user" as const, user: u, gross: String(s.gross_score) };
          }
          return {
            kind: "user" as const,
            user: {
              id: s.player_id,
              username: s.username ?? "?",
              display_name: s.name,
              avatar_url: null,
              is_admin: false,
              created_at: "",
            },
            gross: String(s.gross_score),
          };
        }
        return {
          kind: "guest" as const,
          name: s.guest_name ?? "?",
          gross: String(s.gross_score),
        };
      });
      setInitial({
        courseId: d.course_id,
        playedAt: d.played_at,
        notes: d.notes ?? "",
        holeCount: d.hole_count === 9 ? 9 : 18,
        players,
      });

      // Build scorecard initial state — only registered players (hole_scores
      // can't reference guests). If any guests are present we hide the
      // scorecard mode entirely since saving would drop their scores.
      const guestsPresent = d.scores.some((s) => s.is_guest);
      setHasGuests(guestsPresent);
      const scorecardPlayers = d.scores
        .filter((s) => s.player_id)
        .map((s) => {
          const u =
            userMap.get(s.player_id!) ?? ({
              id: s.player_id!,
              username: s.username ?? "?",
              display_name: s.name,
              avatar_url: null,
              is_admin: false,
              created_at: "",
            } as User);
          return { user: u, strokes: s.hole_strokes.slice() };
        });
      setScorecardInitial({
        courseId: d.course_id,
        playedAt: d.played_at,
        notes: d.notes ?? "",
        holeCount: d.hole_count === 9 ? 9 : 18,
        players: scorecardPlayers,
      });
      // Default to scorecard mode if there's any per-hole data and no guests.
      const anyStrokes = d.scores.some((s) =>
        s.hole_strokes.some((v) => v != null),
      );
      if (anyStrokes && !guestsPresent) setMode("scorecard");
    });
  }, [params?.id, users]);

  if (notFound) {
    return (
      <div className="max-w-lg mx-auto px-4 py-6">
        <Link href="/" className="text-sm text-green-700 font-medium">
          ← Home
        </Link>
        <div className="card mt-4 text-center py-10 text-gray-400">
          Round not found.
        </div>
      </div>
    );
  }
  if (forbidden) {
    return (
      <div className="max-w-lg mx-auto px-4 py-6">
        <Link href={`/rounds/${params?.id}`} className="text-sm text-green-700 font-medium">
          ← Round
        </Link>
        <div className="card mt-4 text-center py-10 text-gray-400">
          You don&apos;t have permission to edit this round.
        </div>
      </div>
    );
  }
  if (!initial) {
    return (
      <div className="max-w-lg mx-auto px-4 py-6">
        <div className="animate-pulse text-green-700">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <Link href={`/rounds/${params?.id}`} className="text-sm text-green-700 font-medium">
        ← Round
      </Link>
      <h1 className="text-2xl font-bold text-green-800 my-4">Edit Round</h1>

      {!hasGuests && (
        <div className="mb-4 flex bg-gray-100 rounded-lg p-0.5 text-sm font-medium">
          <button
            type="button"
            onClick={() => setMode("type")}
            className={`flex-1 px-3 py-2 rounded transition ${
              mode === "type"
                ? "bg-white text-green-700 shadow-sm"
                : "text-gray-500"
            }`}
          >
            Type scores
          </button>
          <button
            type="button"
            onClick={() => setMode("scorecard")}
            className={`flex-1 px-3 py-2 rounded transition ${
              mode === "scorecard"
                ? "bg-white text-green-700 shadow-sm"
                : "text-gray-500"
            }`}
          >
            Edit scorecard
          </button>
        </div>
      )}

      {mode === "scorecard" && scorecardInitial && me ? (
        <ScorecardRoundForm
          me={me}
          initial={scorecardInitial}
          submitLabel="Save Changes"
          onSubmit={async (payload) => {
            const res = await fetch(`/api/rounds/${params?.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                course_id: payload.course_id,
                played_at: payload.played_at,
                notes: payload.notes,
                hole_count: payload.hole_count,
                scores: payload.players.map((p) => ({
                  player_id: p.player_id,
                  strokes: p.strokes,
                })),
              }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? "Save failed");
            router.push(`/rounds/${params?.id}`);
            router.refresh();
          }}
        />
      ) : (
        <RoundForm
          submitLabel="Save Changes"
          initial={initial}
          onSubmit={async (payload) => {
            const res = await fetch(`/api/rounds/${params?.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? "Save failed");
            router.push(`/rounds/${params?.id}`);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
