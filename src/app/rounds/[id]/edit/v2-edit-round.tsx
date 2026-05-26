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
import { V2PageShell } from "@/components/v2/page-shell";
import { V2Card } from "@/components/v2/card";
import type { RoundDetail } from "@/app/api/rounds/[id]/route";
import type { User } from "@/lib/types";

type Mode = "type" | "scorecard";

export function V2EditRound() {
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
      const anyStrokes = d.scores.some((s) =>
        s.hole_strokes.some((v) => v != null),
      );
      if (anyStrokes && !guestsPresent) setMode("scorecard");
    });
  }, [params?.id, users]);

  if (notFound) {
    return (
      <V2PageShell>
        <Link href="/" className="text-sm font-medium text-[var(--v2-accent)]">
          ← Home
        </Link>
        <V2Card className="mt-4">
          <div className="py-8 text-center text-[var(--v2-muted)]">
            Round not found.
          </div>
        </V2Card>
      </V2PageShell>
    );
  }
  if (forbidden) {
    return (
      <V2PageShell>
        <Link
          href={`/rounds/${params?.id}`}
          className="text-sm font-medium text-[var(--v2-accent)]"
        >
          ← Round
        </Link>
        <V2Card className="mt-4">
          <div className="py-8 text-center text-[var(--v2-muted)]">
            You don&apos;t have permission to edit this round.
          </div>
        </V2Card>
      </V2PageShell>
    );
  }
  if (!initial) {
    return (
      <V2PageShell>
        <div className="animate-pulse text-[var(--v2-accent)]">Loading…</div>
      </V2PageShell>
    );
  }

  return (
    <V2PageShell>
      <Link
        href={`/rounds/${params?.id}`}
        className="text-sm font-medium text-[var(--v2-accent)]"
      >
        ← Round
      </Link>
      <h1 className="my-4 text-2xl font-bold text-[var(--v2-accent)]">
        Edit Round
      </h1>

      {!hasGuests && (
        <div className="mb-4 flex rounded-full border border-[var(--v2-border)] bg-[var(--v2-surface)] p-0.5 text-sm font-medium">
          <button
            type="button"
            onClick={() => setMode("type")}
            className={`flex-1 rounded-full px-3 py-2 transition ${
              mode === "type"
                ? "bg-[var(--v2-accent)] text-black"
                : "text-[var(--v2-muted)]"
            }`}
          >
            Type scores
          </button>
          <button
            type="button"
            onClick={() => setMode("scorecard")}
            className={`flex-1 rounded-full px-3 py-2 transition ${
              mode === "scorecard"
                ? "bg-[var(--v2-accent)] text-black"
                : "text-[var(--v2-muted)]"
            }`}
          >
            Edit scorecard
          </button>
        </div>
      )}

      {mode === "scorecard" && scorecardInitial && me ? (
        <ScorecardRoundForm
          variant="v2"
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
          variant="v2"
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
    </V2PageShell>
  );
}
