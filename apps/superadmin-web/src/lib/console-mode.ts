import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { gameOps } from "@/lib/api/server-api";

/**
 * Who this console is for, resolved once per request.
 *
 * - "admin": platform, org, league, season or division admins. The full
 *   role-filtered console.
 * - "official": a game-day official only (scorekeeper or referee role,
 *   or a crew spot on a game from the Officials panel). They get their
 *   games and the scoresheet, nothing else.
 * - null: no access here (captains and players use their own apps).
 *
 * The admin codes come from the JWT (kept in sync by the IAM handlers);
 * crew spots live only on the server, so an account with no admin code
 * asks the API. The API enforces every read and write either way.
 */
export type ConsoleMode = "admin" | "official";

const ADMIN_CODES = new Set([
  "super_admin",
  "org_admin",
  "league_admin",
  "season_admin",
  "division_admin"
]);

export interface ConsoleViewer {
  userId: string;
  email: string;
  displayName: string | null;
  isSuperAdmin: boolean;
  mode: ConsoleMode | null;
}

export const getConsoleViewer = cache(async (): Promise<ConsoleViewer | null> => {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, display_name, is_super_admin, status")
    .eq("id", user.id)
    .single();

  const roleCodes = ((user.app_metadata as Record<string, unknown> | null)?.role_codes ??
    []) as string[];
  const isSuperAdmin = !!profile?.is_super_admin;
  let mode: ConsoleMode | null = null;
  if (isSuperAdmin || roleCodes.some((c) => ADMIN_CODES.has(c))) {
    mode = "admin";
  } else {
    const officiates = await gameOps
      .officiating()
      .then((r) => r.officiates)
      .catch(() => false);
    if (officiates) mode = "official";
  }
  return {
    userId: user.id,
    email: profile?.email ?? user.email ?? "",
    displayName: profile?.display_name ?? null,
    isSuperAdmin,
    mode
  };
});

/** Paths a game-day official may open: their games and each game's scoresheet. */
export function officialMayOpen(pathname: string): boolean {
  return pathname === "/games" || pathname.startsWith("/games/");
}
