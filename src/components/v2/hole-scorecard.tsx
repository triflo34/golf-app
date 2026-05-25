import type { RoundDetail } from "@/app/api/rounds/[id]/route";

type Score = RoundDetail["scores"][number];

type Props = {
  holeCount: number;
  pars: number[];
  scores: Score[];
  /** "v2" for dark/gold styling, "classic" for the existing light theme. */
  variant?: "v2" | "classic";
};

/**
 * Full per-hole scorecard table with par row + one row per player.
 * Cells are color-coded by diff from par. Used on round detail pages.
 *
 * Renders nothing if no player has any per-hole strokes recorded — caller
 * should branch on `scores.every(s => s.hole_strokes.every(v => v == null))`
 * to show an alternate "no scorecard" UI.
 */
export function HoleScorecard({
  holeCount,
  pars,
  scores,
  variant = "v2",
}: Props) {
  const dark = variant === "v2";
  const holes = Array.from({ length: holeCount }, (_, i) => i + 1);
  const totalPar =
    pars.length >= holeCount
      ? pars.slice(0, holeCount).reduce((a, b) => a + (b || 0), 0)
      : null;

  const headBg = dark ? "bg-[var(--v2-surface-2)]" : "bg-gray-50";
  const headText = dark ? "text-[var(--v2-muted)]" : "text-gray-600";
  const stickyBg = dark ? "bg-[var(--v2-surface)]" : "bg-white";
  const borderColor = dark ? "border-[var(--v2-border)]" : "border-gray-200";
  const totalText = dark ? "text-white" : "text-gray-800";

  return (
    <div className="overflow-x-auto -mx-4 px-4">
      <table className="min-w-max border-separate border-spacing-0 text-xs">
        <thead>
          <tr>
            <th
              className={`sticky left-0 z-10 ${stickyBg} ${headText} border-b ${borderColor} px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide`}
            >
              Hole
            </th>
            {holes.map((h) => (
              <th
                key={h}
                className={`${headBg} ${headText} border-b ${borderColor} w-8 px-1 py-1.5 text-center font-semibold`}
              >
                {h}
              </th>
            ))}
            <th
              className={`${headBg} ${totalText} border-b ${borderColor} px-2 py-1.5 text-center font-bold`}
            >
              Tot
            </th>
          </tr>
          {pars.length >= holeCount && (
            <tr>
              <th
                className={`sticky left-0 z-10 ${stickyBg} ${headText} border-b ${borderColor} px-2 py-1.5 text-left text-[10px] font-medium`}
              >
                Par
              </th>
              {holes.map((h, i) => (
                <th
                  key={h}
                  className={`${headText} border-b ${borderColor} px-1 py-1.5 text-center font-medium`}
                >
                  {pars[i] || "—"}
                </th>
              ))}
              <th
                className={`${totalText} border-b ${borderColor} px-2 py-1.5 text-center font-bold`}
              >
                {totalPar ?? "—"}
              </th>
            </tr>
          )}
        </thead>
        <tbody>
          {scores.map((s) => {
            const cells = s.hole_strokes.slice(0, holeCount);
            const allBlank = cells.every((v) => v == null);
            const total = cells.reduce<number>(
              (a, v) => (v == null ? a : a + v),
              0,
            );
            return (
              <tr key={s.id}>
                <td
                  className={`sticky left-0 z-10 ${stickyBg} ${totalText} border-b ${borderColor} max-w-[7rem] truncate px-2 py-1.5 font-semibold`}
                >
                  {s.name}
                </td>
                {holes.map((h, i) => {
                  const v = cells[i] ?? null;
                  const par = pars[i] || 0;
                  return (
                    <td
                      key={h}
                      className={`border-b ${borderColor} px-0.5 py-1 text-center`}
                    >
                      {v == null ? (
                        <span className={dark ? "text-[var(--v2-muted)]" : "text-gray-400"}>
                          —
                        </span>
                      ) : (
                        <span
                          className={`inline-block min-w-[1.5rem] rounded ${cellTone(v, par, dark)} px-1 py-0.5 font-semibold`}
                        >
                          {v}
                        </span>
                      )}
                    </td>
                  );
                })}
                <td
                  className={`border-b ${borderColor} px-2 py-1 text-center font-bold ${dark ? "text-[var(--v2-accent)]" : "text-green-700"}`}
                >
                  {allBlank ? "—" : total}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function cellTone(strokes: number, par: number, dark: boolean): string {
  if (!par) return dark ? "bg-[var(--v2-surface-2)] text-white" : "bg-gray-100 text-gray-800";
  const diff = strokes - par;
  if (dark) {
    if (diff <= -2) return "bg-[var(--v2-accent)]/30 text-[var(--v2-accent)]"; // eagle
    if (diff === -1) return "bg-red-500/30 text-red-300"; // birdie
    if (diff === 0) return "bg-[var(--v2-score)]/25 text-[var(--v2-score-soft)]"; // par
    if (diff === 1) return "bg-blue-500/25 text-blue-300"; // bogey
    return "bg-blue-700/40 text-blue-200"; // double+
  }
  if (diff <= -2) return "bg-yellow-100 text-yellow-800";
  if (diff === -1) return "bg-red-100 text-red-700";
  if (diff === 0) return "bg-green-100 text-green-700";
  if (diff === 1) return "bg-blue-50 text-blue-700";
  return "bg-blue-100 text-blue-800";
}
