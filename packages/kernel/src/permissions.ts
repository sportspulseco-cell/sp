/**
 * Canonical permission catalogue.
 *
 * Single source of truth shared between API and UI. Both the NestJS
 * RolesGuard and the superadmin-web role editor read from this file —
 * never hardcode permission strings elsewhere.
 *
 * String shape:  `<module>.<action>`  e.g. `league.create`, `game.score.write`
 *
 * Wildcards:
 *   "*"           — root wildcard, all permissions everywhere (super_admin)
 *   "<module>.*"  — module wildcard, every action inside that module
 *
 * `expandPermissions(strings)` resolves wildcards into the explicit list
 * — call this in any UI that wants the *effective* count.
 */

export type PermissionString = string;

export interface Permission {
  /** Module the action belongs to. Drives grouping and the wildcard form `<module>.*`. */
  module: string;
  /** The action verb (last segment of the dotted code). */
  action: string;
  /** Full dotted code, e.g. `league.create`. */
  code: PermissionString;
  /** Short, human-friendly label. */
  label: string;
  /** What this permission gates. */
  description: string;
}

export interface PermissionGroup {
  module: string;
  /** UI label for the module group. */
  label: string;
  permissions: Permission[];
}

const G = (
  module: string,
  label: string,
  rows: Array<[string, string, string]>
): PermissionGroup => ({
  module,
  label,
  permissions: rows.map(([action, lbl, desc]) => ({
    module,
    action,
    code: `${module}.${action}`,
    label: lbl,
    description: desc
  }))
});

/**
 * Permission groups, in the order they should render in the UI tree.
 * Keep grouped + ordered — the UI relies on this for stable rendering.
 */
export const PERMISSION_GROUPS: PermissionGroup[] = [
  G("org", "Organizations", [
    ["read", "Read", "View org details and settings."],
    ["write", "Write", "Edit org settings, branding, defaults."],
    ["create", "Create", "Create new orgs (super_admin scope)."],
    ["delete", "Delete", "Soft-delete an org (super_admin scope)."],
    ["admin.assign", "Assign admins", "Grant org_admin to a user."]
  ]),
  G("league", "Leagues", [
    ["read", "Read", "View leagues."],
    ["write", "Write", "Edit league settings."],
    ["create", "Create", "Create new leagues."],
    ["delete", "Delete", "Soft-delete a league."]
  ]),
  G("season", "Seasons", [
    ["read", "Read", "View seasons."],
    ["write", "Write", "Edit season window, registration window, status."],
    ["create", "Create", "Create new seasons."],
    ["publish", "Publish", "Flip a season to live."]
  ]),
  G("division", "Divisions", [
    ["read", "Read", "View divisions."],
    ["write", "Write", "Edit division age range, level, format."],
    ["create", "Create", "Create new divisions."]
  ]),
  G("team", "Teams", [
    ["read", "Read", "View teams."],
    ["write", "Write", "Edit team metadata."],
    ["create", "Create", "Create new teams."],
    ["dissolve", "Dissolve", "Mark a team inactive for a season."]
  ]),
  G("roster", "Rosters", [
    ["read", "Read", "View team memberships."],
    ["write", "Write", "Open / close / move memberships."],
    ["lock", "Lock", "Lock the roster at season cutoff."]
  ]),
  G("lineup", "Lineups", [
    ["read", "Read", "View per-game lineups."],
    ["write", "Write", "Set / edit lineups."]
  ]),
  G("registration", "Registrations", [
    ["read", "Read", "View submissions."],
    ["review", "Review", "Approve / reject / request resubmission."],
    ["override", "Override flags", "Override eligibility flags with justification."],
    ["bulk", "Bulk actions", "Bulk approve / reject / email."]
  ]),
  G("document", "Documents & waivers", [
    ["read", "Read", "View documents."],
    ["sign", "Sign", "Sign waivers / consents on behalf of self or dependant."],
    ["manage", "Manage", "Author / publish new document versions."]
  ]),
  G("game", "Games", [
    ["read", "Read", "View games and schedules."],
    ["create", "Create", "Schedule a new game."],
    ["start", "Start", "Transition a scheduled game to in_play."],
    ["finalize", "Finalize", "Mark a game completed."],
    ["postpone", "Postpone", "Postpone a scheduled game."],
    ["cancel", "Cancel", "Cancel a game."],
    ["forfeit", "Forfeit", "Award a forfeit."]
  ]),
  G("game_event", "Game events", [
    ["read", "Read", "View per-game events."],
    ["write", "Write", "Append / correct events on a game timeline."]
  ]),
  G("score", "Scoring", [
    ["read", "Read", "View live and historical scores."],
    ["write", "Write", "Apply scores while a game is in_play."]
  ]),
  G("suspension", "Suspensions", [
    ["read", "Read", "View active suspensions."],
    ["issue", "Issue", "Issue a suspension from a game event."],
    ["lift", "Lift", "Lift / amend an existing suspension."]
  ]),
  G("stats", "Stats & standings", [
    ["read", "Read", "View standings + leaderboards."],
    ["recompute", "Recompute", "Trigger standings recompute."]
  ]),
  G("finance", "Finance", [
    ["read", "Read", "View invoices and payments."],
    ["invoice.write", "Invoice", "Create / edit invoices."],
    ["payment.record", "Record payment", "Mark offline payments paid."],
    ["refund", "Refund", "Issue refunds."]
  ]),
  G("audit", "Audit", [
    ["read", "Read", "View audit ledger."]
  ]),
  G("report", "Reports", [
    ["read", "Read", "Run CSV exports."]
  ]),
  G("communication", "Communications", [
    ["read", "Read", "View notifications outbox."],
    ["send", "Send", "Send notifications / emails."],
    ["template.write", "Edit templates", "Edit email templates."]
  ]),
  G("import", "Data import", [
    ["read", "Read", "View import jobs."],
    ["run", "Run", "Run bulk CSV imports."]
  ]),
  G("admin", "Platform admin", [
    ["read", "Read", "View platform settings + flags."],
    ["write", "Write", "Edit platform settings + flags."]
  ]),
  G("self", "Self-service", [
    ["read", "Read", "View own profile, registrations, schedule."]
  ]),
  G("dependant", "Family / dependants", [
    ["read", "Read", "View dependant athletes."],
    ["register", "Register", "Register a dependant for a season."]
  ]),
  G("public", "Public read", [
    ["read", "Read", "Read publicly-visible content (schedules, standings)."]
  ])
];

/** Flat array of every defined permission (no wildcards). */
export const ALL_PERMISSIONS: Permission[] = PERMISSION_GROUPS.flatMap(
  (g) => g.permissions
);

/** All permission codes as a flat array. */
export const ALL_PERMISSION_CODES: PermissionString[] = ALL_PERMISSIONS.map(
  (p) => p.code
);

/** Lookup table by full code. */
export const PERMISSION_BY_CODE: Record<PermissionString, Permission> =
  Object.fromEntries(ALL_PERMISSIONS.map((p) => [p.code, p]));

/** All module keys, in the order they appear in PERMISSION_GROUPS. */
export const PERMISSION_MODULES: string[] = PERMISSION_GROUPS.map(
  (g) => g.module
);

/**
 * Resolve a permissions array (which may contain wildcards) into the
 * explicit, deduplicated list of effective permission codes.
 *
 *   expandPermissions(["*"])             // → every code
 *   expandPermissions(["league.*"])      // → every league.* code
 *   expandPermissions(["league.read"])   // → ["league.read"]
 */
export function expandPermissions(
  permissions: readonly PermissionString[]
): PermissionString[] {
  const out = new Set<PermissionString>();
  for (const p of permissions) {
    if (p === "*") {
      for (const code of ALL_PERMISSION_CODES) out.add(code);
      continue;
    }
    if (p.endsWith(".*")) {
      const module = p.slice(0, -2);
      for (const perm of ALL_PERMISSIONS) {
        if (perm.module === module) out.add(perm.code);
      }
      continue;
    }
    out.add(p);
  }
  return Array.from(out);
}

/** Number of effective permissions after wildcard expansion. */
export function countEffectivePermissions(
  permissions: readonly PermissionString[]
): number {
  return expandPermissions(permissions).length;
}

/**
 * Group a permissions array into modules — handy for badge displays.
 * Wildcards are expanded so the grouping reflects effective access.
 */
export function groupPermissionsByModule(
  permissions: readonly PermissionString[]
): Array<{ module: string; label: string; codes: PermissionString[]; isWildcard: boolean }> {
  const expanded = new Set(expandPermissions(permissions));
  return PERMISSION_GROUPS.map((g) => {
    const codes = g.permissions
      .map((p) => p.code)
      .filter((c) => expanded.has(c));
    const allInModule = g.permissions.length === codes.length && codes.length > 0;
    return {
      module: g.module,
      label: g.label,
      codes,
      isWildcard: allInModule
    };
  }).filter((x) => x.codes.length > 0);
}

// ============================================================
// ROLE CATALOGUE
// ============================================================

export type ScopeType =
  | "platform"
  | "org"
  | "league"
  | "season"
  | "division"
  | "team"
  | "game";

export interface RoleDefinition {
  code: string;
  name: string;
  description: string;
  scopeType: ScopeType;
  /** Hierarchy index — lower number = higher rank. super_admin = 0. */
  rank: number;
  /** Default permissions seeded with the role. */
  defaultPermissions: PermissionString[];
}

/**
 * The 13-tier system role hierarchy. Mirrors `packages/db/src/seed/index.ts`
 * and is the canonical reference for role pickers.
 */
export const SYSTEM_ROLES: RoleDefinition[] = [
  {
    code: "super_admin",
    name: "Super Admin",
    description: "Platform god-mode. All capabilities, all scopes.",
    scopeType: "platform",
    rank: 0,
    defaultPermissions: ["*"]
  },
  {
    code: "org_admin",
    name: "Org Admin",
    description: "Full control of one organization.",
    scopeType: "org",
    rank: 1,
    defaultPermissions: ["org.*"]
  },
  {
    code: "league_admin",
    name: "League Admin",
    description: "Manages a single league: divisions, teams, schedules.",
    scopeType: "league",
    rank: 2,
    defaultPermissions: ["league.*", "division.*", "team.read"]
  },
  {
    code: "season_admin",
    name: "Season Admin",
    description: "Manages registrations + roster locks for one season.",
    scopeType: "season",
    rank: 3,
    defaultPermissions: ["season.*", "registration.review"]
  },
  {
    code: "division_admin",
    name: "Division Admin",
    description: "Manages teams + games inside one division.",
    scopeType: "division",
    rank: 4,
    defaultPermissions: ["division.*", "team.read", "game.read"]
  },
  {
    code: "team_admin",
    name: "Team Admin",
    description: "Manages roster + lineups for one team.",
    scopeType: "team",
    rank: 5,
    defaultPermissions: ["team.*", "roster.write"]
  },
  {
    code: "coach",
    name: "Coach",
    description: "Reads roster, manages lineups, requests roster moves.",
    scopeType: "team",
    rank: 6,
    defaultPermissions: ["team.read", "roster.read", "lineup.write"]
  },
  {
    code: "registrar",
    name: "Registrar",
    description: "Reviews registrations + signs documents on behalf.",
    scopeType: "league",
    rank: 7,
    defaultPermissions: ["registration.review", "document.sign"]
  },
  {
    code: "referee",
    name: "Referee",
    description: "Officiates games — append events, issue suspensions.",
    scopeType: "league",
    rank: 8,
    defaultPermissions: ["game.read", "game_event.write", "suspension.issue"]
  },
  {
    code: "scorekeeper",
    name: "Scorekeeper",
    description: "Records scores + events during games.",
    scopeType: "league",
    rank: 9,
    defaultPermissions: ["game.read", "game_event.write", "score.write"]
  },
  {
    code: "player",
    name: "Player",
    description: "Reads own data and schedule.",
    scopeType: "team",
    rank: 10,
    defaultPermissions: ["self.read"]
  },
  {
    code: "parent",
    name: "Parent / Guardian",
    description: "Manages dependants, signs consents.",
    scopeType: "platform",
    rank: 11,
    defaultPermissions: ["dependant.read", "dependant.register", "document.sign"]
  },
  {
    code: "spectator",
    name: "Spectator",
    description: "Public read-only access to schedules + standings.",
    scopeType: "platform",
    rank: 12,
    defaultPermissions: ["public.read"]
  }
];

export const SYSTEM_ROLE_CODES: string[] = SYSTEM_ROLES.map((r) => r.code);

export const SYSTEM_ROLE_BY_CODE: Record<string, RoleDefinition> =
  Object.fromEntries(SYSTEM_ROLES.map((r) => [r.code, r]));

/**
 * Curated suggestions for *custom* role codes — populates the dropdown
 * on the create-role form so admins don't have to type a free-form code.
 * The "custom" escape hatch is provided by the UI separately.
 */
export const CUSTOM_ROLE_CODE_SUGGESTIONS: ReadonlyArray<{
  code: string;
  name: string;
  scopeType: ScopeType;
  defaultPermissions: PermissionString[];
}> = [
  {
    code: "tournament_director",
    name: "Tournament Director",
    scopeType: "league",
    defaultPermissions: ["league.*", "season.*", "game.*"]
  },
  {
    code: "volunteer_coordinator",
    name: "Volunteer Coordinator",
    scopeType: "league",
    defaultPermissions: ["communication.send", "team.read"]
  },
  {
    code: "registrar_assistant",
    name: "Registrar Assistant",
    scopeType: "league",
    defaultPermissions: ["registration.read", "document.read"]
  },
  {
    code: "billing_clerk",
    name: "Billing Clerk",
    scopeType: "org",
    defaultPermissions: ["finance.read", "finance.invoice.write", "finance.payment.record"]
  },
  {
    code: "media_officer",
    name: "Media Officer",
    scopeType: "league",
    defaultPermissions: ["public.read", "communication.send"]
  },
  {
    code: "discipline_officer",
    name: "Discipline Officer",
    scopeType: "league",
    defaultPermissions: ["suspension.read", "suspension.issue", "suspension.lift"]
  },
  {
    code: "stats_keeper",
    name: "Stats Keeper",
    scopeType: "league",
    defaultPermissions: ["stats.read", "stats.recompute", "score.write"]
  },
  {
    code: "compliance_officer",
    name: "Compliance Officer",
    scopeType: "org",
    defaultPermissions: [
      "registration.read",
      "registration.review",
      "document.read",
      "audit.read"
    ]
  }
];
