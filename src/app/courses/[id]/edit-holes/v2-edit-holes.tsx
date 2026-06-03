"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { V2PageShell } from "@/components/v2/page-shell";
import { V2Card } from "@/components/v2/card";
import type { CourseDetail, CourseHoleDetail } from "@/app/api/courses/[id]/route";

type FieldKey = "par" | "handicap_index" | "yardage";

type Draft = { par: string; handicap_index: string; yardage: string };

function toDraft(h: CourseHoleDetail): Draft {
  return {
    par: String(h.par),
    handicap_index: h.handicap_index == null ? "" : String(h.handicap_index),
    yardage: h.yardage == null ? "" : String(h.yardage),
  };
}

type RatingField =
  | "course_rating"
  | "slope_rating"
  | "front_9_rating"
  | "front_9_slope"
  | "back_9_rating"
  | "back_9_slope";

type RatingDraft = Record<RatingField, string>;

function toRatingDraft(c: {
  course_rating: number | null;
  slope_rating: number | null;
  front_9_rating: number | null;
  front_9_slope: number | null;
  back_9_rating: number | null;
  back_9_slope: number | null;
}): RatingDraft {
  return {
    course_rating: c.course_rating == null ? "" : String(c.course_rating),
    slope_rating: c.slope_rating == null ? "" : String(c.slope_rating),
    front_9_rating: c.front_9_rating == null ? "" : String(c.front_9_rating),
    front_9_slope: c.front_9_slope == null ? "" : String(c.front_9_slope),
    back_9_rating: c.back_9_rating == null ? "" : String(c.back_9_rating),
    back_9_slope: c.back_9_slope == null ? "" : String(c.back_9_slope),
  };
}

const cellInput =
  "w-12 rounded border border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-1 py-0.5 text-center text-[var(--v2-text)]";
const ratingInput =
  "w-full rounded border border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-2 py-1 text-sm text-[var(--v2-text)]";

export function V2EditHoles() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<CourseDetail | null>(null);
  const [drafts, setDrafts] = useState<Map<number, Draft>>(new Map());
  const [ratingDraft, setRatingDraft] = useState<RatingDraft | null>(null);
  const [savingHole, setSavingHole] = useState<number | null>(null);
  const [savingRatings, setSavingRatings] = useState(false);
  const [pullingRatings, setPullingRatings] = useState(false);
  const [pullNote, setPullNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!params?.id) return;
    const res = await fetch(`/api/courses/${params.id}`, { cache: "no-store" });
    if (!res.ok) {
      setError("Failed to load course");
      return;
    }
    const d: CourseDetail = await res.json();
    setData(d);
    const next = new Map<number, Draft>();
    for (const h of d.holes ?? []) next.set(h.hole_number, toDraft(h));
    setDrafts(next);
    setRatingDraft(toRatingDraft(d.course));
  }, [params?.id]);

  useEffect(() => {
    load();
  }, [load]);

  if (authLoading) {
    return (
      <div className="v2-bg flex min-h-screen items-center justify-center">
        <div className="animate-pulse text-[var(--v2-gold)]">Loading…</div>
      </div>
    );
  }
  if (!user) return null;
  if (!user.is_admin) {
    return (
      <V2PageShell>
        <Link href={`/courses/${params?.id ?? ""}`} className="text-sm text-[var(--v2-gold)]">
          ← Course
        </Link>
        <V2Card className="mt-4 py-10 text-center text-[var(--v2-text-dim)]">Admin only.</V2Card>
      </V2PageShell>
    );
  }
  if (!data) {
    return (
      <V2PageShell>
        <div className="animate-pulse text-[var(--v2-gold)]">Loading…</div>
      </V2PageShell>
    );
  }

  function setField(holeNumber: number, key: FieldKey, value: string) {
    setDrafts((m) => {
      const next = new Map(m);
      const cur = next.get(holeNumber) ?? { par: "4", handicap_index: "", yardage: "" };
      next.set(holeNumber, { ...cur, [key]: value });
      return next;
    });
  }

  async function pullRatingsFromApi() {
    if (!data) return;
    setError(null);
    setPullNote(null);
    setPullingRatings(true);
    try {
      const res = await fetch(`/api/admin/courses/${data.course.id}/external-ratings`, {
        cache: "no-store",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Pull failed");
      setRatingDraft((d) =>
        d
          ? {
              course_rating: j.course_rating == null ? d.course_rating : String(j.course_rating),
              slope_rating: j.slope_rating == null ? d.slope_rating : String(j.slope_rating),
              front_9_rating: j.front_9_rating == null ? d.front_9_rating : String(j.front_9_rating),
              front_9_slope: j.front_9_slope == null ? d.front_9_slope : String(j.front_9_slope),
              back_9_rating: j.back_9_rating == null ? d.back_9_rating : String(j.back_9_rating),
              back_9_slope: j.back_9_slope == null ? d.back_9_slope : String(j.back_9_slope),
            }
          : d,
      );
      setPullNote(
        j.tee_name
          ? `Filled from "${j.tee_name}" tee — review then Save.`
          : "Filled from API — review then Save.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pull failed");
    } finally {
      setPullingRatings(false);
    }
  }

  async function saveRatings() {
    if (!data || !ratingDraft) return;
    setError(null);
    setSavingRatings(true);
    try {
      const body: Record<string, number | null> = {};
      for (const k of Object.keys(ratingDraft) as RatingField[]) {
        const v = ratingDraft[k].trim();
        body[k] = v === "" ? null : Number(v);
      }
      const res = await fetch(`/api/admin/courses/${data.course.id}/ratings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Save failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingRatings(false);
    }
  }

  async function saveHole(holeNumber: number) {
    setError(null);
    const d = drafts.get(holeNumber);
    if (!d) return;
    setSavingHole(holeNumber);
    try {
      const par = Number(d.par);
      if (!Number.isInteger(par) || par < 3 || par > 6) {
        throw new Error(`Hole ${holeNumber}: par must be 3–6`);
      }
      const body: Record<string, unknown> = { hole_number: holeNumber, par };
      const hi = d.handicap_index.trim();
      if (hi === "") body.handicap_index = null;
      else {
        const n = Number(hi);
        if (!Number.isInteger(n) || n < 1 || n > 18) {
          throw new Error(`Hole ${holeNumber}: HCP must be 1–18 or blank`);
        }
        body.handicap_index = n;
      }
      const yd = d.yardage.trim();
      if (yd === "") body.yardage = null;
      else {
        const n = Number(yd);
        if (!Number.isInteger(n) || n < 30 || n > 800) {
          throw new Error(`Hole ${holeNumber}: yardage must be 30–800 or blank`);
        }
        body.yardage = n;
      }
      const res = await fetch(`/api/admin/courses/${data!.course.id}/holes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Save failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingHole(null);
    }
  }

  return (
    <V2PageShell>
      <Link href={`/courses/${data.course.id}`} className="text-sm font-medium text-[var(--v2-gold)]">
        ← {data.course.name}
      </Link>
      <h1
        className="my-3 text-[22px] font-medium text-[var(--v2-gold)]"
        style={{ fontFamily: "var(--font-fraunces), Georgia, serif" }}
      >
        Edit holes
      </h1>

      <p className="mb-4 text-xs text-[var(--v2-text-dim)]">
        Changes here update <code className="text-[var(--v2-text)]">course_holes</code> only. Existing
        rounds keep their snapshotted par/handicap/yardage and won&rsquo;t shift.
      </p>

      {error && (
        <div className="mb-3 rounded-lg border border-red-800 bg-red-950/60 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {ratingDraft && (
        <V2Card className="mb-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[var(--v2-text)]">Course ratings</h2>
            {data.course.external_id && (
              <button
                type="button"
                onClick={pullRatingsFromApi}
                disabled={pullingRatings}
                className="text-xs font-medium text-[var(--v2-gold)] disabled:opacity-50"
              >
                {pullingRatings ? "Pulling…" : "Pull from API"}
              </button>
            )}
          </div>
          <p className="mb-3 text-xs text-[var(--v2-text-dim)]">
            Used to compute handicap differentials. Leave blank for unknown.
          </p>
          {pullNote && (
            <div className="mb-3 rounded-md border border-[var(--v2-gold)]/30 bg-[var(--v2-gold)]/10 px-2 py-1.5 text-xs text-[var(--v2-gold)]">
              {pullNote}
            </div>
          )}
          <div className="space-y-3">
            <RatingRow label="18-hole" ratingField="course_rating" slopeField="slope_rating" draft={ratingDraft} setDraft={setRatingDraft} />
            <RatingRow label="Front 9" ratingField="front_9_rating" slopeField="front_9_slope" draft={ratingDraft} setDraft={setRatingDraft} />
            <RatingRow label="Back 9" ratingField="back_9_rating" slopeField="back_9_slope" draft={ratingDraft} setDraft={setRatingDraft} />
          </div>
          <button
            type="button"
            onClick={saveRatings}
            disabled={savingRatings}
            className="mt-3 w-full rounded-lg bg-[var(--v2-gold)] py-2 text-sm font-semibold text-[var(--v2-green-deep)] disabled:opacity-50"
          >
            {savingRatings ? "Saving…" : "Save ratings"}
          </button>
        </V2Card>
      )}

      <V2Card className="!p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-xs">
            <thead>
              <tr className="text-[var(--v2-text-dim)]">
                <th className="px-2 py-2 text-left font-medium">Hole</th>
                <th className="px-2 py-2 text-left font-medium">Par</th>
                <th className="px-2 py-2 text-left font-medium">HCP</th>
                <th className="px-2 py-2 text-left font-medium">Yds</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {data.holes?.map((h) => {
                const d = drafts.get(h.hole_number) ?? toDraft(h);
                const dirty =
                  d.par !== String(h.par) ||
                  d.handicap_index !== (h.handicap_index == null ? "" : String(h.handicap_index)) ||
                  d.yardage !== (h.yardage == null ? "" : String(h.yardage));
                const busy = savingHole === h.hole_number;
                return (
                  <tr key={h.hole_number} className="border-t border-[var(--v2-border)]">
                    <td className="px-2 py-1.5 font-semibold text-[var(--v2-text)]">{h.hole_number}</td>
                    <td className="px-2 py-1.5">
                      <input
                        type="number"
                        inputMode="numeric"
                        value={d.par}
                        onChange={(e) => setField(h.hole_number, "par", e.target.value)}
                        className={cellInput}
                        min={3}
                        max={6}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="number"
                        inputMode="numeric"
                        value={d.handicap_index}
                        onChange={(e) => setField(h.hole_number, "handicap_index", e.target.value)}
                        className={cellInput}
                        min={1}
                        max={18}
                        placeholder="—"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="number"
                        inputMode="numeric"
                        value={d.yardage}
                        onChange={(e) => setField(h.hole_number, "yardage", e.target.value)}
                        className={`${cellInput} !w-16`}
                        min={30}
                        max={800}
                        placeholder="—"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <button
                        type="button"
                        onClick={() => saveHole(h.hole_number)}
                        disabled={!dirty || busy}
                        className="rounded border border-[var(--v2-gold)]/35 bg-[var(--v2-gold)]/10 px-2 py-1 text-xs font-medium text-[var(--v2-gold)] disabled:opacity-30"
                      >
                        {busy ? "…" : "Save"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </V2Card>

      <button
        type="button"
        onClick={() => router.push(`/courses/${data.course.id}`)}
        className="mt-4 w-full rounded-lg border border-[var(--v2-border)] bg-[var(--v2-surface)] py-2 text-sm font-medium text-[var(--v2-text)]"
      >
        Done
      </button>
    </V2PageShell>
  );
}

function RatingRow({
  label,
  ratingField,
  slopeField,
  draft,
  setDraft,
}: {
  label: string;
  ratingField: RatingField;
  slopeField: RatingField;
  draft: RatingDraft;
  setDraft: (updater: (d: RatingDraft | null) => RatingDraft | null) => void;
}) {
  const update = (key: RatingField, value: string) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 text-xs font-medium text-[var(--v2-text-dim)]">{label}</div>
      <div className="flex-1">
        <label className="block text-[10px] uppercase tracking-wide text-[var(--v2-text-faint)]">Rating</label>
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          value={draft[ratingField]}
          onChange={(e) => update(ratingField, e.target.value)}
          placeholder="—"
          className={ratingInput}
        />
      </div>
      <div className="flex-1">
        <label className="block text-[10px] uppercase tracking-wide text-[var(--v2-text-faint)]">Slope</label>
        <input
          type="number"
          inputMode="numeric"
          value={draft[slopeField]}
          onChange={(e) => update(slopeField, e.target.value)}
          placeholder="—"
          className={ratingInput}
        />
      </div>
    </div>
  );
}
