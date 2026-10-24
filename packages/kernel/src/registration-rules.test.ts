import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultWaiversConfig } from "./forms";
import {
  registrationWindowMessage,
  registrationWindowState
} from "./registration-window";
import {
  resolveRegistrationWaivers,
  signatureNameMatches
} from "./registration-waivers";

const season = {
  status: "registration_open",
  registrationOpensAt: "2026-10-23T04:00:00Z",
  registrationClosesAt: "2026-11-14T04:59:59Z",
  timezone: "America/New_York",
  name: "Fall"
};

test("REG-16: a registration before the window opens is refused", () => {
  // The bug: registration 4c00e164 created 00:35Z for a window opening 04:00Z.
  assert.equal(registrationWindowState(season, new Date("2026-10-23T00:35:00Z")), "not_yet_open");
  assert.equal(
    registrationWindowMessage(season, new Date("2026-10-23T00:35:00Z")),
    "Registration for Fall opens on Oct 23, 2026, 12:00 AM EDT."
  );
});

test("window is inclusive at both ends and closed one second later", () => {
  assert.equal(registrationWindowState(season, new Date("2026-10-23T04:00:00Z")), "open");
  assert.equal(registrationWindowState(season, new Date("2026-11-14T04:59:59Z")), "open");
  assert.equal(registrationWindowState(season, new Date("2026-11-14T05:00:00Z")), "closed");
  assert.equal(
    registrationWindowMessage(season, new Date("2026-12-01T00:00:00Z")),
    "Registration for Fall closed on Nov 13, 2026, 11:59 PM EST."
  );
});

test("season status: in_progress keeps late registration, playoffs never", () => {
  const mid = new Date("2026-10-30T00:00:00Z");
  assert.equal(registrationWindowState({ ...season, status: "in_progress" }, mid), "open");
  assert.equal(registrationWindowState({ ...season, status: "playoffs" }, mid), "season_closed");
  assert.equal(registrationWindowState({ ...season, status: "archived" }, mid), "season_closed");
});

test("missing or unreadable window dates take no registrations", () => {
  const now = new Date("2026-10-30T00:00:00Z");
  assert.equal(registrationWindowState({ ...season, registrationOpensAt: null }, now), "not_scheduled");
  assert.equal(registrationWindowState({ ...season, registrationClosesAt: "garbage" }, now), "not_scheduled");
});

test("an invalid stored time zone falls back to UTC", () => {
  assert.equal(
    registrationWindowMessage({ ...season, timezone: "Not/AZone" }, new Date("2026-10-23T00:35:00Z")),
    "Registration for Fall opens on Oct 23, 2026, 4:00 AM UTC."
  );
});

test("REG-5: waiver ON with empty season text still requires a waiver (form text)", () => {
  const r = resolveRegistrationWaivers(
    { requireLiabilityWaiver: true, liabilityWaiverContent: "", requireCodeOfConduct: true, codeOfConductContent: "" },
    defaultWaiversConfig()
  );
  assert.deepEqual(r.required.map((x) => [x.key, x.contentSource]), [
    ["liability_waiver", "form"],
    ["code_of_conduct", "form"]
  ]);
});

test("REG-5: no text anywhere falls back to the SportsPulse default, never to nothing", () => {
  const r = resolveRegistrationWaivers({ requireLiabilityWaiver: true }, null);
  assert.equal(r.required[0]!.key, "liability_waiver");
  assert.equal(r.required[0]!.contentSource, "default");
  assert.ok(r.required[0]!.content.length > 20);
});

test("season toggles win over the form; form decides when the season is silent", () => {
  assert.deepEqual(
    resolveRegistrationWaivers({ requireLiabilityWaiver: false, requireCodeOfConduct: false }, defaultWaiversConfig()).required,
    []
  );
  const formOnly = resolveRegistrationWaivers({}, {
    ...defaultWaiversConfig(),
    liabilityWaiver: { enabled: false, content: "x" }
  });
  assert.deepEqual(formOnly.required.map((x) => x.key), ["code_of_conduct"]);
});

test("season text wins and is trimmed; nothing configured uses kernel defaults", () => {
  const r = resolveRegistrationWaivers({ liabilityWaiverContent: "  Season text  " }, defaultWaiversConfig());
  assert.equal(r.required[0]!.content, "Season text");
  assert.equal(r.required[0]!.contentSource, "season");
  const none = resolveRegistrationWaivers(null, null);
  assert.deepEqual(none.required.map((x) => x.key), ["liability_waiver", "code_of_conduct"]);
  assert.equal(none.photoRelease.enabled, false);
});

test("typed signature must match the signer's name", () => {
  assert.equal(signatureNameMatches(" ada   lovelace ", "Ada Lovelace"), true);
  assert.equal(signatureNameMatches("Someone Else", "Ada Lovelace"), false);
  assert.equal(signatureNameMatches("", ""), false);
});
