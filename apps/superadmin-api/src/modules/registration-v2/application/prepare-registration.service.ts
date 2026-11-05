import { Inject, Injectable } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { schema, type Database } from "@sportspulse/db";
import { ConflictError, NotFoundError, ValidationError, guidedRegistrationProblem, type GuidedRegistrationSetupInput } from "@sportspulse/kernel";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { accessCan, accessForAnyScope } from "../../../shared/auth/game-access";
import { ADMIN_SCOPE_ROLE_CODES } from "../../../shared/auth/scope";

export interface PrepareRegistrationInput extends GuidedRegistrationSetupInput { seasonId: string }

function canonicalJson(value: unknown): string {
  const normalized = (v: unknown): unknown => Array.isArray(v) ? v.map(normalized) :
    v && typeof v === "object" ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, normalized(x)])) : v;
  return JSON.stringify(normalized(value)) ?? "null";
}

@Injectable()
export class PrepareRegistrationService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}
  async execute(input: PrepareRegistrationInput, userId: string) {
    const problem = guidedRegistrationProblem(input);
    if (problem) throw new ValidationError(problem);
    const definition = input.formDefinition;
    const fingerprint = createHash("sha256").update(canonicalJson({ registrationType: input.registrationType,
      playerPriceCents: input.playerPriceCents, teamFeeEnabled: input.teamFeeEnabled, teamPriceCents: input.teamPriceCents,
      currency: input.currency, requireUsaHockeyId: input.requireUsaHockeyId, definition })).digest("hex");
    return this.db.transaction(async tx => {
      const [season] = await tx.select().from(schema.seasons).where(and(eq(schema.seasons.id, input.seasonId), isNull(schema.seasons.deletedAt))).for("update");
      if (!season) throw new NotFoundError("Season", input.seasonId);
      const connection = tx as unknown as Database;
      const access = await accessForAnyScope(connection, userId, [{ id: "", orgId: season.orgId,
        leagueId: season.leagueId, seasonId: season.id, divisionId: null, homeTeamId: "", awayTeamId: "" }], ADMIN_SCOPE_ROLE_CODES);
      if (!accessCan(access, "season.write") || (input.publish && !accessCan(access, "season.publish")))
        throw new NotFoundError("Season", input.seasonId);
      const metadata = season.metadata as Record<string, unknown>;
      const saved = metadata.guidedRegistrationSetup as { fingerprint: string; formId: string; versionId: string; published: boolean } | undefined;
      if (saved?.fingerprint !== undefined && saved.fingerprint !== fingerprint)
        throw new ConflictError("Registration setup already exists with different details. Open its registration setup page to edit it.");
      if (saved && input.publish && !saved.published) {
        const [form] = await tx.select().from(schema.registrationForms).where(and(eq(schema.registrationForms.id, saved.formId), eq(schema.registrationForms.seasonId, season.id), isNull(schema.registrationForms.deletedAt))).for("update");
        const versions = await tx.select().from(schema.registrationFormVersions).where(eq(schema.registrationFormVersions.formId, saved.formId));
        const prices = await tx.select().from(schema.pricingTiers).where(eq(schema.pricingTiers.seasonId, season.id));
        const config = season.config as Record<string, unknown>;
        if (!form || form.activeVersionId || versions.length !== 1 || versions[0]?.id !== saved.versionId ||
          canonicalJson(versions[0]?.schema) !== canonicalJson(definition) ||
          config.registrationType !== input.registrationType || config.requireUsaHockeyId !== input.requireUsaHockeyId ||
          canonicalJson(config.waivers) !== canonicalJson(definition.waivers) ||
          prices.length !== (input.registrationType === "individual" ? 1 : 2) ||
          prices.filter(p => p.audience === "player").length !== 1 ||
          prices.filter(p => p.audience === "team").length !== (input.registrationType === "individual" ? 0 : 1) ||
          prices.some(p => !p.isActive || p.paymentPlanEnabled || p.currency !== input.currency || p.isFree !== (p.fullPriceCents === 0) ||
            p.fullPriceCents !== (p.audience === "team" ? input.teamPriceCents : input.playerPriceCents)))
          throw new ConflictError("This registration setup changed after the draft was saved. Open its current registration setup page to review and publish it.");
      }
      if (saved && (!input.publish || saved.published)) return {
        seasonId: season.id, leagueId: season.leagueId, formId: saved.formId, published: saved.published,
        seasonStatus: season.status, replayed: true,
      };
      if (season.status !== "draft") throw new ConflictError("This season is already live. Edit its existing registration setup instead.");
      const divisions = await tx.select({ id: schema.divisions.id }).from(schema.divisions)
        .where(and(eq(schema.divisions.seasonId, season.id), isNull(schema.divisions.deletedAt)));
      if (!divisions.length) throw new ValidationError("Add at least one division before preparing registration.");
      if (input.publish && (!season.registrationOpensAt || !season.registrationClosesAt ||
        season.registrationClosesAt <= new Date() || season.registrationClosesAt < season.registrationOpensAt))
        throw new ValidationError("Check the registration opening and closing dates before publishing.");
      const [league] = await tx.select().from(schema.leagues).where(and(eq(schema.leagues.id, season.leagueId), isNull(schema.leagues.deletedAt))).for("update");
      if (!league || league.status === "archived") throw new ConflictError("Use an active or draft league for this season's registration setup.");
      if (input.publish && league.status === "draft" && !accessCan(access, "league.write"))
        throw new ValidationError("Ask a league or organization admin to publish registration while its league is still a draft.");
      const formId = saved?.formId ?? randomUUID(), versionId = saved?.versionId ?? randomUUID();
      if (!saved) {
        const [existingForm] = await tx.select({ id: schema.registrationForms.id }).from(schema.registrationForms)
          .where(and(eq(schema.registrationForms.seasonId, season.id), eq(schema.registrationForms.purpose, "season_registration"), isNull(schema.registrationForms.deletedAt))).limit(1);
        const [existingTier] = await tx.select({ id: schema.pricingTiers.id }).from(schema.pricingTiers).where(eq(schema.pricingTiers.seasonId, season.id)).limit(1);
        if (existingForm || existingTier) throw new ConflictError("This season already has registration forms or prices. Open registration setup to continue editing them.");
        await tx.insert(schema.registrationForms).values({ id: formId, orgId: season.orgId, scope: "season",
          scopeId: season.id, seasonId: season.id, name: `${season.name} registration`, purpose: "season_registration" });
        await tx.insert(schema.registrationFormVersions).values({ id: versionId, formId, versionNumber: 1, schema: definition });
        const tiers = [
          { id: randomUUID(), audience: "player", code: "standard-player", name: "Player registration", price: input.playerPriceCents },
          ...(input.registrationType !== "individual" ? [{ id: randomUUID(), audience: "team", code: "standard-team", name: "Team registration", price: input.teamFeeEnabled ? input.teamPriceCents : 0 }] : []),
        ];
        await tx.insert(schema.pricingTiers).values(tiers.map(t => ({ id: t.id, seasonId: season.id,
          name: t.name, code: t.code, audience: t.audience, currency: input.currency, fullPriceCents: t.price,
          isFree: t.price === 0, paymentPlanEnabled: false, metadata: { setupRequestId: input.requestId } })));
        await tx.insert(schema.pricingTierDivisions).values(tiers.flatMap(t => divisions.map(d => ({ pricingTierId: t.id, divisionId: d.id }))));
      }
      if (input.publish) {
        await tx.update(schema.registrationFormVersions).set({ locked: true, publishedAt: new Date() }).where(and(eq(schema.registrationFormVersions.id, versionId), eq(schema.registrationFormVersions.formId, formId)));
        await tx.update(schema.registrationForms).set({ activeVersionId: versionId, updatedAt: new Date() }).where(eq(schema.registrationForms.id, formId));
        if (league.status === "draft") await tx.update(schema.leagues).set({ status: "active", updatedAt: new Date() }).where(eq(schema.leagues.id, league.id));
      }
      const status = input.publish && season.registrationOpensAt! <= new Date() ? "registration_open" : "draft";
      await tx.update(schema.seasons).set({ status, updatedAt: new Date(), config: {
        ...(season.config as Record<string, unknown>), registrationType: input.registrationType,
        requireUsaHockeyId: input.requireUsaHockeyId, waivers: definition.waivers,
      }, metadata: { ...metadata, guidedRegistrationSetup: {
        fingerprint, formId, versionId, published: input.publish, requestId: input.requestId,
        configuredByUserId: userId, configuredAt: new Date().toISOString(),
      } } }).where(eq(schema.seasons.id, season.id));
      return { seasonId: season.id, leagueId: season.leagueId, formId, published: input.publish, seasonStatus: status, replayed: !!saved };
    });
  }
}
