import "server-only";
import { cookies } from "next/headers";

export const UI_MODE_COOKIE = "ui_mode";
export type UiMode = "classic" | "v2";

export async function getUiMode(): Promise<UiMode> {
  const jar = await cookies();
  return jar.get(UI_MODE_COOKIE)?.value === "v2" ? "v2" : "classic";
}
