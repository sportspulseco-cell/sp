import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeCursor, encodeCursor } from "./keyset";

test("a cursor carries the sort value and the id", () => {
  const c = encodeCursor(new Date("2026-10-25T09:08:02.203Z"), "8d0c6f6e-0000-4000-8000-000000000001");
  assert.equal(c, "2026-10-25T09:08:02.203Z|8d0c6f6e-0000-4000-8000-000000000001");
  assert.deepEqual(decodeCursor(c), {
    value: "2026-10-25T09:08:02.203Z",
    id: "8d0c6f6e-0000-4000-8000-000000000001"
  });
});

test("a text sort value round-trips", () => {
  assert.deepEqual(decodeCursor(encodeCursor("org_admin", "abc")), { value: "org_admin", id: "abc" });
});

test("a plain id from before keyset paging is not decoded", () => {
  assert.equal(decodeCursor("8d0c6f6e-0000-4000-8000-000000000001"), null);
});
