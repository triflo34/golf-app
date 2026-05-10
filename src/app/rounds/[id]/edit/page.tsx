"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { RoundForm, type RoundFormInitial } from "@/components/round-form";
import type { RoundDetail } from "@/app/api/rounds/[id]/route";
import type { User } from "@/lib/types";

export default function EditRoundPage() {
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
      // Defer building initial state until users list is loaded so we can hydrate user objects.
      const userMap = new Map(users.map((u) => [u.id, u]));
      const players: RoundFormInitial["players"] = d.scores.map((s) => {
        if (s.player_id) {
          const u = userMap.get(s.player_id);
          if (u) {
            return { kind: "user" as const, user: u, gross: String(s.gross_score) };
          }
          // Fallback to a synthetic user if missing (shouldn't happen normally)
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
        players,
      });
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
    </div>
  );
}
