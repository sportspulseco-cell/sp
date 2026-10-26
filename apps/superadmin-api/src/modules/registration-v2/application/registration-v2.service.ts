import { normalizeSkillLevel, requestedJerseyNumber } from "@sportspulse/kernel";
import { ConflictException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { playerWebUrl } from "../../../shared/app-urls";
import { SupabaseAdminService } from "../../../shared/auth/supabase-admin.service";
import { NotificationService } from "../../communications/application/notification.service";
import { buildTeamInvitePayload } from "../../communications/domain/templates/team-invite-payload";
import { withTierDivisions } from "./season-tiers";
import { RosterEntryService } from "./roster-entry.service";
import { FreeAgentOffersService } from "./free-agent-offers.service";
import { teamNameVerdict } from "./team-names";
import { pickJerseyNumber } from "./jersey-numbers";

/**
 * Registration v2 service — thin direct-Drizzle handlers for the new
 * pricing_tiers / email_templates / team_invites / free_agent_pool_entries
 * tables. Higher-level workflow orchestration (the public registration
 * funnel, payment, async admin review) lives elsewhere.
 */
@Injectable()
export class RegistrationV2Service {
  private readonly log = new Logger(RegistrationV2Service.name);
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly supabase: SupabaseAdminService,
    private readonly notify: NotificationService,
    private readonly config: ConfigService,
    private readonly rosterEntry: RosterEntryService,
    private readonly faOffers: FreeAgentOffersService
  ) {}

  // ================= PRICING TIERS =================

  async listPricingTiers(opts: { seasonId?: string }) {
    const where = opts.seasonId
      ? eq(schema.pricingTiers.seasonId, opts.seasonId)
      : undefined;
    const tiers = await this.db
      .select()
      .from(schema.pricingTiers)
      .where(where)
      .orderBy(asc(schema.pricingTiers.fullPriceCents));
    // Each with the divisions it is offered to (REG-18).
    return withTierDivisions(this.db, tiers);
  }

  async getPricingTier(id: string) {
    const [row] = await this.db
      .select()
      .from(schema.pricingTiers)
      .where(eq(schema.pricingTiers.id, id))
      .limit(1);
    if (!row) throw new NotFoundException(`Pricing tier ${id} not found`);
    return row;
  }

  async createPricingTier(input: typeof schema.pricingTiers.$inferInsert) {
    // A tier added while registration is already open must be live at
    // once: tiers were created inactive and only switched on when the
    // season opened, so a later tier stayed hidden (REG-19). Draft and
    // finished seasons keep new tiers off; the admin's toggle still wins.
    let isActive = input.isActive;
    if (isActive === undefined && input.seasonId) {
      const [season] = await this.db
        .select({ status: schema.seasons.status })
        .from(schema.seasons)
        .where(eq(schema.seasons.id, input.seasonId))
        .limit(1);
      isActive = !!season && !["draft", "completed", "archived", "cancelled"].includes(season.status);
    }
    const [row] = await this.db
      .insert(schema.pricingTiers)
      .values({ ...input, isActive: isActive ?? false })
      .returning();
    this.log.log(`pricing tier created id=${row?.id} season=${input.seasonId} active=${row?.isActive}`);
    return row;
  }

  async updatePricingTier(
    id: string,
    patch: Partial<typeof schema.pricingTiers.$inferInsert>
  ) {
    await this.getPricingTier(id);
    const [row] = await this.db
      .update(schema.pricingTiers)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.pricingTiers.id, id))
      .returning();
    return row;
  }

  async deletePricingTier(id: string) {
    await this.getPricingTier(id);
    await this.db
      .delete(schema.pricingTiers)
      .where(eq(schema.pricingTiers.id, id));
    return { id };
  }

  // ================= EMAIL TEMPLATES =================

  async listEmailTemplates(opts: { seasonId?: string }) {
    const where = opts.seasonId
      ? eq(schema.emailTemplates.seasonId, opts.seasonId)
      : undefined;
    return this.db
      .select()
      .from(schema.emailTemplates)
      .where(where)
      .orderBy(asc(schema.emailTemplates.eventType));
  }

  async getEmailTemplate(id: string) {
    const [row] = await this.db
      .select()
      .from(schema.emailTemplates)
      .where(eq(schema.emailTemplates.id, id))
      .limit(1);
    if (!row) throw new NotFoundException(`Email template ${id} not found`);
    return row;
  }

  async createEmailTemplate(
    input: typeof schema.emailTemplates.$inferInsert
  ) {
    const [row] = await this.db
      .insert(schema.emailTemplates)
      .values(input)
      .returning();
    return row;
  }

  async updateEmailTemplate(
    id: string,
    patch: Partial<typeof schema.emailTemplates.$inferInsert>
  ) {
    await this.getEmailTemplate(id);
    const [row] = await this.db
      .update(schema.emailTemplates)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.emailTemplates.id, id))
      .returning();
    return row;
  }

  async deleteEmailTemplate(id: string) {
    await this.getEmailTemplate(id);
    await this.db
      .delete(schema.emailTemplates)
      .where(eq(schema.emailTemplates.id, id));
    return { id };
  }

  // ================= TEAM INVITES =================

  async getTeamInvite(id: string) {
    const [row] = await this.db
      .select()
      .from(schema.teamInvites)
      .where(eq(schema.teamInvites.id, id))
      .limit(1);
    return row ?? null;
  }

  async listTeamInvites(opts: {
    teamId?: string;
    seasonId?: string;
    status?: string;
  }) {
    const cs = [];
    if (opts.teamId) cs.push(eq(schema.teamInvites.teamId, opts.teamId));
    if (opts.seasonId) cs.push(eq(schema.teamInvites.seasonId, opts.seasonId));
    if (opts.status) cs.push(eq(schema.teamInvites.status, opts.status));
    return this.db
      .select()
      .from(schema.teamInvites)
      .where(cs.length ? and(...cs) : undefined)
      .orderBy(desc(schema.teamInvites.createdAt));
  }

  async createTeamInvite(input: {
    teamId: string;
    seasonId: string;
    issuedByUserId?: string;
    inviteeEmail?: string;
    kind?: "personal" | "generic";
  }) {
    const kind = input.kind ?? (input.inviteeEmail ? "personal" : "generic");
    const token = randomBytes(32).toString("base64url");
    // Personal invites expire in 7 days; generic links last 365 days (admin
    // can revoke any time; controller may further constrain to roster_lock).
    const expiresAt =
      kind === "personal"
        ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    const [row] = await this.db
      .insert(schema.teamInvites)
      .values({
        teamId: input.teamId,
        seasonId: input.seasonId,
        issuedByUserId: input.issuedByUserId ?? null,
        inviteeEmail: input.inviteeEmail ?? null,
        kind,
        token,
        expiresAt,
        lastSentAt: kind === "personal" ? new Date() : null
      })
      .returning();

    // Personal invites email the player the same TEAM_INVITE_NEW body the
    // roster "Invite by email" and the wizard send (full player-app link,
    // team, season, expiry). Generic team URLs have no recipient; the
    // captain shares the link shown on screen. Fire-and-forget: the
    // notification service logs and never throws.
    if (row && kind === "personal" && input.inviteeEmail) {
      const [ctx] = await this.db
        .select({
          teamName: schema.teams.name,
          orgId: schema.teams.orgId,
          seasonName: schema.seasons.name
        })
        .from(schema.teams)
        .innerJoin(schema.seasons, eq(schema.seasons.id, input.seasonId))
        .where(eq(schema.teams.id, input.teamId))
        .limit(1);
      if (ctx) {
        void this.notify.queue({
          orgId: ctx.orgId,
          templateCode: "TEAM_INVITE_NEW",
          idempotencyKey: `invite-${row.id}`,
          recipientEmail: input.inviteeEmail.toLowerCase(),
          payload: buildTeamInvitePayload({
            teamName: ctx.teamName,
            seasonName: ctx.seasonName,
            seasonId: input.seasonId,
            token,
            expiresAt,
            playerWebUrl: playerWebUrl(this.config)
          })
        });
      } else {
        this.log.warn(
          `team invite ${row.id}: no team/season context for email (team=${input.teamId} season=${input.seasonId})`
        );
      }
    }
    return row;
  }

  async revokeTeamInvite(id: string) {
    const [row] = await this.db
      .update(schema.teamInvites)
      .set({ status: "revoked", revokedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.teamInvites.id, id))
      .returning();
    if (!row) throw new NotFoundException(`Invite ${id} not found`);
    return row;
  }

  /**
   * Public, anonymous lookup for the invite landing page. Returns only
   * what the page shows; the raw row (issuer id, invitee email, token
   * metadata) stayed readable even after revoke (CAP-14).
   */
  async resolveTeamInviteByToken(token: string) {
    const [row] = await this.db
      .select({
        status: schema.teamInvites.status,
        kind: schema.teamInvites.kind,
        expiresAt: schema.teamInvites.expiresAt,
        source: sql<string | null>`${schema.teamInvites.metadata}->>'source'`,
        teamName: schema.teams.name,
        seasonName: schema.seasons.name
      })
      .from(schema.teamInvites)
      .innerJoin(schema.teams, eq(schema.teams.id, schema.teamInvites.teamId))
      .innerJoin(schema.seasons, eq(schema.seasons.id, schema.teamInvites.seasonId))
      .where(eq(schema.teamInvites.token, token))
      .limit(1);
    if (!row) throw new NotFoundException("Invite not found");
    const expired = !!row.expiresAt && row.expiresAt < new Date();
    // `extended` is a reminded invite with a new expiry: still open.
    const open = row.status === "pending" || row.status === "extended";
    return {
      teamName: row.teamName,
      seasonName: row.seasonName,
      kind: row.kind,
      /** free_agent_offer: a team's offer from the free-agent pool (CAP-9). */
      offerKind: row.source === "free_agent_pool" ? "free_agent_offer" : "team_invite",
      status: open ? (expired ? "expired" : "pending") : row.status
    };
  }

  // ================= FREE AGENT POOL =================

  /**
   * List active free-agent pool entries.
   *
   * - `seasonId`  — direct filter on the pool's season.
   * - `forTeamId` — captain helper. Resolves the team's currently-active
   *   division entry (status in applied/accepted/confirmed) to its
   *   division → season and lists that season's pool. Empty when the
   *   team isn't placed yet.
   *
   * Rows are enriched with the player's displayName + email + DOB by
   * joining persons → profiles. The captain UI needs these to render a
   * usable picker (BUG-058 close — pool-only ids weren't actionable).
   */
  async listFreeAgentPool(opts: {
    seasonId?: string;
    forTeamId?: string;
    /**
     * Admin console (CAP-10): only entries whose season is in this subquery
     * (shared/auth/visibility visibleSeasonIds). Null = unrestricted.
     */
    visibleSeasons?: SQL | null;
    /** Pool status to list; default active. */
    status?: "active" | "placed" | "withdrawn" | "all";
    /** Only these players' entries (a player's own entries, CAP-17). */
    playerPersonIds?: string[];
  }) {
    if (opts.playerPersonIds && opts.playerPersonIds.length === 0) return [];
    // Captain view: every season the team is live in. The old lookup took
    // the team's newest division entry of any status, so a rejected or
    // withdrawn application elsewhere hid the current season's free agents
    // (CAP-7, PPHL change list #6).
    let seasonIds: string[] | null = opts.seasonId ? [opts.seasonId] : null;
    if (!seasonIds && opts.forTeamId) {
      const entries = await this.db
        .selectDistinct({ seasonId: schema.divisions.seasonId })
        .from(schema.divisionTeamEntries)
        .innerJoin(
          schema.divisions,
          eq(schema.divisions.id, schema.divisionTeamEntries.divisionId)
        )
        .where(
          and(
            eq(schema.divisionTeamEntries.teamId, opts.forTeamId),
            sql`${schema.divisionTeamEntries.entryStatus} NOT IN ('rejected','withdrawn','disqualified','moved')`
          )
        );
      seasonIds = entries.map((e) => e.seasonId);
      // A team not yet entered in any season (new team, or set up before
      // its division application) still recruits: show free agents from
      // its organisation's active seasons. Returning nothing here hid every
      // free agent from such captains (PPHL, 24 Oct 2026: "October Test
      // Team" had no entry, its player's pool row sat in "October 2026").
      if (seasonIds.length === 0) {
        const orgSeasons = await this.db
          .select({ id: schema.seasons.id })
          .from(schema.seasons)
          .innerJoin(schema.teams, eq(schema.teams.orgId, schema.seasons.orgId))
          .where(
            and(
              eq(schema.teams.id, opts.forTeamId),
              sql`${schema.seasons.status} NOT IN ('completed','archived')`,
              sql`${schema.seasons.deletedAt} IS NULL`
            )
          );
        seasonIds = orgSeasons.map((s) => s.id);
      }
      if (seasonIds.length === 0) return [];
    }

    const status = opts.status ?? "active";
    const where = and(
      seasonIds ? inArray(schema.freeAgentPoolEntries.seasonId, seasonIds) : undefined,
      status === "all" ? undefined : eq(schema.freeAgentPoolEntries.status, status),
      opts.visibleSeasons
        ? sql`${schema.freeAgentPoolEntries.seasonId} in ${opts.visibleSeasons}`
        : undefined,
      opts.playerPersonIds
        ? inArray(schema.freeAgentPoolEntries.playerPersonId, opts.playerPersonIds)
        : undefined
    );

    const rows = await this.db
      .select({
        id: schema.freeAgentPoolEntries.id,
        playerPersonId: schema.freeAgentPoolEntries.playerPersonId,
        seasonId: schema.freeAgentPoolEntries.seasonId,
        positions: schema.freeAgentPoolEntries.positions,
        availability: schema.freeAgentPoolEntries.availability,
        levelPrimary: schema.freeAgentPoolEntries.levelPrimary,
        levelFlexibility: schema.freeAgentPoolEntries.levelFlexibility,
        note: schema.freeAgentPoolEntries.note,
        noShowRate: schema.freeAgentPoolEntries.noShowRate,
        status: schema.freeAgentPoolEntries.status,
        placedTeamId: schema.freeAgentPoolEntries.placedTeamId,
        placedAt: schema.freeAgentPoolEntries.placedAt,
        metadata: schema.freeAgentPoolEntries.metadata,
        createdAt: schema.freeAgentPoolEntries.createdAt,
        updatedAt: schema.freeAgentPoolEntries.updatedAt,
        playerFirstName: schema.persons.legalFirstName,
        playerLastName: schema.persons.legalLastName,
        playerPreferred: schema.persons.preferredName,
        playerDob: schema.persons.dobDate,
        playerEmail: schema.profiles.email,
        seasonName: schema.seasons.name
      })
      .from(schema.freeAgentPoolEntries)
      .leftJoin(schema.seasons, eq(schema.seasons.id, schema.freeAgentPoolEntries.seasonId))
      .leftJoin(
        schema.persons,
        eq(schema.persons.id, schema.freeAgentPoolEntries.playerPersonId)
      )
      .leftJoin(
        schema.profiles,
        eq(schema.profiles.id, schema.persons.userId)
      )
      .where(where)
      .orderBy(desc(schema.freeAgentPoolEntries.createdAt));

    return rows.map((r) => ({
      id: r.id,
      playerPersonId: r.playerPersonId,
      seasonId: r.seasonId,
      seasonName: r.seasonName ?? null,
      positions: r.positions,
      availability: r.availability as Record<string, unknown>,
      levelPrimary: r.levelPrimary,
      levelFlexibility: r.levelFlexibility,
      note: r.note,
      noShowRate: r.noShowRate,
      status: r.status as "active" | "placed" | "withdrawn",
      placedTeamId: r.placedTeamId,
      placedAt: r.placedAt ? r.placedAt.toISOString() : null,
      metadata: r.metadata as Record<string, unknown>,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      playerName:
        (r.playerPreferred && r.playerPreferred.trim()) ||
        [r.playerFirstName, r.playerLastName].filter(Boolean).join(" ").trim() ||
        null,
      playerEmail: r.playerEmail ?? null,
      playerDob: r.playerDob ?? null
    }));
  }

  async upsertFreeAgentEntry(
    raw: typeof schema.freeAgentPoolEntries.$inferInsert
  ) {
    // Store A–D only (REG-21); older C1 / C2 / C3 codes are mapped.
    const input = {
      ...raw,
      levelPrimary: normalizeSkillLevel(raw.levelPrimary) ?? raw.levelPrimary,
      levelFlexibility: raw.levelFlexibility
        ? [...new Set(raw.levelFlexibility.map((l) => normalizeSkillLevel(l) ?? l))]
        : raw.levelFlexibility
    };
    // ON CONFLICT (player_person_id, season_id) DO UPDATE — uses the unique
    // index from the migration to keep one entry per player/season.
    const [row] = await this.db
      .insert(schema.freeAgentPoolEntries)
      .values(input)
      .onConflictDoUpdate({
        target: [
          schema.freeAgentPoolEntries.playerPersonId,
          schema.freeAgentPoolEntries.seasonId
        ],
        set: {
          positions: input.positions,
          availability: input.availability,
          levelPrimary: input.levelPrimary,
          levelFlexibility: input.levelFlexibility,
          note: input.note,
          status: "active",
          placedTeamId: null,
          placedAt: null,
          updatedAt: new Date()
        }
      })
      .returning();
    // FR-3.4.7: captains of teams this player fits hear about them, once per team.
    if (row?.status === "active") await this.faOffers.pitchToCaptains(row.id);
    return row;
  }

  // Direct placement (placeFreeAgent) was removed (CAP-9): it put a free
  // agent on a roster without asking them. Offers go through
  // FreeAgentOffersService; the player accepts on player-web.

  // ================= SEASON ROLLOVER (placeholder) =================

  /**
   * Spec §3.1.1 — copy pricing tiers, email templates, division
   * assignments, form questions, etc. into a new draft season.
   * Placeholder: copies pricing tiers and email templates only.
   * Full rollover (waivers, form questions, roster rules) lands in Wave 2.
   */
  async rolloverSeason(input: { sourceSeasonId: string; targetSeasonId: string }) {
    const tiers = await this.db
      .select()
      .from(schema.pricingTiers)
      .where(eq(schema.pricingTiers.seasonId, input.sourceSeasonId));

    const templates = await this.db
      .select()
      .from(schema.emailTemplates)
      .where(eq(schema.emailTemplates.seasonId, input.sourceSeasonId));

    let copiedTiers = 0;
    let copiedTemplates = 0;
    if (tiers.length > 0) {
      await this.db.insert(schema.pricingTiers).values(
        tiers.map((t) => ({
          ...t,
          id: undefined as unknown as string,
          seasonId: input.targetSeasonId,
          usageCount: 0,
          createdAt: undefined as unknown as Date,
          updatedAt: undefined as unknown as Date
        }))
      );
      copiedTiers = tiers.length;
    }
    if (templates.length > 0) {
      await this.db.insert(schema.emailTemplates).values(
        templates.map((t) => ({
          ...t,
          id: undefined as unknown as string,
          seasonId: input.targetSeasonId,
          createdAt: undefined as unknown as Date,
          updatedAt: undefined as unknown as Date
        }))
      );
      copiedTemplates = templates.length;
    }
    return {
      sourceSeasonId: input.sourceSeasonId,
      targetSeasonId: input.targetSeasonId,
      copiedPricingTiers: copiedTiers,
      copiedEmailTemplates: copiedTemplates
    };
  }

  // ================= REGISTRATION SIDE-EFFECTS =================

  /**
   * Grant the `player` role to a registrant. Called at funnel
   * submission (so the player can sign into the player app while their
   * registration is pending) and again at approval (idempotent).
   *
   * Scope follows the repo owner's directive (2026-05-25): scope by
   * division when known, otherwise org. Never team — free-agents are
   * not bound to a team until a captain claims them.
   *
   * The active set of role codes is mirrored into Supabase JWT
   * `app_metadata.role_codes` so per-app middleware can role-gate
   * without an API roundtrip. The player app's middleware accepts
   * `player` or `free_agent`; either is enough for sign-in.
   */
  async ensurePlayerRoleForRegistration(input: {
    userId: string;
    divisionId: string | null;
    orgId: string;
  }): Promise<void> {
    const [playerRole] = await this.db
      .select({ id: schema.roles.id })
      .from(schema.roles)
      .where(eq(schema.roles.code, "player"))
      .limit(1);
    if (!playerRole) {
      this.log.warn(
        "ensurePlayerRoleForRegistration: no `player` role in DB; skipping"
      );
      return;
    }

    const scopeType = input.divisionId ? "division" : "org";
    const scopeId = input.divisionId ?? input.orgId;

    // Idempotency — skip when an active assignment with this exact
    // (user, role, scope) already exists. Avoids piling up duplicate
    // rows on re-submission / re-approval.
    const [existing] = await this.db
      .select({ id: schema.userRoleAssignments.id })
      .from(schema.userRoleAssignments)
      .where(
        and(
          eq(schema.userRoleAssignments.userId, input.userId),
          eq(schema.userRoleAssignments.roleId, playerRole.id),
          eq(schema.userRoleAssignments.scopeType, scopeType),
          eq(schema.userRoleAssignments.scopeId, scopeId),
          isNull(schema.userRoleAssignments.revokedAt)
        )
      )
      .limit(1);
    if (!existing) {
      await this.db.insert(schema.userRoleAssignments).values({
        userId: input.userId,
        roleId: playerRole.id,
        scopeType,
        scopeId,
        effectiveFrom: new Date(),
        metadata: { source: "registration_funnel" }
      });
    }

    // Mirror full active role-code set into JWT app_metadata. Pull the
    // codes after the insert so the new `player` row is included.
    try {
      const rows = await this.db
        .select({ code: schema.roles.code })
        .from(schema.userRoleAssignments)
        .innerJoin(
          schema.roles,
          eq(schema.userRoleAssignments.roleId, schema.roles.id)
        )
        .where(
          and(
            eq(schema.userRoleAssignments.userId, input.userId),
            isNull(schema.userRoleAssignments.revokedAt)
          )
        );
      const codes = Array.from(new Set(rows.map((r) => r.code)));
      await this.supabase.setRoleCodes(input.userId, codes);
    } catch (e) {
      // Mirror is an optimisation — assignments are the truth. Log but
      // don't fail registration if Supabase metadata sync stumbles.
      this.log.warn(
        `setRoleCodes failed for ${input.userId}: ${(e as Error).message}`
      );
    }
  }

  /**
   * Create the captain's team on approval of a team-registration
   * submission. Idempotent — if `registrations.team_id` is already set
   * we trust it as the prior result and skip.
   *
   * Steps:
   *   1. insert teams row (org_id from season, name from
   *      metadata.team.name, captain_user_id = submitter)
   *   2. division_team_entries row to bind the team to its division
   *   3. captain role assignment @ team scope
   *   4. team_memberships row for the captain themselves (they play too)
   *   5. write the new team_id back onto registrations.team_id so this
   *      stays idempotent
   */
  /**
   * A returning team (same name, same captain): enter it in the new
   * division, make sure the captain role and the captain's roster spot for
   * this season exist, and stamp the team on the registration. Each step
   * skips what is already there, so a repeated approval adds nothing.
   */
  private async reenterReturningTeam(input: {
    registrationId: string;
    submitterUserId: string;
    captainPersonId: string;
    seasonId: string;
    divisionId: string | null;
    teamId: string;
  }): Promise<{ teamId: string; created: boolean }> {
    const { teamId } = input;
    if (input.divisionId) {
      const [entry] = await this.db
        .select({ id: schema.divisionTeamEntries.id })
        .from(schema.divisionTeamEntries)
        .where(
          and(
            eq(schema.divisionTeamEntries.teamId, teamId),
            eq(schema.divisionTeamEntries.divisionId, input.divisionId),
            isNull(schema.divisionTeamEntries.leftAt)
          )
        )
        .limit(1);
      if (!entry) {
        await this.db.insert(schema.divisionTeamEntries).values({ teamId, divisionId: input.divisionId, entryStatus: "applied" });
      }
    }
    const [captainRole] = await this.db.select({ id: schema.roles.id }).from(schema.roles).where(eq(schema.roles.code, "captain")).limit(1);
    if (captainRole) {
      const [held] = await this.db
        .select({ id: schema.userRoleAssignments.id })
        .from(schema.userRoleAssignments)
        .where(
          and(
            eq(schema.userRoleAssignments.userId, input.submitterUserId),
            eq(schema.userRoleAssignments.roleId, captainRole.id),
            eq(schema.userRoleAssignments.scopeType, "team"),
            eq(schema.userRoleAssignments.scopeId, teamId),
            isNull(schema.userRoleAssignments.revokedAt)
          )
        )
        .limit(1);
      if (!held) {
        await this.db.insert(schema.userRoleAssignments).values({
          userId: input.submitterUserId, roleId: captainRole.id, scopeType: "team", scopeId: teamId,
          effectiveFrom: new Date(), metadata: { source: "team_registration_approval" }
        });
      }
    }
    const [spot] = await this.db
      .select({ id: schema.teamMemberships.id })
      .from(schema.teamMemberships)
      .where(
        and(
          eq(schema.teamMemberships.teamId, teamId),
          eq(schema.teamMemberships.personId, input.captainPersonId),
          eq(schema.teamMemberships.seasonId, input.seasonId),
          eq(schema.teamMemberships.currentStatus, "active")
        )
      )
      .limit(1);
    if (!spot) {
      await this.insertCaptainSpot({
        registrationId: input.registrationId,
        teamId,
        personId: input.captainPersonId,
        seasonId: input.seasonId
      });
    }
    await this.db.update(schema.registrations).set({ teamId, updatedAt: new Date() }).where(eq(schema.registrations.id, input.registrationId));
    this.log.log(`[team registration] registration=${input.registrationId} re-entered returning team=${teamId} division=${input.divisionId ?? "-"}`);
    return { teamId, created: false };
  }

  /**
   * The captain's own roster spot on an approved team registration, with
   * a jersey number (FR-3.4.2): the one asked for on the form when free,
   * else the lowest free from 1 to 99, picked under the team roster lock
   * so a player approved at the same moment cannot take the same number.
   */
  private async insertCaptainSpot(input: {
    registrationId: string;
    teamId: string;
    personId: string;
    seasonId: string;
    requested?: number | null;
    positionCode?: string | null;
  }): Promise<void> {
    let requested = input.requested;
    if (requested === undefined) {
      const [reg] = await this.db
        .select({ metadata: schema.registrations.metadata })
        .from(schema.registrations)
        .where(eq(schema.registrations.id, input.registrationId))
        .limit(1);
      const answers = ((reg?.metadata as Record<string, unknown> | null) ?? {}).answers as Record<string, unknown> | undefined;
      requested = requestedJerseyNumber(answers?.jersey_number);
    }
    const jerseyNumber = await this.db.transaction(async (tx) => {
      const n = await pickJerseyNumber(tx, input.teamId, input.seasonId, requested ?? null);
      await tx.insert(schema.teamMemberships).values({
        teamId: input.teamId,
        personId: input.personId,
        seasonId: input.seasonId,
        membershipType: "primary",
        currentStatus: "active",
        effectiveFrom: new Date(),
        jerseyNumber: n,
        positionCode: input.positionCode ?? null
      });
      return n;
    });
    this.log.log(
      `[team registration] registration=${input.registrationId} captain spot team=${input.teamId} jersey=${jerseyNumber ?? "none"} asked=${requested ?? "-"}`
    );
  }

  async createTeamFromRegistration(input: {
    registrationId: string;
    submitterUserId: string;
    captainPersonId: string;
    orgId: string;
    seasonId: string;
    divisionId: string | null;
    teamName: string;
    teamColor: string | null;
  }): Promise<{ teamId: string; created: boolean }> {
    // Short-circuit if the registration already has a team_id.
    const [reg] = await this.db
      .select({ teamId: schema.registrations.teamId })
      .from(schema.registrations)
      .where(eq(schema.registrations.id, input.registrationId))
      .limit(1);
    if (reg?.teamId) return { teamId: reg.teamId, created: false };

    // A name already used in the org: the same captain's returning team is
    // re-entered; anyone else's name is refused (see team-names.ts).
    const verdict = await teamNameVerdict(this.db, input.orgId, input.teamName, input.submitterUserId);
    if (verdict.kind === "taken") throw new ConflictException(verdict.message);
    if (verdict.kind === "returning") {
      return this.reenterReturningTeam({ ...input, teamId: verdict.teamId });
    }

    // 1. teams row
    const [team] = await this.db
      .insert(schema.teams)
      .values({
        orgId: input.orgId,
        name: input.teamName,
        sportCode: "HOCKEY_ICE",
        captainUserId: input.submitterUserId,
        colors: input.teamColor
          ? { primary: input.teamColor }
          : ({} as Record<string, unknown>),
        status: "active"
      })
      .returning({ id: schema.teams.id });

    // 2. division_team_entries (when a division was picked)
    if (input.divisionId) {
      await this.db.insert(schema.divisionTeamEntries).values({
        teamId: team!.id,
        divisionId: input.divisionId,
        entryStatus: "applied"
      });
    }

    // 3. captain role at team scope
    const [captainRole] = await this.db
      .select({ id: schema.roles.id })
      .from(schema.roles)
      .where(eq(schema.roles.code, "captain"))
      .limit(1);
    if (captainRole) {
      await this.db.insert(schema.userRoleAssignments).values({
        userId: input.submitterUserId,
        roleId: captainRole.id,
        scopeType: "team",
        scopeId: team!.id,
        effectiveFrom: new Date(),
        metadata: { source: "team_registration_approval" }
      });
      // Refresh JWT role_codes
      try {
        const rows = await this.db
          .select({ code: schema.roles.code })
          .from(schema.userRoleAssignments)
          .innerJoin(
            schema.roles,
            eq(schema.userRoleAssignments.roleId, schema.roles.id)
          )
          .where(
            and(
              eq(schema.userRoleAssignments.userId, input.submitterUserId),
              isNull(schema.userRoleAssignments.revokedAt)
            )
          );
        const codes = Array.from(new Set(rows.map((r) => r.code)));
        await this.supabase.setRoleCodes(input.submitterUserId, codes);
      } catch (e) {
        this.log.warn(
          `setRoleCodes after team creation failed: ${(e as Error).message}`
        );
      }
    }

    // 4. captain's own team_memberships row. Pull jersey number +
    // primary position from the registration's metadata.answers so the
    // captain's preferred sweater + position land on the roster row
    // they end up on.
    const [regForAnswers] = await this.db
      .select({ metadata: schema.registrations.metadata })
      .from(schema.registrations)
      .where(eq(schema.registrations.id, input.registrationId))
      .limit(1);
    const ans = ((regForAnswers?.metadata as Record<string, unknown> | null) ?? {}).answers as
      | Record<string, unknown>
      | undefined;
    const positions = Array.isArray(ans?.positions)
      ? (ans!.positions as string[])
      : [];
    await this.insertCaptainSpot({
      registrationId: input.registrationId,
      teamId: team!.id,
      personId: input.captainPersonId,
      seasonId: input.seasonId,
      requested: requestedJerseyNumber(ans?.jersey_number),
      positionCode: positions[0] ?? null
    });

    // 5. stamp team_id on the registration for idempotency.
    await this.db
      .update(schema.registrations)
      .set({ teamId: team!.id, updatedAt: new Date() })
      .where(eq(schema.registrations.id, input.registrationId));

    return { teamId: team!.id, created: true };
  }

  /**
   * Upsert a free-agent pool entry from an approved free-agent
   * registration's metadata.answers. Called from the admin approve
   * handler (single + bulk). Idempotent on (player_person_id,
   * season_id) — re-approval just refreshes the row.
   *
   * Reserved answer keys mirror the column set 1:1 so the funnel can
   * write them as-is and we don't need a translation layer.
   */
  async upsertFreeAgentPoolFromRegistration(input: {
    registrationId: string;
    seasonId: string;
    playerPersonId: string;
    answers: Record<string, unknown>;
  }): Promise<{ id: string | null; created: boolean }> {
    const positions = Array.isArray(input.answers.positions)
      ? (input.answers.positions as string[])
      : [];
    const availability =
      (input.answers.availability as Record<string, boolean> | undefined) ?? {};
    // A–D; older C1 / C2 / C3 answers mapped (REG-21). No level is left
    // unknown, never guessed: an existing entry keeps its level, and a new
    // one waits for the player to set it on the free-agent form.
    const levelPrimary = normalizeSkillLevel(input.answers.skill_level);
    const note =
      typeof input.answers.fa_note === "string"
        ? (input.answers.fa_note as string)
        : null;
    const jerseyRaw = input.answers.jersey_number;
    const jerseyNumber =
      typeof jerseyRaw === "number" && Number.isFinite(jerseyRaw)
        ? Math.max(0, Math.min(99, Math.floor(jerseyRaw)))
        : null;

    const [existing] = await this.db
      .select({
        id: schema.freeAgentPoolEntries.id,
        metadata: schema.freeAgentPoolEntries.metadata
      })
      .from(schema.freeAgentPoolEntries)
      .where(
        and(
          eq(
            schema.freeAgentPoolEntries.playerPersonId,
            input.playerPersonId
          ),
          eq(schema.freeAgentPoolEntries.seasonId, input.seasonId)
        )
      )
      .limit(1);

    if (existing) {
      const mergedMeta = {
        ...((existing.metadata as Record<string, unknown> | null) ?? {}),
        jersey_number: jerseyNumber
      };
      await this.db
        .update(schema.freeAgentPoolEntries)
        .set({
          positions,
          availability,
          ...(levelPrimary ? { levelPrimary } : {}),
          note,
          status: "active",
          metadata: mergedMeta,
          updatedAt: new Date()
        })
        .where(eq(schema.freeAgentPoolEntries.id, existing.id));
      return { id: existing.id, created: false };
    }

    if (!levelPrimary) {
      this.log.warn(
        `free-agent pool: registration ${input.registrationId} has no skill level; no pool entry until the player sets one`
      );
      return { id: null, created: false };
    }
    const [created] = await this.db
      .insert(schema.freeAgentPoolEntries)
      .values({
        playerPersonId: input.playerPersonId,
        seasonId: input.seasonId,
        positions,
        availability,
        levelPrimary,
        note,
        status: "active",
        metadata: {
          sourceRegistrationId: input.registrationId,
          jersey_number: jerseyNumber
        }
      })
      .returning({ id: schema.freeAgentPoolEntries.id });
    return { id: created!.id, created: true };
  }

  /**
   * Hooks that fire after a registration row flips to `approved`:
   * super admin single and bulk approve and the org admin's approve all
   * call this (an org admin's approval used to skip it, so the player got
   * no role, a free agent never reached the pool and a team registration
   * made no team).
   *
   *   1. Grant the `player` role (scope = division when known, else
   *      org). Idempotent. Pushed into Supabase JWT app_metadata so
   *      the player can sign into the player app without a 'wrong
   *      role' bounce.
   *   2. For free-agent submissions: upsert a free_agent_pool_entries
   *      row from metadata.answers (positions / availability /
   *      skill_level / fa_note). Without this the player never
   *      surfaces on the captain's Free agents list.
   *   3. A player registration with a team on it (`team_id`: the
   *      funnel's ?team= link, or an invite, offer or join request
   *      answered while it waited for review) puts the player on that
   *      roster through the shared roster add (lock, cap, move log) and
   *      settles the invite (FR-3.4.1, UC-04).
   *
   * Failures are logged but don't roll back the approval — the
   * approval is the binding decision; side-effects are mechanical
   * sync. A roster placement that could not happen is recorded on the
   * registration (`metadata.rosterPlacement`) and returned.
   */
  async applyApprovalSideEffects(
    row: typeof schema.registrations.$inferSelect,
    actorUserId: string | null = null
  ): Promise<{ roster: { status: string; reason?: string } | null }> {
    const meta = (row.metadata as Record<string, unknown>) ?? {};
    let roster: { status: string; reason?: string } | null = null;
    try {
      if (row.submittedByUserId && row.orgId) {
        await this.ensurePlayerRoleForRegistration({
          userId: row.submittedByUserId,
          divisionId: row.divisionId ?? null,
          orgId: row.orgId
        });
      }
      const submissionType = meta.submissionType as string | undefined;
      if (
        submissionType === "free_agent" &&
        row.seasonId &&
        row.subjectPersonId
      ) {
        const answers =
          (meta.answers as Record<string, unknown> | undefined) ?? {};
        await this.upsertFreeAgentPoolFromRegistration({
          registrationId: row.id,
          seasonId: row.seasonId,
          playerPersonId: row.subjectPersonId,
          answers
        });
      }
      if (
        submissionType === "team" &&
        row.submittedByUserId &&
        row.subjectPersonId &&
        row.seasonId &&
        row.orgId
      ) {
        const team =
          (meta.team as { name?: string; color?: string } | undefined) ?? {};
        const teamName = team.name?.trim();
        if (teamName) {
          try {
            const made = await this.createTeamFromRegistration({
              registrationId: row.id,
              submitterUserId: row.submittedByUserId,
              captainPersonId: row.subjectPersonId,
              orgId: row.orgId,
              seasonId: row.seasonId,
              divisionId: row.divisionId ?? null,
              teamName,
              teamColor: team.color ?? null
            });
            roster = { status: made.created ? "team_created" : "team_reentered" };
          } catch (e) {
            // Never an approved, paid team registration with no team and
            // nobody told: record why on the registration and return it.
            const reason = (e as Error).message;
            roster = { status: "team_not_created", reason };
            await this.db
              .update(schema.registrations)
              .set({
                metadata: sql`${schema.registrations.metadata} || (${JSON.stringify({ teamPlacement: { status: "failed", reason, at: new Date().toISOString() } })}::text)::jsonb`,
                updatedAt: new Date()
              })
              .where(eq(schema.registrations.id, row.id));
            console.error(`[applyApprovalSideEffects] team-registration ${row.id}: team not created: ${reason}`);
          }
        } else {
          console.warn(
            `[applyApprovalSideEffects] team-registration ${row.id} has no metadata.team.name; skipping team creation`
          );
        }
      }
      if (submissionType !== "team") {
        // Read the row again: the team may have been recorded after the
        // caller loaded it (an invite answered while it waited for review).
        const [fresh] = await this.db
          .select()
          .from(schema.registrations)
          .where(eq(schema.registrations.id, row.id))
          .limit(1);
        if (fresh?.teamId) {
          roster = await this.rosterEntry.rosterFromApprovedRegistration(fresh, actorUserId);
          // A free agent who answered an offer before approval joined a
          // team: the pool entry the approval just made is placed.
          if (
            submissionType === "free_agent" &&
            (roster.status === "rostered" || roster.status === "already") &&
            fresh.seasonId &&
            fresh.subjectPersonId
          ) {
            await this.db
              .update(schema.freeAgentPoolEntries)
              .set({ status: "placed", placedTeamId: fresh.teamId, placedAt: new Date(), updatedAt: new Date() })
              .where(
                and(
                  eq(schema.freeAgentPoolEntries.playerPersonId, fresh.subjectPersonId),
                  eq(schema.freeAgentPoolEntries.seasonId, fresh.seasonId)
                )
              );
          }
        }
      }
      // FR-3.4.7: an approved free agent still in the pool (not placed on
      // a team just now) is pitched to captains of teams they fit.
      if (submissionType === "free_agent" && row.seasonId && row.subjectPersonId) {
        const [entry] = await this.db
          .select({ id: schema.freeAgentPoolEntries.id, status: schema.freeAgentPoolEntries.status })
          .from(schema.freeAgentPoolEntries)
          .where(
            and(
              eq(schema.freeAgentPoolEntries.playerPersonId, row.subjectPersonId),
              eq(schema.freeAgentPoolEntries.seasonId, row.seasonId)
            )
          )
          .limit(1);
        if (entry?.status === "active") await this.faOffers.pitchToCaptains(entry.id);
      }
    } catch (e) {
      // Don't fail the approval if a side-effect stumbles — admin can
      // re-trigger via override_flag or re-approve. Log loudly.
      console.error(
        `[RegistrationV2Service.applyApprovalSideEffects] registration=${row.id}`,
        (e as Error).message
      );
    }
    return { roster };
  }
}
