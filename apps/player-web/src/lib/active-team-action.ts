"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { loadMeScope } from "./api/server-api";
import { ACTIVE_TEAM_COOKIE } from "./active-team";

/**
 * Server action: remembers the team picked in the switcher. The read
 * path (`getActiveTeamId`) ignores a team outside the user's scope, so
 * nothing is checked here. `revalidatePath('/')` makes every page read
 * the new team on the next navigation.
 */
export async function setActiveTeamId(teamId: string): Promise<void> {
  const scope = await loadMeScope();
  if (!scope.teamIds.includes(teamId)) throw new Error("That team is not available to your account.");
  const store = await cookies();
  store.set(ACTIVE_TEAM_COOKIE, teamId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365
  });
  revalidatePath("/");
}
