"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { RoundForm, type RoundFormInitial } from "@/components/round-form";
import { V2PageShell } from "@/components/v2/page-shell";
import { V2Card } from "@/components/v2/card";
import type { RoundDetail } from "@/app/api/rounds/[id]/route";
import type { User } from "@/lib/types";

export function V2EditRound() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [initial, setInitial] = useState<RoundFormInitial | null>(null);
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
    </V2PageShell>
  );
}
