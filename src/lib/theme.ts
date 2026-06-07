import "server-only";
import { cookies } from "next/headers";

export const THEME_COOKIE = "v2_theme";
export type Theme = "dark" | "light";

/**
 * v2 colour theme, read from the `v2_theme` cookie and applied as
 * `<html data-theme="…">` in the root layout. Dark is the default so existing
 * users see no change. Only affects v2 (classic pages don't read v2 tokens).
 */
export async function getTheme(): Promise<Theme> {
  const jar = await cookies();
  return jar.get(THEME_COOKIE)?.value === "light" ? "light" : "dark";
}
