"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ACTIVE_ORG_COOKIE } from "./active-org";

/**
 * Server action: persists the user's selected org as a cookie.
 * Called by `<OrgSwitcher>` when the user picks from the dropdown.
 * `revalidatePath('/')` forces every server-rendered page to
 * re-fetch with the new active org on next nav.
 *
 * Validation lives in the read path (`getActiveOrgId` ignores the
 * cookie when the value isn't in scope) — no need to round-trip
 * the API here.
 */
export async function setActiveOrgId(orgId: string): Promise<void> {
  const store = await cookies();
  store.set(ACTIVE_ORG_COOKIE, orgId, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365
  });
  revalidatePath("/");
}
