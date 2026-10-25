import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STORE_GENERATE_ITEMS,
  STORE_ORDER_TRANSITIONS,
  readStoreProductOptions,
  storeLineLabel,
  validateStoreOrderLine
} from "./team-store";

const jersey = STORE_GENERATE_ITEMS[0]!;
const cap = STORE_GENERATE_ITEMS[2]!;

test("a product with no options is a plain one-size item", () => {
  assert.deepEqual(readStoreProductOptions({}), {
    kind: "custom",
    sizes: [],
    personalization: { name: false, number: false }
  });
  assert.deepEqual(readStoreProductOptions(null).sizes, []);
});

test("stored options are read back and bad values dropped", () => {
  const o = readStoreProductOptions({ kind: "jersey", sizes: ["M", "", 3, "L"], personalization: { name: true, number: "yes" } });
  assert.equal(o.kind, "jersey");
  assert.deepEqual(o.sizes, ["M", "L"]);
  assert.deepEqual(o.personalization, { name: true, number: false });
});

test("a jersey line needs a size it offers and a number 0 to 99", () => {
  assert.equal(validateStoreOrderLine(jersey, { quantity: 1, size: "L", personalName: "Smith", personalNumber: 12 }), null);
  assert.match(validateStoreOrderLine(jersey, { quantity: 1 }) ?? "", /Pick a size/);
  assert.match(validateStoreOrderLine(jersey, { quantity: 1, size: "XS" }) ?? "", /not offered/);
  assert.match(validateStoreOrderLine(jersey, { quantity: 1, size: "L", personalNumber: 100 }) ?? "", /0 to 99/);
  assert.match(validateStoreOrderLine(jersey, { quantity: 1, size: "L", personalNumber: 1.5 }) ?? "", /0 to 99/);
  assert.equal(validateStoreOrderLine(jersey, { quantity: 1, size: "L", personalNumber: 0 }), null);
});

test("quantity is 1 to 10", () => {
  assert.match(validateStoreOrderLine(cap, { quantity: 0 }) ?? "", /1 to 10/);
  assert.match(validateStoreOrderLine(cap, { quantity: 11 }) ?? "", /1 to 10/);
  assert.equal(validateStoreOrderLine(cap, { quantity: 10 }), null);
});

test("a cap takes no size, name or number", () => {
  assert.match(validateStoreOrderLine(cap, { quantity: 1, size: "M" }) ?? "", /one size/);
  assert.match(validateStoreOrderLine(cap, { quantity: 1, personalName: "Lee" }) ?? "", /no name/);
  assert.match(validateStoreOrderLine(cap, { quantity: 1, personalNumber: 7 }) ?? "", /no number/);
});

test("the name on the back is short and plain", () => {
  assert.match(validateStoreOrderLine(jersey, { quantity: 1, size: "M", personalName: "A".repeat(17) }) ?? "", /at most 16/);
  assert.match(validateStoreOrderLine(jersey, { quantity: 1, size: "M", personalName: "<script>" }) ?? "", /letters/);
  assert.equal(validateStoreOrderLine(jersey, { quantity: 1, size: "M", personalName: "O'Neil-Brü" }), null);
});

test("line labels read like the back of the shirt", () => {
  assert.equal(storeLineLabel("Home jersey", { quantity: 1, size: "L", personalName: "smith", personalNumber: 12 }), "Home jersey · L · #12 SMITH");
  assert.equal(storeLineLabel("Cap", { quantity: 2 }), "2 x Cap");
});

test("orders cannot leave shipped or cancelled", () => {
  assert.deepEqual(STORE_ORDER_TRANSITIONS.shipped, []);
  assert.deepEqual(STORE_ORDER_TRANSITIONS.cancelled, []);
  assert.ok(STORE_ORDER_TRANSITIONS.placed.includes("cancelled"));
});
