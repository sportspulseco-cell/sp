import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { createDb, type Database } from "@sportspulse/db";
import { DuplicateSeasonService } from "./duplicate-season.service";

test("70 separate league-season copies resume safely and retain form/pricing references without live records", {
  skip: process.env.PPHL_BULK_COPY_REHEARSAL !== "1", timeout: 15 * 60_000,
}, async () => {
  process.loadEnvFile(".env.local"); const ref = process.env.STAGING_SUPABASE_REF;
  assert.ok(ref && ref !== "nmiiqyfwvbcvtwumtwil");
  const sourceSeasonId = JSON.parse(readFileSync("test-results-season/latest.json", "utf8")).ids.seasonId as string;
  const db = createDb({ url: `postgresql://postgres.${ref}:${encodeURIComponent(process.env.STAGING_DB_PASSWORD!)}@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`, max: 1, idleTimeout: 1 });
  const rollback = new Error("bulk fixtures rolled back"), tag = randomUUID().slice(0, 8);
  const started = Date.now();
  await assert.rejects(db.transaction(async tx => {
    let service = new DuplicateSeasonService(tx as unknown as Database);
    const inputs = Array.from({ length: 70 }, (_, i) => ({ sourceSeasonId, name: `Spring QA ${tag} ${i + 1}`,
      newLeagueName: `QA Hockey Copy ${tag} ${i + 1}`, startDate: "2098-01-01", requestId: randomUUID() }));
    await assert.rejects(service.execute(inputs[0]!, process.env.STAGING_PLAYER_ID!), /Season/);
    const ids: string[] = [], leagues = new Set<string>();
    for (const [i, input] of inputs.entries()) {
      if (i === 12) {
        // Recreate the worker and replay the prior phase as a resumed plan.
        service = new DuplicateSeasonService(tx as unknown as Database);
        for (let n = 0; n < i; n++) {
          const replay = await service.execute({ ...inputs[n]!, requestId: randomUUID() }, process.env.STAGING_SUPERADMIN_ID!);
          assert.equal(replay.seasonId, ids[n]); assert.equal(replay.replayed, true);
        }
      }
      const copy = await service.execute(input, process.env.STAGING_SUPERADMIN_ID!);
      assert.equal(copy.replayed, false); ids.push(copy.seasonId); leagues.add(copy.leagueId);
      if ((i + 1) % 10 === 0) console.log(`Bulk QA ${i + 1}/70 copied; ${Math.round((Date.now() - started) / 1000)}s elapsed`);
    }
    assert.equal(leagues.size, 70); assert.equal(new Set(ids).size, 70);
    const copies = sql.join(ids.map(id => sql`${id}::uuid`), sql`, `);
    const [counts] = await tx.execute(sql`select
      (select count(*)::int from seasons where id in (${copies}) and status='draft') seasons,
      (select count(*)::int from registrations where season_id in (${copies})) registrations,
      (select count(*)::int from team_memberships where season_id in (${copies})) memberships,
      (select count(*)::int from games where season_id in (${copies})) games,
      (select count(*)::int from registration_forms where season_id in (${copies})) forms,
      (select count(*)::int from pricing_tiers where season_id in (${copies})) tiers`);
    const [source] = await tx.execute(sql`select
      (select count(*)::int from registration_forms where season_id=${sourceSeasonId}::uuid) forms,
      (select count(*)::int from pricing_tiers where season_id=${sourceSeasonId}::uuid) tiers`);
    assert.equal(counts!.seasons, 70); assert.equal(counts!.registrations, 0); assert.equal(counts!.memberships, 0); assert.equal(counts!.games, 0);
    assert.equal(counts!.forms, Number(source!.forms) * 70); assert.equal(counts!.tiers, Number(source!.tiers) * 70);
    const liveForms = await tx.execute(sql`select id from registration_forms where season_id in (${copies}) and active_version_id is not null`);
    assert.equal(liveForms.length, 0, "Copied forms must await explicit review and publication");
    const broken = await tx.execute(sql`select f.id from registration_forms f left join registration_form_versions v on v.id=f.active_version_id
      where f.season_id in (${copies}) and f.active_version_id is not null and (v.id is null or v.form_id<>f.id)
      union all select p.id from pricing_tiers p join pricing_tier_divisions l on l.pricing_tier_id=p.id join divisions d on d.id=l.division_id
      where p.season_id in (${copies}) and d.season_id<>p.season_id`);
    assert.equal(broken.length, 0);
    console.log(`Bulk QA all 70 complete; ${Math.round((Date.now() - started) / 1000)}s; rollback follows`);
    throw rollback;
  }), error => error === rollback);
  const [left] = await db.execute(sql`select count(*)::int n from leagues where name like ${`QA Hockey Copy ${tag} %`}`);
  assert.equal(left!.n, 0);
});
