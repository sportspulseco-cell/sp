import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ValidationError } from "@sportspulse/kernel";
import type { Database } from "@sportspulse/db";
import { CreateDivisionHandler, UpdateDivisionHandler, type CreateDivisionInput } from "./handlers";
import type { Division } from "../../domain/entities/division.entity";
import type { DivisionRepository } from "../../domain/repositories/division.repository";

// PPHL, 4 Nov 2026: a cleared wizard box snapped back to its default while
// typing, so Publish sent periodLengthMin 2017, numberOfPeriods 33 and
// maxRosterSize 2020 and the API stored them. The API now refuses them
// with the sentence the form shows.

/** In-memory repository. No region is sent, so the database is never touched. */
function repo() {
  const rows: Division[] = [];
  const r: DivisionRepository = {
    findById: async (id) => rows.find((d) => d.id.value === id.value) ?? null,
    loadScopeContext: async () => null,
    list: async () => ({ items: [], nextCursor: null }),
    insert: async (d) => {
      rows.push(d);
    },
    save: async () => {},
    delete: async () => {}
  };
  return { r, rows };
}
const db = {} as unknown as Database;
const SEASON = randomUUID();

// The PPHL production row for Waves / Spring 27 / North: every value in range.
const GOOD = {
  numberOfPeriods: 3,
  periodLengthMin: 17,
  clockType: "running",
  overtimeRule: "none",
  bodyChecking: "not_permitted_penalty",
  minStartersToStart: 10,
  maxGuestPlayersPerGame: 4,
  maxRosterSize: 20
};

const create = (r: DivisionRepository, extra: Partial<CreateDivisionInput>) =>
  new CreateDivisionHandler(r, db).execute({ seasonId: SEASON, name: "North", ...extra });

const refused = (message: string) => (e: unknown) => {
  assert.ok(e instanceof ValidationError, `expected ValidationError, got ${String(e)}`);
  assert.equal(e.message, message);
  return true;
};

test("create stores a rule set inside the ranges, a legacy empty one, and none at all", async () => {
  const { r, rows } = repo();
  const dto = await create(r, { maxTeams: 28, ruleSetOverrides: { gameRules: GOOD } });
  assert.equal(dto.maxTeams, 28);
  assert.equal((dto.ruleSetOverrides as { gameRules: typeof GOOD }).gameRules.periodLengthMin, 17);
  await create(r, { ruleSetOverrides: {} });
  await create(r, { ruleSetOverrides: { gameRules: {} } });
  await create(r, {});
  assert.equal(rows.length, 4);
});

test("create refuses the values a snapping field produced, naming the field, and stores nothing", async () => {
  const { r, rows } = repo();
  await assert.rejects(
    create(r, { ruleSetOverrides: { gameRules: { ...GOOD, periodLengthMin: 2017 } } }),
    refused("Period length must be a whole number from 5 to 60 minutes.")
  );
  await assert.rejects(
    create(r, { ruleSetOverrides: { gameRules: { ...GOOD, numberOfPeriods: 33 } } }),
    refused("Number of periods must be a whole number from 1 to 4.")
  );
  await assert.rejects(
    create(r, { ruleSetOverrides: { gameRules: { ...GOOD, maxRosterSize: 2020 } } }),
    refused("Max roster size must be a whole number from 5 to 40.")
  );
  await assert.rejects(
    create(r, { ruleSetOverrides: { gameRules: { ...GOOD, minStartersToStart: 2 } } }),
    refused("Min skaters to start must be a whole number from 3 to 20.")
  );
  await assert.rejects(
    create(r, { ruleSetOverrides: { gameRules: { ...GOOD, maxGuestPlayersPerGame: 50 } } }),
    refused("Max guest players per game must be a whole number from 0 to 10.")
  );
  await assert.rejects(
    create(r, { ruleSetOverrides: { gameRules: { ...GOOD, clockType: "paused" } } }),
    refused("Clock type must be one of: stopped, running.")
  );
  await assert.rejects(create(r, { maxTeams: 2017 }), refused("Max teams must be a whole number from 2 to 64."));
  await assert.rejects(create(r, { maxTeams: 17.5 }), refused("Max teams must be a whole number from 2 to 64."));
  assert.equal(rows.length, 0, "nothing was stored");
});

test("update refuses the same values before touching the row, and saves a fix", async () => {
  const { r, rows } = repo();
  const dto = await create(r, { maxTeams: 10, ruleSetOverrides: { gameRules: GOOD } });
  const upd = new UpdateDivisionHandler(r, db);
  await assert.rejects(
    upd.execute({ id: dto.id, maxTeams: 12, ruleSetOverrides: { gameRules: { ...GOOD, periodLengthMin: 2017 } } }),
    refused("Period length must be a whole number from 5 to 60 minutes.")
  );
  await assert.rejects(upd.execute({ id: dto.id, maxTeams: 100 }), refused("Max teams must be a whole number from 2 to 64."));
  const stored = rows[0]!;
  assert.equal(stored.maxTeams, 10, "a refused command changed nothing, not even the fields that were fine");
  assert.equal((stored.ruleSetOverrides as { gameRules: typeof GOOD }).gameRules.periodLengthMin, 17);

  const fixed = await upd.execute({ id: dto.id, maxTeams: 12, ruleSetOverrides: { gameRules: { ...GOOD, periodLengthMin: 18 } } });
  assert.equal(fixed.maxTeams, 12);
  assert.equal((fixed.ruleSetOverrides as { gameRules: typeof GOOD }).gameRules.periodLengthMin, 18);
  const cleared = await upd.execute({ id: dto.id, maxTeams: null });
  assert.equal(cleared.maxTeams, null, "no cap is still allowed");
});
