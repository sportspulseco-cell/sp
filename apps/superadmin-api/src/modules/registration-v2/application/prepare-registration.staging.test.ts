import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { createDb, schema, type Database } from "@sportspulse/db";
import { emptyFormDefinition } from "@sportspulse/kernel";
import { PrepareRegistrationService, type PrepareRegistrationInput } from "./prepare-registration.service";
import { RegistrationRequirementsService } from "./registration-requirements.service";
import { SeasonCronController } from "../../league-management/interface/season-cron.controller";
import { eq } from "drizzle-orm";

test("guided setup commits form/pricing/publication together, keeps team registration free by default and is replay-safe", {
  skip: process.env.PPHL_STAGING_DB_TEST !== "1",
}, async () => {
  process.loadEnvFile(".env.local"); const ref = process.env.STAGING_SUPABASE_REF;
  assert.ok(ref && ref !== "nmiiqyfwvbcvtwumtwil");
  const db = createDb({ url: `postgresql://postgres.${ref}:${encodeURIComponent(process.env.STAGING_DB_PASSWORD!)}@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`, max: 1, idleTimeout: 1 });
  const rollback = new Error("guided setup fixtures rolled back");
  await assert.rejects(db.transaction(async tx => {
    const seasonId = randomUUID(), divisionId = randomUUID();
    await tx.execute(sql`insert into seasons select (jsonb_populate_record(null::seasons,to_jsonb(s) || jsonb_build_object(
      'id',${seasonId}::text,'name',${`QA guided ${seasonId}`}::text,'status','draft','config','{}'::jsonb,'metadata','{}'::jsonb,
      'start_date','2027-01-01','end_date','2027-12-31','playoff_start_date',null,'playoff_end_date',null,
      'registration_opens_at',now()-interval '1 minute','registration_closes_at',now()+interval '7 days'
    ))).* from seasons s where id=${process.env.STAGING_SEASON_ID}::uuid`);
    await tx.execute(sql`insert into divisions select (jsonb_populate_record(null::divisions,to_jsonb(d) || jsonb_build_object('id',${divisionId}::text,'season_id',${seasonId}::text))).* from divisions d where season_id=${process.env.STAGING_SEASON_ID}::uuid and deleted_at is null limit 1`);
    const input: PrepareRegistrationInput = { seasonId, requestId: randomUUID(), registrationType: "both",
      playerPriceCents: 18000, teamFeeEnabled: false, teamPriceCents: 0, currency: "USD", requireUsaHockeyId: true,
      formDefinition: emptyFormDefinition(), publish: false, reviewConfirmed: false };
    const service = new PrepareRegistrationService(tx as unknown as Database);
    await assert.rejects(service.execute(input, process.env.STAGING_PLAYER_ID!), /Season/);
    const failedDatabase = { transaction: (work: (connection: unknown) => Promise<unknown>) => tx.transaction(async nested => {
      const failing = new Proxy(nested, { get(target, property) {
        if (property === "insert") return (table: unknown) => {
          if (table === schema.pricingTierDivisions) throw new Error("injected tier-link failure");
          return target.insert(table as typeof schema.registrationForms);
        };
        const value = Reflect.get(target, property); return typeof value === "function" ? value.bind(target) : value;
      } });
      return work(failing);
    }) } as unknown as Database;
    await assert.rejects(new PrepareRegistrationService(failedDatabase).execute(input, process.env.STAGING_SUPERADMIN_ID!), /injected tier-link failure/);
    assert.equal((await tx.execute(sql`select id from registration_forms where season_id=${seasonId}::uuid`)).length, 0);
    assert.equal((await tx.execute(sql`select id from pricing_tiers where season_id=${seasonId}::uuid`)).length, 0);
    const draft = await service.execute(input, process.env.STAGING_SUPERADMIN_ID!);
    const requirements = new RegistrationRequirementsService(tx as unknown as Database);
    const [savedSeason] = await tx.select().from(schema.seasons).where(eq(schema.seasons.id, seasonId));
    assert.equal(requirements.windowOf(savedSeason!).state, "season_closed");
    assert.equal(await requirements.resolveActiveFormVersion(savedSeason!), null);
    await new SeasonCronController(tx as unknown as Database).runAutoTransitions();
    const [afterTimer] = await tx.select().from(schema.seasons).where(eq(schema.seasons.id, seasonId));
    assert.equal(afterTimer?.status, "draft", "An opening date must never publish a saved draft");
    const repeated = await service.execute({ ...input, requestId: randomUUID() }, process.env.STAGING_SUPERADMIN_ID!);
    assert.equal(draft.formId, repeated.formId); assert.equal(repeated.replayed, true);
    const [freeTeam] = await tx.execute(sql`select full_price_cents,is_free from pricing_tiers where season_id=${seasonId}::uuid and audience='team'`);
    assert.equal(freeTeam?.full_price_cents, 0); assert.equal(freeTeam?.is_free, true);
    const published = await service.execute({ ...input, publish: true, reviewConfirmed: true }, process.env.STAGING_SUPERADMIN_ID!);
    assert.equal(published.formId, draft.formId); assert.equal(published.seasonStatus, "registration_open");
    const [form] = await tx.execute(sql`select f.active_version_id,v.locked from registration_forms f join registration_form_versions v on v.id=f.active_version_id where f.id=${draft.formId}::uuid`);
    assert.ok(form?.active_version_id); assert.equal(form?.locked, true);
    const [publishedSeason] = await tx.select().from(schema.seasons).where(eq(schema.seasons.id, seasonId));
    assert.equal(requirements.windowOf(publishedSeason!).state, "open");
    assert.ok(await requirements.resolveActiveFormVersion(publishedSeason!));
    await assert.rejects(service.execute({ ...input, playerPriceCents: 10000 }, process.env.STAGING_SUPERADMIN_ID!), /different details/);
    assert.equal((await tx.execute(sql`select id from registrations where season_id=${seasonId}::uuid`)).length, 0);
    throw rollback;
  }), e => e === rollback);
});
