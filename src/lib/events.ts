import "server-only";
import type { DbApi } from "@/lib/db";
import { db } from "@/lib/db";

export type ScoreType = "eagle_or_better" | "birdie" | "par" | "bogey" | "double_bogey" | "worse";

export function classifyScore(strokes: number, par: number): ScoreType {
  const delta = strokes - par;
  if (delta <= -2) return "eagle_or_better";
  if (delta === -1) return "birdie";
  if (delta === 0) return "par";
  if (delta === 1) return "bogey";
  if (delta === 2) return "double_bogey";
  return "worse";
}

export const SCORE_TYPE_LABEL: Record<ScoreType, string> = {
  eagle_or_better: "Eagle+",
  birdie: "Birdie",
  par: "Par",
  bogey: "Bogey",
  double_bogey: "Double",
  worse: "+3 or worse",
};

export type CourseHoleMeta = {
  hole_number: number;
  par: number;
  handicap_index: number | null;
  yardage: number | null;
};

/**
 * If a course has no per-hole par rows yet, seed defaults: par-4 across the board.
 * Organizer can edit later. Returns whatever rows now exist, sorted by hole_number.
 */
export async function ensureCourseHoles(
  courseId: number,
  tx: DbApi = db,
): Promise<CourseHoleMeta[]> {
  const existing = await tx
    .prepare(
      `SELECT hole_number, par, handicap_index, yardage FROM course_holes
       WHERE course_id = ? ORDER BY hole_number ASC`,
    )
    .all<CourseHoleMeta>(courseId);
  if (existing.length > 0) return existing;

  const course = await tx
    .prepare("SELECT holes, par FROM courses WHERE id = ?")
    .get<{ holes: number; par: number }>(courseId);
  if (!course) return [];

  const holes = course.holes ?? 18;
  const totalPar = course.par ?? holes * 4;

  // Default: par 4 on every hole, then balance toward total par by swapping
  // an even count of 4s up to 5s or down to 3s.
  const pars = Array<number>(holes).fill(4);
  let diff = totalPar - holes * 4;
  // diff > 0 → convert some 4s to 5s; diff < 0 → convert some 4s to 3s
  for (let i = 0; i < holes && diff !== 0; i++) {
    if (diff > 0) {
      pars[i] = 5;
      diff -= 1;
    } else {
      pars[i] = 3;
      diff += 1;
    }
  }

  for (let i = 0; i < pars.length; i++) {
    await tx
      .prepare(
        `INSERT INTO course_holes (course_id, hole_number, par) VALUES (?, ?, ?)
         ON CONFLICT (course_id, hole_number) DO NOTHING`,
      )
      .run(courseId, i + 1, pars[i]);
  }

  return pars.map((par, idx) => ({
    hole_number: idx + 1,
    par,
    handicap_index: null,
    yardage: null,
  }));
}
