import type { createApi } from "@sportspulse/api-client";

/**
 * "What should the captain do about team registration right now?"
 *
 * One pure rule, derived from two server reads the console already
 * makes (open seasons the team can still apply to, and every
 * application the team has filed). The home page card, the top banner
 * and the sidebar CTA all render from this one value, so they appear
 * and disappear together.
 *
 * Before this, the banner and sidebar only rendered when the dashboard
 * mode was `registration_open`, which never happens for a team that is
 * in season: a captain whose team was confirmed in the current season
 * had no way into "Register the team" for the next one (CAP-6), and a
 * denial in another season was invisible (CAP-5).
 *
 * Priority when several apply: an approved application whose roster +
 * dues set-up has not run > a pending application > a denial in a
 * season that is still open > an open season with no application.
 */

type Api = ReturnType<typeof createApi>;
export type CaptainApplication = Awaited<
  ReturnType<Api["captain"]["myApplications"]>
>["items"][number];
export type CaptainOpenSeason = Awaited<
  ReturnType<Api["captain"]["openSeasons"]>
>["items"][number];

type SeasonRef = {
  seasonId: string;
  seasonName: string;
  leagueName: string;
  registrationClosesAt: string | null;
};

export type RegistrationCall =
  | (SeasonRef & {
      kind: "setup";
      entryId: string;
      divisionName: string;
    })
  | (SeasonRef & {
      kind: "pending";
      entryId: string;
      divisionName: string;
    })
  | (SeasonRef & {
      kind: "denied";
      entryId: string;
      divisionName: string;
      reason: string | null;
      rejectedAt: string | null;
    })
  | (SeasonRef & {
      kind: "open";
      /** How many seasons are open for this team, including this one. */
      openCount: number;
    });

export function rejectionOf(app: CaptainApplication): {
  reason: string | null;
  rejectedAt: string | null;
} {
  const meta = (app.metadata ?? {}) as {
    rejectionReason?: unknown;
    rejectedAt?: unknown;
  };
  return {
    reason:
      typeof meta.rejectionReason === "string" && meta.rejectionReason.trim()
        ? meta.rejectionReason
        : null,
    rejectedAt: typeof meta.rejectedAt === "string" ? meta.rejectedAt : null
  };
}

/**
 * The newest application per season. A denied application that the
 * captain followed with a new one in the same season is superseded.
 */
export function latestApplicationPerSeason(
  applications: readonly CaptainApplication[]
): CaptainApplication[] {
  const sorted = [...applications].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0
  );
  const seen = new Set<string>();
  const out: CaptainApplication[] = [];
  for (const app of sorted) {
    if (seen.has(app.seasonId)) continue;
    seen.add(app.seasonId);
    out.push(app);
  }
  return out;
}

const SETUP_STATUSES = new Set(["applied", "accepted"]);

export function deriveRegistrationCall(input: {
  openSeasons: readonly CaptainOpenSeason[];
  applications: readonly CaptainApplication[];
}): RegistrationCall | null {
  const latest = latestApplicationPerSeason(input.applications);
  const openIds = new Set(input.openSeasons.map((s) => s.seasonId));

  const setup = latest.find(
    (a) => SETUP_STATUSES.has(a.entryStatus) && !a.invoiceId
  );
  if (setup) {
    return {
      kind: "setup",
      entryId: setup.id,
      divisionName: setup.divisionName,
      seasonId: setup.seasonId,
      seasonName: setup.seasonName,
      leagueName: setup.leagueName,
      registrationClosesAt: setup.registrationClosesAt
    };
  }

  const pending = latest.find((a) => a.entryStatus === "pending_approval");
  if (pending) {
    return {
      kind: "pending",
      entryId: pending.id,
      divisionName: pending.divisionName,
      seasonId: pending.seasonId,
      seasonName: pending.seasonName,
      leagueName: pending.leagueName,
      registrationClosesAt: pending.registrationClosesAt
    };
  }

  const denied = latest.find(
    (a) => a.entryStatus === "rejected" && openIds.has(a.seasonId)
  );
  if (denied) {
    const { reason, rejectedAt } = rejectionOf(denied);
    return {
      kind: "denied",
      entryId: denied.id,
      divisionName: denied.divisionName,
      reason,
      rejectedAt,
      seasonId: denied.seasonId,
      seasonName: denied.seasonName,
      leagueName: denied.leagueName,
      registrationClosesAt: denied.registrationClosesAt
    };
  }

  if (input.openSeasons.length > 0) {
    // Closing soonest first: that is the one the captain must act on.
    const [first] = [...input.openSeasons].sort((a, b) => {
      const ac = a.registrationClosesAt ?? "9999";
      const bc = b.registrationClosesAt ?? "9999";
      return ac < bc ? -1 : ac > bc ? 1 : 0;
    });
    return {
      kind: "open",
      openCount: input.openSeasons.length,
      seasonId: first!.seasonId,
      seasonName: first!.seasonName,
      leagueName: first!.leagueName,
      registrationClosesAt: first!.registrationClosesAt
    };
  }

  return null;
}

/** Where the call-to-action sends the captain. */
export function registrationCallHref(call: RegistrationCall): string {
  return call.kind === "setup"
    ? `/captain/register/setup/${call.entryId}`
    : "/captain/register";
}

/** Short button copy; the long form names the season. */
export function registrationCallLabel(
  call: RegistrationCall,
  form: "short" | "long" = "short"
): string {
  switch (call.kind) {
    case "setup":
      return "Set up roster & dues";
    case "pending":
      return "View application";
    case "denied":
    case "open":
      return form === "long"
        ? `Register the team for ${call.seasonName}`
        : "Register the team";
  }
}
