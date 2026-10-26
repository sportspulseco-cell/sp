import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compareLicenceToPerson,
  licenceLast4,
  normalizeNameForMatch,
  parseAamva,
  parseAamvaDate,
  type AamvaLicence
} from "./aamva";

const LF = "\n";
const RS = "\x1e";
const CR = "\r";

/** Version 8 US card, laid out as the AAMVA sample (Virginia). */
const US_V8 =
  `@${LF}${RS}${CR}ANSI 636000080002DL00410278ZV03190008DL` +
  [
    "DAQT64235789",
    "DCSSAMPLE",
    "DDEN",
    "DACMICHAEL",
    "DDFN",
    "DADJOHN",
    "DDGN",
    "DCAD",
    "DCBK",
    "DCDPH",
    "DBD06062016",
    "DBB06061986",
    "DBA12102030",
    "DBC1",
    "DAU068 in",
    "DAYBRO",
    "DAG2300 WEST BROAD STREET",
    "DAIRICHMOND",
    "DAJVA",
    "DAK232690000  ",
    "DCF2424244747474786102204",
    "DCGUSA",
    "DDAF",
    "DDB06062008"
  ].join(LF) +
  `${CR}ZVZVA01${CR}`;

/** Ontario card: Canadian dates are CCYYMMDD. */
const ON_V3 =
  `@${LF}${RS}${CR}ANSI 636012030002DL00410195ZO02360014DL` +
  ["DAQS1234-56789-01234", "DCSTREMBLAY", "DACJOSÉE", "DADMARIE", "DBA20290315", "DBB19950315", "DBD20240315", "DAJON", "DCGCAN"].join(LF) +
  CR;

/** Version 1 (AAMVA 2000): full name in DAA, dates CCYYMMDD. */
const FL_V1 =
  `@${LF}${RS}${CR}ANSI 6360100102DL00390188ZF02270011DL` +
  ["DAAJONES,ROBERT,LEE", "DAQJ520-123-80-002-0", "DBB19800102", "DBA20300102", "DAJFL"].join(LF) +
  CR;

/** Version 2: given names packed in DCT. */
const TX_V2 =
  `@${LF}${RS}${CR}ANSI 636015020102DL00410150DL` +
  ["DAQ12345678", "DCSGARCIA", "DCTANA,LUCIA", "DBB07041999", "DBA07042027", "DAJTX"].join(LF) +
  CR;

function ok(text: string): AamvaLicence {
  const r = parseAamva(text);
  assert.equal(r.ok, true, r.ok ? "" : r.message);
  return (r as { ok: true; licence: AamvaLicence }).licence;
}

test("UC-29: version 8 US licence fields", () => {
  const l = ok(US_V8);
  assert.equal(l.version, 8);
  assert.equal(l.iin, "636000");
  assert.equal(l.documentType, "DL");
  assert.equal(l.licenceNumber, "T64235789");
  assert.equal(l.lastName, "SAMPLE");
  assert.equal(l.firstName, "MICHAEL");
  assert.equal(l.middleName, "JOHN");
  assert.equal(l.dateOfBirth, "1986-06-06");
  assert.equal(l.expiresOn, "2030-12-10");
  assert.equal(l.issuedOn, "2016-06-06");
  assert.equal(l.jurisdiction, "VA");
  assert.equal(l.country, "USA");
  assert.equal(l.lastNameTruncated, false);
});

test("UC-29: Canadian card reads CCYYMMDD and keeps accents for display", () => {
  const l = ok(ON_V3);
  assert.equal(l.licenceNumber, "S12345678901234");
  assert.equal(l.firstName, "JOSÉE");
  assert.equal(l.dateOfBirth, "1995-03-15");
  assert.equal(l.expiresOn, "2029-03-15");
  assert.equal(l.jurisdiction, "ON");
  assert.equal(l.country, "CAN");
});

test("UC-29: version 1 full name in DAA", () => {
  const l = ok(FL_V1);
  assert.equal(l.version, 1);
  assert.equal(l.lastName, "JONES");
  assert.equal(l.firstName, "ROBERT");
  assert.equal(l.middleName, "LEE");
  assert.equal(l.licenceNumber, "J520123800020");
  assert.equal(l.dateOfBirth, "1980-01-02");
});

test("UC-29: version 2 given names in DCT", () => {
  const l = ok(TX_V2);
  assert.equal(l.firstName, "ANA");
  assert.equal(l.middleName, "LUCIA");
  assert.equal(l.dateOfBirth, "1999-07-04");
});

test("UC-29: decoders that mangle the separators still parse", () => {
  // All separators turned into CR, header control characters dropped.
  const mangled = US_V8.replace(/[\n\x1e]/g, "\r");
  const l = ok(mangled);
  assert.equal(l.licenceNumber, "T64235789");
  assert.equal(l.dateOfBirth, "1986-06-06");
  // No header at all: elements alone are enough.
  const bare = ["DLDAQX1", "DCSDOE", "DACJANE", "DBB01022001", "DBA01022031"].join("\n");
  const b = ok(bare);
  assert.equal(b.version, null);
  assert.equal(b.lastName, "DOE");
});

test("UC-29: not a licence barcode", () => {
  assert.deepEqual(parseAamva(""), { ok: false, reason: "empty", message: "The barcode was empty." });
  const r = parseAamva("https://example.com/coupon/123");
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.reason, "not_aamva");
  const noNumber = parseAamva("DLDCSDOE\nDACJANE\nDBB01022001");
  assert.equal(!noNumber.ok && noNumber.reason, "no_licence_number");
});

test("UC-29: date order and impossible dates", () => {
  assert.equal(parseAamvaDate("02292024", "mdy"), "2024-02-29");
  assert.equal(parseAamvaDate("02292023", "mdy"), null);
  assert.equal(parseAamvaDate("20240229", "mdy"), "2024-02-29"); // falls back to CCYYMMDD
  assert.equal(parseAamvaDate("01021990", "ymd"), "1990-01-02"); // falls back to MMDDCCYY
  assert.equal(parseAamvaDate("1990-01-02"), null);
  assert.equal(parseAamvaDate(""), null);
  assert.equal(parseAamvaDate("13132020", "mdy"), null);
});

const PERSON = { legalFirstName: "Michael", legalLastName: "Sample", preferredName: "Mike", dobDate: "1986-06-06" };

test("UC-29: match when name and DOB agree and the card is valid", () => {
  const l = ok(US_V8);
  assert.deepEqual(compareLicenceToPerson(l, PERSON, "2026-10-26"), { result: "match", mismatchedFields: [] });
  // Expires today: still valid today.
  assert.deepEqual(compareLicenceToPerson(l, PERSON, "2030-12-10").result, "match");
});

test("UC-29: each mismatch is named", () => {
  const l = ok(US_V8);
  assert.deepEqual(
    compareLicenceToPerson(l, { ...PERSON, dobDate: "1986-06-07" }, "2026-10-26").mismatchedFields,
    ["date_of_birth"]
  );
  assert.deepEqual(
    compareLicenceToPerson(l, { ...PERSON, legalLastName: "Simple" }, "2026-10-26").mismatchedFields,
    ["last_name"]
  );
  assert.deepEqual(
    compareLicenceToPerson(l, { ...PERSON, legalFirstName: "Michelle", preferredName: null }, "2026-10-26").mismatchedFields,
    ["first_name"]
  );
  assert.deepEqual(compareLicenceToPerson(l, PERSON, "2030-12-11").mismatchedFields, ["expired"]);
  assert.deepEqual(
    compareLicenceToPerson(l, { ...PERSON, dobDate: null }, "2026-10-26"),
    { result: "mismatch", mismatchedFields: ["date_of_birth_not_on_file"] }
  );
});

test("UC-29: names compare without accents, case, hyphens or apostrophes", () => {
  assert.equal(normalizeNameForMatch("Josée"), "JOSEE");
  assert.equal(normalizeNameForMatch("O'Brien-Smith"), "OBRIENSMITH");
  const l = ok(ON_V3);
  const r = compareLicenceToPerson(
    l,
    { legalFirstName: "Josee Marie", legalLastName: "Tremblay", dobDate: "1995-03-15" },
    "2026-10-26"
  );
  assert.deepEqual(r, { result: "match", mismatchedFields: [] });
});

test("UC-29: a truncated name on the card matches the start of the full name", () => {
  const text = ["DLDAQZ9", "DCSWOLFESCHLEGELST", "DDET", "DACHUBERT", "DBB01011970", "DBA01012030"].join("\n");
  const l = ok(text);
  assert.equal(l.lastNameTruncated, true);
  const r = compareLicenceToPerson(
    l,
    { legalFirstName: "Hubert", legalLastName: "Wolfeschlegelsteinhausenbergerdorff", dobDate: "1970-01-01" },
    "2026-10-26"
  );
  assert.equal(r.result, "match");
  // Without the truncation flag the same prefix is a mismatch.
  const plain = ok(text.replace("DDET", "DDEN"));
  assert.deepEqual(
    compareLicenceToPerson(
      plain,
      { legalFirstName: "Hubert", legalLastName: "Wolfeschlegelsteinhausenbergerdorff", dobDate: "1970-01-01" },
      "2026-10-26"
    ).mismatchedFields,
    ["last_name"]
  );
});

test("UC-29: last 4 is all that is kept in clear", () => {
  assert.equal(licenceLast4("T64235789"), "5789");
  assert.equal(licenceLast4("s1234-56789-01234"), "1234");
  assert.equal(licenceLast4("X1"), "X1");
});
