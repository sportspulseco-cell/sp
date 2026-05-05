import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { and, asc, desc, eq } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { DRIZZLE } from "../../../shared/database/database.tokens";

/**
 * Registration v2 service — thin direct-Drizzle handlers for the new
 * pricing_tiers / email_templates / team_invites / free_agent_pool_entries
 * tables. Higher-level workflow orchestration (the public registration
 * funnel, payment, async admin review) lives elsewhere.
 */
@Injectable()
export class RegistrationV2Service {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  // ================= PRICING TIERS =================

  async listPricingTiers(opts: { seasonId?: string }) {
    const where = opts.seasonId
      ? eq(schema.pricingTiers.seasonId, opts.seasonId)
      : undefined;
    return this.db
      .select()
      .from(schema.pricingTiers)
      .where(where)
      .orderBy(asc(schema.pricingTiers.fullPriceCents));
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
    const [row] = await this.db
      .insert(schema.pricingTiers)
      .values(input)
      .returning();
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

  async resolveTeamInviteByToken(token: string) {
    const [row] = await this.db
      .select()
      .from(schema.teamInvites)
      .where(eq(schema.teamInvites.token, token))
      .limit(1);
    if (!row) throw new NotFoundException("Invite not found");
    return row;
  }

  // ================= FREE AGENT POOL =================

  async listFreeAgentPool(opts: { seasonId?: string }) {
    const where = opts.seasonId
      ? and(
          eq(schema.freeAgentPoolEntries.seasonId, opts.seasonId),
          eq(schema.freeAgentPoolEntries.status, "active")
        )
      : eq(schema.freeAgentPoolEntries.status, "active");
    return this.db
      .select()
      .from(schema.freeAgentPoolEntries)
      .where(where)
      .orderBy(desc(schema.freeAgentPoolEntries.createdAt));
  }

  async upsertFreeAgentEntry(
    input: typeof schema.freeAgentPoolEntries.$inferInsert
  ) {
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
    return row;
  }

  async placeFreeAgent(
    id: string,
    input: { teamId: string }
  ) {
    const [row] = await this.db
      .update(schema.freeAgentPoolEntries)
      .set({
        status: "placed",
        placedTeamId: input.teamId,
        placedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(schema.freeAgentPoolEntries.id, id))
      .returning();
    if (!row) throw new NotFoundException(`Free agent entry ${id} not found`);
    return row;
  }

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
}
