import { test } from "node:test";
import assert from "node:assert/strict";
import { centsToAmountInput, formatMoney } from "./money";

test("cents print as dollars with two decimals", () => {
  assert.equal(formatMoney(5900), "$59.00");
  assert.equal(formatMoney(1), "$0.01");
  assert.equal(formatMoney(0), "$0.00");
  assert.equal(formatMoney(123456789), "$1,234,567.89");
});

test("negative amounts keep their sign", () => {
  assert.equal(formatMoney(-2500), "-$25.00");
});

test("sign option marks credits and debits but never zero", () => {
  assert.equal(formatMoney(500, "USD", { sign: true }), "+$5.00");
  assert.equal(formatMoney(-500, "USD", { sign: true }), "-$5.00");
  assert.equal(formatMoney(0, "USD", { sign: true }), "$0.00");
});

test("other currencies use their own symbol", () => {
  assert.equal(formatMoney(5900, "CAD"), "CA$59.00");
  assert.equal(formatMoney(5900, ""), "$59.00");
});

test("an unknown currency code still shows the amount", () => {
  assert.equal(formatMoney(5900, "NOTACODE"), "59.00 NOTACODE");
});

test("amount inputs start as a plain number that parses back", () => {
  assert.equal(centsToAmountInput(5900), "59.00");
  assert.equal(centsToAmountInput(1), "0.01");
  assert.equal(centsToAmountInput(0), "0.00");
  assert.equal(centsToAmountInput(123456789), "1234567.89");
  assert.equal(centsToAmountInput(Number.NaN), "");
});
