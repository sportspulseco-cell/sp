import { test } from "node:test";
import assert from "node:assert/strict";
import { safeNextPath } from "./safe-next-path";

test("a same-site path is followed, query kept", () => {
  assert.equal(safeNextPath("/games", "/dashboard"), "/games");
  assert.equal(safeNextPath("/register/abc?team=1", "/"), "/register/abc?team=1");
});

test("missing or blank falls back", () => {
  assert.equal(safeNextPath(null, "/dashboard"), "/dashboard");
  assert.equal(safeNextPath(undefined, "/"), "/");
  assert.equal(safeNextPath("", "/"), "/");
});

test("other sites are never followed", () => {
  for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "evil", "/\u0000x"]) {
    assert.equal(safeNextPath(bad, "/"), "/", bad);
  }
});
