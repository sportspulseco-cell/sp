import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ConflictError } from "@sportspulse/kernel";
import { CreateLeagueHandler, UpdateLeagueHandler } from "./handlers";
import type { League } from "../../domain/entities/league.entity";
import type { LeagueRepository } from "../../domain/repositories/league.repository";

const ORG = randomUUID();

/** In-memory repository with the same clash rule as the Drizzle one. */
function repo(rows: Array<{ id: string; name: string; status: string; deleted?: boolean }>) {
  const saved: League[] = [];
  const r: LeagueRepository = {
    findById: async (id) => saved.find((l) => l.id.value === id.value) ?? null,
    list: async () => ({ items: [], nextCursor: null }),
    insert: async (l) => { saved.push(l); },
    save: async () => {},
    delete: async () => {},
    findNameClash: async (orgId, name, excludeId) =>
      orgId !== ORG
        ? null
        : rows.find((x) => x.id !== excludeId && x.status !== "archived" && !x.deleted && x.name.trim().toLowerCase() === name.trim().toLowerCase())?.id ?? null
  };
  return { r, saved };
}

const create = (r: LeagueRepository, name: string, orgId = ORG) =>
  new CreateLeagueHandler(r).execute({ orgId, sportCode: "HOCKEY_ICE", name });

test("create refuses a name a live league in the org already has, ignoring case and spaces", async () => {
  const { r } = repo([{ id: randomUUID(), name: "Test League Oct", status: "draft" }]);
  await assert.rejects(create(r, "  test league oct "), (e: unknown) => e instanceof ConflictError && /already exists/.test((e as Error).message));
});

test("an archived or deleted league frees its name; another org is unaffected", async () => {
  const { r } = repo([
    { id: randomUUID(), name: "Winter", status: "archived" },
    { id: randomUUID(), name: "Spring", status: "active", deleted: true }
  ]);
  assert.equal((await create(r, "Winter")).name, "Winter");
  assert.equal((await create(r, "Spring")).name, "Spring");
  const { r: r2 } = repo([{ id: randomUUID(), name: "Summer", status: "active" }]);
  assert.equal((await create(r2, "Summer", randomUUID())).name, "Summer");
});

test("rename: keeping the current name saves; taking another live league's name is refused", async () => {
  const other = randomUUID();
  const { r, saved } = repo([{ id: other, name: "Fall", status: "active" }]);
  const mine = await create(r, "Summer");
  const upd = new UpdateLeagueHandler(r);
  assert.equal((await upd.execute({ id: mine.id, name: "summer", format: "regular" })).name, "summer");
  await assert.rejects(upd.execute({ id: mine.id, name: "FALL" }), ConflictError);
  assert.equal(saved.length, 1);
});
