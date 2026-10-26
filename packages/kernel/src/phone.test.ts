import { test } from "node:test";
import assert from "node:assert/strict";
import { isE164, maskPhoneE164, normalizePhoneE164, smsText, SMS_MAX_CHARS } from "./phone";

function e164(input: string, country?: string): string | null {
  const r = normalizePhoneE164(input, country);
  return r.ok ? r.e164 : null;
}

test("FR-3.10.2: US and Canadian numbers typed the usual ways", () => {
  assert.equal(e164("(415) 555-2671"), "+14155552671");
  assert.equal(e164("415.555.2671"), "+14155552671");
  assert.equal(e164("1 415 555 2671"), "+14155552671");
  assert.equal(e164("+1 (416) 555-0199", "CA"), "+14165550199");
  assert.equal(e164("416-555-0199", "CA"), "+14165550199");
  assert.equal(e164("001 415 555 2671", "US"), "+14155552671");
});

test("FR-3.10.2: other countries with and without the + prefix", () => {
  assert.equal(e164("+44 20 7946 0958"), "+442079460958");
  assert.equal(e164("0044 20 7946 0958"), "+442079460958");
  assert.equal(e164("020 7946 0958", "GB"), "+442079460958");
  assert.equal(e164("07700 900123", "GB"), "+447700900123");
  assert.equal(e164("0412 345 678", "AU"), "+61412345678");
  assert.equal(e164("+33 6 12 34 56 78", "US"), "+33612345678");
});

test("FR-3.10.2: refused numbers say why", () => {
  const cases: Array<[string, string | undefined, string]> = [
    ["", "US", "empty"],
    ["   ", "US", "empty"],
    ["415 555 267", "US", "invalid"], // 9 digits
    ["415 555 26711", "US", "invalid"], // 11 digits, not starting with 1
    ["015 555 2671", "US", "invalid"], // area code starts with 0
    ["415 155 2671", "US", "invalid"], // exchange starts with 1
    ["+1 015 555 2671", "US", "invalid"],
    ["call me", "US", "invalid"],
    ["415-555-2671 x12", "US", "extension"],
    ["415 555 2671 ext. 4", "US", "extension"],
    ["41+5 555 2671", "US", "invalid"],
    ["+0 123 456 789", "US", "invalid"],
    ["+1234567", "US", "invalid"], // 7 digits
    ["+1234567890123456", "US", "invalid"], // 16 digits
    ["0612345678", "BR", "needs_country_code"],
    ["0612345678", null as unknown as string, "needs_country_code"]
  ];
  for (const [input, country, reason] of cases) {
    const r = normalizePhoneE164(input, country);
    assert.equal(r.ok, false, `${input} should be refused`);
    assert.equal(!r.ok && r.reason, reason, `${input}: ${!r.ok ? r.reason : ""}`);
    assert.ok(!r.ok && r.message.length > 0);
  }
});

test("FR-3.10.2: E.164 shape and masking", () => {
  assert.equal(isE164("+14155552671"), true);
  assert.equal(isE164("14155552671"), false);
  assert.equal(isE164("+0123"), false);
  assert.equal(isE164(null), false);
  assert.equal(maskPhoneE164("+14155552671"), "+•••••••2671");
  assert.equal(maskPhoneE164("nope"), "");
});

test("FR-3.17.1: SMS text is the subject and body on one line, cut at a word", () => {
  assert.equal(smsText("Game moved", "Your game vs Hawks is now\n\n7:30 PM at Rink 2."), "Game moved: Your game vs Hawks is now 7:30 PM at Rink 2.");
  assert.equal(smsText(null, "<p>Hello</p>  there"), "Hello there");
  // Body that already starts with the subject is not doubled.
  assert.equal(smsText("Invoice 12", "Invoice 12 is past due."), "Invoice 12 is past due.");
  const long = smsText("Notice", "word ".repeat(200));
  assert.ok(long.length <= SMS_MAX_CHARS, `length ${long.length}`);
  assert.ok(long.endsWith("..."));
  assert.ok(!long.includes("  "));
});
