import { test } from "node:test";
import assert from "node:assert/strict";
import { sql } from "drizzle-orm";
import { assertSchedulePublishable, lockSchedulePublication } from "./publication-safety";

test("a conflict blocks publication and a failed safety read never becomes permission to publish", async () => {
  await assert.rejects(assertSchedulePublishable({ execute: async () => [{ id: "clash" }] }, sql`true`), /Resolve overlapping/);
  await assert.rejects(assertSchedulePublishable({ execute: async () => { throw new Error("database unavailable"); } }, sql`true`), /unavailable/);
  await assert.rejects(assertSchedulePublishable({ execute: async () => ({}) }, sql`true`), /Could not verify/);
  await assertSchedulePublishable({ execute: async () => [] }, sql`true`);
});

test("publication lock failures cannot be ignored", async () => {
  await assert.rejects(lockSchedulePublication({ execute: async () => { throw new Error("lock timeout"); } }), /lock timeout/);
});
