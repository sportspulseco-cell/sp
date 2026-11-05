"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { loadMeScope } from "./api/server-api";
import { ACTIVE_TEAM_COOKIE } from "./active-team";

/**
 * Server action: remembers the team picked in the switcher. The read
 * write checks membership and the read path ignores out-of-scope cookies.
 * Revalidation makes each page use the selected team on navigation.
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
