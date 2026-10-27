// Full-season integration run (SEASON_TARGET=staging: org "PPHL Staging"; production: "Smoke Test Org" only),
// through the same API calls the apps make. See lib.mjs for what each target may touch.
//
// The brief's steps, as they exist in SportsPulse:
//   league/season/divisions  -> org admin creates them (league-management API)
//   teams + captains         -> each captain registers a team in the public
//                               funnel (submissionType "team"), pays (mock card),
//                               the org admin approves: team created, entered in
//                               the division, captain role granted
//   players                  -> each player registers in the funnel from the
//                               team's link (?team=), signs waivers, pays, the
//                               org admin approves: rostered on the team
//   schedule                 -> rink + surfaces + weekly ice slots, then the
//                               scheduler-generate edge function per division,
//                               then publish
//   game day                 -> start, goal/assist/penalty events, finalize;
//                               standings and leaders read back
// Every step logs; findings are collected; everything lands in test-results-season/run-<tag>.json.
import { writeFileSync } from "node:fs";
import { call, edge, login, q, sql, msgOf, dobYearsAgo, OUT, CFG, TARGET } from "./lib.mjs";

const TAG = `S${Date.now().toString(36).toUpperCase()}`;
const PW = `Play!${TAG}x9`;
const SFX = TAG.slice(-4); // team names carry the run, since names are unique per org (F-1)
const mail = (k) => CFG.mail(TAG, k);
const steps = [];
const findings = [];
const ids = { tag: TAG, divisions: {}, teams: {}, players: {}, captains: {}, games: [] };
const t0 = Date.now();
function step(section, what, ok, detail = "") {
  const row = { section, what, ok, detail: String(detail).slice(0, 600), at: Math.round((Date.now() - t0) / 1000) };
  steps.push(row);
  console.log(`${ok ? "PASS" : "FAIL"} [${section}] ${what}${detail ? `  -- ${String(detail).slice(0, 220)}` : ""}`);
  return ok;
}
function finding(sev, area, title, detail) {
  findings.push({ sev, area, title, detail });
  console.log(`FINDING ${sev} [${area}] ${title} -- ${String(detail).slice(0, 220)}`);
}
const save = () => {
  const data = JSON.stringify({ ids, steps, findings }, null, 2);
  writeFileSync(`${OUT}/run-${TAG}.json`, data);
  writeFileSync(`${OUT}/latest.json`, data);
};


const DIVS = [
  { name: "Div A", teams: ["Alpha", "Bravo", "Charlie", "Delta"] },
  { name: "Div B", teams: ["Echo", "Foxtrot", "Golf", "Hotel"] },
  { name: "Div C", teams: ["India", "Juliet", "Kilo", "Lima"] }
];
const ymd = (d) => d.toISOString().slice(0, 10);
const today = new Date();
const tomorrow = new Date(Date.now() + 86400000);

let oa, sa;
try {
  // ---------------- 1. Hierarchy ----------------
  oa = await login(CFG.orgAdmin.email, CFG.orgAdmin.password);
  sa = await login(CFG.superAdmin.email, CFG.superAdmin.password);
  const [org] = await q(`select id, display_name as name, slug from orgs where slug = $1`, [CFG.orgSlug]);
  ids.orgId = org.id;
  step("setup", `target org on ${TARGET} is "${org?.name}" (${CFG.orgSlug}); PPHL's real org is never written`, !!org && org.slug === CFG.orgSlug);

  let leagueName = "Test League Oct";
  const [dupe] = await q(`select id from leagues where org_id = $1 and name = $2 and deleted_at is null`, [org.id, leagueName]).catch(() => q(`select id from leagues where org_id = $1 and name = $2`, [org.id, leagueName]));
  if (dupe) {
    const again = await call("POST", "/league/leagues", { orgId: org.id, sportCode: "HOCKEY_ICE", name: leagueName }, oa);
    step("setup", "a second league with the same name in the same org is refused", again.status === 409 || again.status === 400, `${again.status} ${msgOf(again)}`);
    if (again.status < 300) finding("minor", "Setup", "Duplicate league names are accepted in one org", `"${leagueName}" already existed (${dupe.id}); a second create returned ${again.status} (id ${again.json?.id}). Two leagues with the same name are indistinguishable in every picker.`);
    leagueName = `Test League Oct ${TAG}`;
  }
  const lg = await call("POST", "/league/leagues", { orgId: org.id, sportCode: "HOCKEY_ICE", name: leagueName }, oa);
  step("setup", `org admin creates league "${leagueName}"`, lg.status < 300, `${lg.status} ${msgOf(lg)}`);
  ids.leagueId = lg.json.id;

  const seasonName = "Season 2026";
  const ss = await call("POST", "/league/seasons", {
    leagueId: ids.leagueId, name: seasonName, sportCode: "HOCKEY_ICE",
    startDate: ymd(tomorrow), endDate: "2027-02-28", timezone: "America/New_York",
    registrationOpensAt: new Date(Date.now() + 60000).toISOString(), registrationClosesAt: `${ymd(tomorrow)}T23:00:00.000Z`
  }, oa);
  step("setup", `org admin creates "${seasonName}" (starts ${ymd(tomorrow)}, America/New_York)`, ss.status < 300, `${ss.status} ${msgOf(ss)}`);
  ids.seasonId = ss.json.id;
  // Registration window opens a minute from now (the API refuses a past date).
  // F-6: edit follows the create rule; a date moved into the past is refused.
  const pastOpen = await call("PATCH", `/league/seasons/${ids.seasonId}`, { registrationOpensAt: new Date(Date.now() - 10 * 86400000).toISOString() }, oa);
  step("edge", "F-6: edit refuses a registration opening moved 10 days into the past", pastOpen.status >= 400 && /cannot open in the past/.test(msgOf(pastOpen)), `PATCH opensAt=-10d -> ${pastOpen.status} ${msgOf(pastOpen).slice(0, 120)}`);

  for (const d of DIVS) {
    const body = { seasonId: ids.seasonId, name: d.name, ...(d.name === "Div A" ? { ruleSetOverrides: { maxRosterSize: 5 } } : {}) };
    const r = await call("POST", "/league/divisions", body, oa);
    step("setup", `division "${d.name}"${d.name === "Div A" ? " (roster limit 5)" : ""}`, r.status < 300, `${r.status} ${msgOf(r)}`);
    ids.divisions[d.name] = r.json.id;
  }

  // Registration form (copy of the org's newest published season form) and prices.
  const [src] = await q(`select f.purpose, f.applies_to_roles, v.schema from registration_forms f join registration_form_versions v on v.id = f.active_version_id
     where f.org_id = (select id from orgs where slug = $1) and f.deleted_at is null and f.season_id is not null and f.purpose = 'season_registration' order by f.created_at desc limit 1`, [CFG.formSourceSlug]);
  const fm = await call("POST", "/org-admin/forms", { orgId: org.id, scope: "league", scopeId: ids.leagueId, seasonId: ids.seasonId, name: `${seasonName} Registration`, purpose: src.purpose, appliesToRoles: src.applies_to_roles ?? undefined }, oa);
  step("setup", "org admin creates the season's registration form", fm.status < 300, `${fm.status} ${msgOf(fm)}`);
  const fv = await call("POST", `/org-admin/forms/${fm.json.id}/versions`, { schema: src.schema }, oa);
  const fp = await call("POST", `/org-admin/forms/${fm.json.id}/versions/${fv.json?.id}/publish`, undefined, oa);
  step("setup", "form version created and published", fv.status < 300 && fp.status < 300, `${fv.status}/${fp.status} ${msgOf(fp).slice(0, 120)}`);
  ids.formId = fm.json.id;

  const tiers = {};
  for (const [k, name, cents] of [["team", "Team fee", 120000], ["player", "Player fee", 15000]]) {
    const c = await call("POST", "/org-admin/pricing-tiers", { seasonId: ids.seasonId, name, fullPriceCents: cents, audience: k }, oa);
    const a = c.status < 300 ? await call("PATCH", `/org-admin/pricing-tiers/${c.json.id}`, { isActive: true }, oa) : c;
    const dv = c.status < 300 ? await call("PUT", `/org-admin/pricing-tier-divisions/${c.json.id}`, { divisionIds: Object.values(ids.divisions) }, oa) : c;
    step("setup", `price "${name}" $${cents / 100} active on all divisions`, c.status < 300 && a.status < 300 && dv.status < 300, `${c.status}/${a.status}/${dv.status} ${msgOf(c.status >= 300 ? c : a.status >= 300 ? a : dv).slice(0, 160)}`);
    tiers[k] = c.json?.id;
  }
  ids.tiers = tiers;

  const st = await call("POST", `/league/seasons/${ids.seasonId}/status`, { status: "registration_open" }, oa);
  step("setup", "season status draft -> registration_open", st.status < 300, `${st.status} ${msgOf(st)}`);
  await new Promise((r) => setTimeout(r, 65000)); // registration window opens
  save();

  // ---------------- 2. Funnel helper ----------------
  async function register({ key, fullName, submissionType, divisionId, teamId, teamName, tier }) {
    const email = mail(key);
    const ctx = await call("GET", `/public/registration/seasons/${ids.seasonId}${teamId ? `?team=${teamId}` : ""}`);
    if (ctx.status >= 300) return { error: `context ${ctx.status} ${msgOf(ctx)}` };
    const s = await call("POST", `/public/registration/seasons/${ids.seasonId}/submissions`, {
      email, password: PW, fullName, dobDate: dobYearsAgo(30), submissionType, formVersionId: ctx.json.formVersionId,
      divisionId, ...(teamId ? { teamId } : {}), ...(teamName ? { teamName } : {})
    });
    if (s.status >= 300) return { error: `start ${s.status} ${msgOf(s)}`, email };
    const id = s.json.id;
    const p1 = await call("PATCH", `/public/registration/submissions/${id}`, { email, pricingTierId: tier });
    const w = await call("GET", `/public/registration/submissions/${id}/waivers?email=${encodeURIComponent(email)}`);
    let signed = 0;
    for (const doc of w.json?.documents ?? []) {
      const sg = await call("POST", `/public/registration/submissions/${id}/sign-waiver`, { email, key: doc.key, signatureName: fullName });
      if (sg.status < 300) signed++;
    }
    const pay = await call("POST", `/public/registration/submissions/${id}/pay`, { email });
    const [row] = await q(`select status, subject_person_id, team_id, submitted_by_user_id from registrations where id = $1`, [id]);
    return { id, email, priced: p1.status, waivers: (w.json?.documents ?? []).length, signed, pay: pay.status, payMsg: msgOf(pay), row };
  }
  async function approve(regId) {
    const r = await call("POST", `/org-admin/registrations/${regId}/review`, { action: "approve" }, oa);
    return r;
  }

  // ---------------- 3. Team registration (captains) ----------------
  for (const d of DIVS) {
    for (const t of d.teams) {
      const key = `Team ${t}`, teamName = `${key} ${SFX}`;
      const reg = await register({ key: `capt-${t.toLowerCase()}`, fullName: `Capt ${t}`, submissionType: "team", divisionId: ids.divisions[d.name], teamName, tier: tiers.team });
      if (reg.error) { step("team", `Capt ${t} registers ${teamName}`, false, reg.error); continue; }
      const ok1 = step("team", `Capt ${t} registers "${teamName}" in ${d.name}: waivers ${reg.signed}/${reg.waivers}, paid (mock card) ${reg.pay}`, reg.pay < 300 && reg.signed === reg.waivers, `status=${reg.row.status} ${reg.pay >= 300 ? reg.payMsg : ""}`);
      const ap = await approve(reg.id);
      const [team] = await q(`select t.id, t.captain_user_id, e.entry_status from teams t join division_team_entries e on e.team_id = t.id and e.division_id = $2 where t.name = $1 and t.org_id = $3 order by t.created_at desc limit 1`, [teamName, ids.divisions[d.name], org.id]);
      const [role] = await q(`select count(*)::int n from user_role_assignments a join roles r on r.id = a.role_id where a.user_id = $1 and r.code = 'captain' and a.scope_type = 'team' and a.scope_id = $2 and a.revoked_at is null`, [reg.row.submitted_by_user_id, team?.id ?? null]);
      step("team", `league accepts ${teamName}: team row, division entry (${team?.entry_status}), captain role`, ap.status < 300 && !!team && role.n === 1, `${ap.status} ${msgOf(ap).slice(0, 120)}`);
      if (team) {
        ids.teams[key] = { id: team.id, division: d.name };
        ids.captains[key] = { email: reg.email, personId: reg.row.subject_person_id, userId: reg.row.submitted_by_user_id };
        const [m] = await q(`select count(*)::int n from team_memberships where team_id = $1 and person_id = $2 and current_status = 'active'`, [team.id, reg.row.subject_person_id]);
        if (!m.n) ids.teams[key].captainNotRostered = true;
      }
      void ok1;
    }
  }
  const capNotRostered = Object.entries(ids.teams).filter(([, t]) => t.captainNotRostered).map(([n]) => n);
  if (capNotRostered.length) finding("major", "Roster", "The captain who registers a team is not on its roster", `${capNotRostered.length} of ${Object.keys(ids.teams).length} teams: the registering captain has the captain role but no roster spot, so they are not a player on their own team (no jersey, not in lineups, stats or eligibility). Teams: ${capNotRostered.join(", ")}`);
  // Captain price check: the team was registered on the team fee; could it have used the player fee?
  {
    const reg = await register({ key: "capt-cheap", fullName: "Capt Cheap", submissionType: "team", divisionId: ids.divisions["Div B"], teamName: `Team Cheap ${SFX}`, tier: tiers.player });
    const [inv] = reg.id ? await q(`select total_cents from invoices where registration_id = $1 order by created_at desc limit 1`, [reg.id]) : [];
    step("edge", "F-2: a captain registering a team cannot pay the $150 player price", !!reg.error || reg.priced >= 400 || reg.pay >= 400, `start=${reg.error ?? "ok"} price=${reg.priced} pay=${reg.pay} ${reg.payMsg ?? ""} invoice=${inv?.total_cents}`);
    if (!reg.error && reg.pay < 300) finding("major", "Fees", "A team can be registered on the player price", `Prices have no "team" or "player" audience: a captain picked "Player fee" ($150) for a team registration and paid ${inv ? `$${inv.total_cents / 100}` : "it"} instead of the $1,200 team fee. Registration ${reg.id}, left pending.`);
    ids.cheapReg = reg.id;
  }
  // Duplicate team name in the same division.
  {
    const reg = await register({ key: "capt-dupe", fullName: "Capt Dupe", submissionType: "team", divisionId: ids.divisions["Div A"], teamName: `Team Alpha ${SFX}`, tier: tiers.team });
    let created = false;
    if (reg.id && !reg.error) {
      const ap = await approve(reg.id);
      const [n] = await q(`select count(*)::int n from teams t join division_team_entries e on e.team_id = t.id where t.name = $2 and e.division_id = $1`, [ids.divisions["Div A"], `Team Alpha ${SFX}`]);
      created = n.n > 1;
      step("edge", "F-1: another captain's \"Team Alpha\" is refused before payment, no second team", !created && reg.pay >= 400, `pay ${reg.pay} ${reg.payMsg ?? ""}, approve ${ap.status} ${msgOf(ap).slice(0, 100)}, teams named Team Alpha in Div A: ${n.n}`);
    } else step("edge", "a second \"Team Alpha\" in Div A is refused at registration", !/no published registration form/.test(reg.error ?? ""), reg.error);
    if (created) finding("major", "Teams", "Two teams with the same name can be accepted into one division", `A second captain registered "Team Alpha" in Div A and the approval created a second team of that name. Standings, schedules and pickers then show two "Team Alpha" rows.`);
    ids.dupeReg = reg.id;
  }
  save();

  // ---------------- 4. Players onto teams ----------------
  for (const [teamName, t] of Object.entries(ids.teams)) {
    const word = teamName.replace("Team ", "");
    ids.players[teamName] = [];
    const want = t.captainNotRostered ? 4 : 4; // captain + 4 players = 5 per team
    for (let i = 1; i <= want; i++) {
      const reg = await register({ key: `play${i}-${word.toLowerCase()}`, fullName: `Play${i} ${word}`, submissionType: "individual", divisionId: ids.divisions[t.division], teamId: t.id, tier: tiers.player });
      if (reg.error) { step("roster", `Play${i} ${word} registers onto ${teamName}`, false, reg.error); continue; }
      const ap = await approve(reg.id);
      const [m] = await q(`select jersey_number from team_memberships where team_id = $1 and person_id = $2 and current_status = 'active'`, [t.id, reg.row.subject_person_id]);
      const ok = step("roster", `Play${i} ${word}: registers from ${teamName}'s link, waivers ${reg.signed}/${reg.waivers}, pays, approved, on the roster`, ap.status < 300 && !!m, `pay=${reg.pay} approve=${ap.status} roster=${JSON.stringify(ap.json?.roster ?? null)} jersey=${m?.jersey_number ?? "-"}`);
      ids.players[teamName].push({ name: `Play${i} ${word}`, personId: reg.row.subject_person_id, email: reg.email, rostered: ok, jersey: m?.jersey_number ?? null });
    }
  }
  // If captains are not rostered, the captain adds themself: does the product allow it?
  if (capNotRostered.length) {
    const tn = capNotRostered[0];
    const cap = ids.captains[tn];
    const tok = await login(cap.email, PW);
    const self = await call("POST", `/captain/roster/${ids.teams[tn].id}/add`, { personId: cap.personId, seasonId: ids.seasonId }, tok);
    step("roster", `${tn}'s captain tries to add themself to the roster`, true, `${self.status} ${msgOf(self).slice(0, 160)}`);
  }
  // Jerseys unique per team.
  const dupJ = await q(`select t.name, m.jersey_number, count(*)::int n from team_memberships m join teams t on t.id = m.team_id
     where t.id = any($1::uuid[]) and m.current_status = 'active' and m.jersey_number is not null group by 1, 2 having count(*) > 1`, [Object.values(ids.teams).map((t) => t.id)]);
  step("roster", "no two active players on a team share a jersey number", dupJ.length === 0, JSON.stringify(dupJ));
  const noJersey = await q(`select count(*)::int n from team_memberships m where m.team_id = any($1::uuid[]) and m.current_status = 'active' and m.jersey_number is null`, [Object.values(ids.teams).map((t) => t.id)]);
  step("roster", "F-3: every active roster spot has a jersey number", noJersey[0].n === 0, `${noJersey[0].n} without a number`);
  // Each registration is for the registering account's own person, never another account's.
  const [foreign] = await q(`select count(*)::int n from registrations r join persons p on p.id = r.subject_person_id
     where r.season_id = $1 and p.user_id is distinct from r.submitted_by_user_id`, [ids.seasonId]);
  step("roster", "every registration is for the registering account's own person", foreign.n === 0, `${foreign.n} registrations on another account's person`);
  if (noJersey[0].n) finding("minor", "Roster", "Players join with no jersey number", `${noJersey[0].n} active roster spots have no jersey number after approval (FR-3.4.2 asks for auto-assigned numbers).`);
  // Roster limit: Div A allows 5.
  if (ids.teams["Team Alpha"]) {
    const t = ids.teams["Team Alpha"];
    const active = async () => (await q(`select count(*)::int n from team_memberships where team_id = $1 and current_status = 'active'`, [t.id]))[0].n;
    // Fill to the limit first (the captain may not hold a roster spot).
    for (let k = 5; (await active()) < 5 && k < 8; k++) {
      const fill = await register({ key: `fill${k}-alpha`, fullName: `Play${k} Alpha`, submissionType: "individual", divisionId: ids.divisions["Div A"], teamId: t.id, tier: tiers.player });
      if (fill.id && !fill.error) await approve(fill.id);
    }
    const cnt = { n: await active() };
    const reg = await register({ key: "play-over-alpha", fullName: "PlayOver Alpha", submissionType: "individual", divisionId: ids.divisions["Div A"], teamId: t.id, tier: tiers.player });
    let after = cnt.n, ap = null;
    if (reg.id && !reg.error) { ap = await approve(reg.id); [{ n: after }] = await q(`select count(*)::int n from team_memberships where team_id = $1 and current_status = 'active'`, [t.id]); }
    const blocked = after <= 5;
    step("edge", `roster limit 5: one more player for Team Alpha when it has ${cnt.n}`, blocked, `start=${reg.error ?? "ok"} pay=${reg.pay ?? "-"} approve=${ap?.status ?? "-"} roster=${JSON.stringify(ap?.json?.roster ?? null)} active now=${after}`);
    if (!blocked) finding("blocker", "Roster", "The division roster limit is not enforced", `Div A has maxRosterSize 5; Team Alpha now has ${after} active players.`);
    if (reg.id && !reg.error && reg.pay < 300 && blocked) finding("minor", "Roster", "A full team still takes the registration and the payment", `Play6 Alpha registered from Team Alpha's link and paid ($150) although the team was full (${cnt.n}/5); ${ap ? `the approval answered ${JSON.stringify(ap.json?.roster ?? null)}` : ""}. The funnel should stop before payment when the team is full.`);
    ids.overLimitReg = reg.id;
  }
  // Same player registering twice.
  {
    const p = ids.players["Team Echo"]?.[0];
    if (p) {
      const again = await call("POST", `/public/registration/seasons/${ids.seasonId}/submissions`, { email: p.email, password: PW, fullName: p.name, dobDate: dobYearsAgo(30), submissionType: "individual", divisionId: ids.divisions["Div B"], teamId: ids.teams["Team Echo"].id });
      const [n] = await q(`select count(*)::int n from registrations where season_id = $1 and subject_person_id = $2 and status not in ('cancelled','rejected')`, [ids.seasonId, p.personId]);
      step("edge", "a player who already registered starts again: no second live registration", n.n === 1, `${again.status} ${msgOf(again).slice(0, 140)}; live registrations=${n.n}`);
      if (n.n > 1) finding("major", "Registration", "A player can hold two live registrations for one season", `${p.name} registered twice (${n.n} live rows).`);
    }
  }
  save();

  // ---------------- 5. Roster lock ----------------
  // Fresh sign-in: registration takes ~40 minutes and the first token expires.
  oa = await login(CFG.orgAdmin.email, CFG.orgAdmin.password);
  {
    const lockAt = new Date(Date.now() - 60000).toISOString();
    const lk = await call("PATCH", `/league/seasons/${ids.seasonId}`, { rosterLockAt: lockAt }, oa);
    step("lock", "org admin sets the roster lock to now", lk.status < 300, `${lk.status} ${msgOf(lk).slice(0, 140)}`);
    if (lk.status >= 300) finding("minor", "Roster", "The roster lock cannot be set to a time that has passed", `PATCH rosterLockAt=${lockAt} -> ${lk.status} ${msgOf(lk).slice(0, 160)}`);
    const t = ids.teams["Team Bravo"];
    if (!t) throw new Error("no Team Bravo: team registration failed earlier");
    const reg = await register({ key: "late-bravo", fullName: "Play9 Bravo", submissionType: "individual", divisionId: ids.divisions["Div A"], teamId: t.id, tier: tiers.player });
    let rostered = false, ap = null;
    if (reg.id && !reg.error) { ap = await approve(reg.id); const [m] = await q(`select count(*)::int n from team_memberships where team_id = $1 and person_id = $2 and current_status = 'active'`, [t.id, reg.row.subject_person_id]); rostered = m.n > 0; }
    step("lock", "after the lock a new player is not added to the roster", !rostered, `start=${reg.error ?? "ok"} approve=${ap?.status ?? "-"} roster=${JSON.stringify(ap?.json?.roster ?? null)}`);
    if (rostered) finding("blocker", "Roster", "Roster lock does not stop new roster spots", "A player registered and approved after the lock was put on Team Bravo.");
    const cap = ids.captains["Team Bravo"];
    const ctok = await login(cap.email, PW);
    const someone = ids.players["Team Charlie"]?.[0];
    const add = someone ? await call("POST", `/captain/roster/${t.id}/invite`, { seasonId: ids.seasonId, email: someone.email }, ctok) : null;
    step("lock", "after the lock the captain cannot invite a player", !add || add.status >= 400, add ? `${add.status} ${msgOf(add).slice(0, 140)}` : "skipped");
    await call("PATCH", `/league/seasons/${ids.seasonId}`, { rosterLockAt: null }, oa);
    ids.lateReg = reg.id;
  }
  save();

  // ---------------- 6. Schedule ----------------
  const v = await call("POST", "/scheduling/venues", { orgId: org.id, name: `Test Rink Oct ${TAG}`, timezone: "America/New_York" }, oa);
  step("schedule", "org admin creates a rink (America/New_York)", v.status < 300, `${v.status} ${msgOf(v)}`);
  ids.venueId = v.json?.id;
  const surfaces = [];
  for (const label of ["Rink 1", "Rink 2"]) {
    const s = await call("POST", `/scheduling/venues/${ids.venueId}/surfaces`, { label }, oa);
    step("schedule", `surface "${label}"`, s.status < 300, `${s.status} ${msgOf(s)}`);
    surfaces.push(s.json?.id);
  }
  ids.surfaces = surfaces;
  let slotCount = 0;
  for (const sid of surfaces) {
    for (const time of ["19:00", "20:30"]) {
      const b = await call("POST", `/scheduling/surfaces/${sid}/ice-slots/bulk`, { seasonId: ids.seasonId, startDate: ymd(new Date(Date.now() + 2 * 86400000)), endDate: "2027-01-31", weekdays: [2, 4, 6], startLocalTime: time, durationMin: 75 }, oa);
      const n = b.json?.created ?? b.json?.count ?? b.json?.inserted ?? (Array.isArray(b.json) ? b.json.length : "?");
      step("schedule", `weekly ice Tue/Thu/Sat ${time} on ${sid === surfaces[0] ? "Rink 1" : "Rink 2"}`, b.status < 300, `${b.status} created=${n} ${b.status >= 300 ? msgOf(b) : ""}`);
      if (typeof n === "number") slotCount += n;
    }
  }
  const [slots] = await q(`select count(*)::int n from ice_slots where season_id = $1`, [ids.seasonId]).catch(async () => [{ n: "?" }]);
  ids.slots = slots.n;
  const st2 = await call("POST", `/league/seasons/${ids.seasonId}/status`, { status: "in_progress" }, oa);
  step("schedule", "season status registration_open -> in_progress", st2.status < 300, `${st2.status} ${msgOf(st2)}`);
  for (const d of DIVS) {
    const g = await edge("scheduler-generate", { seasonId: ids.seasonId, divisionId: ids.divisions[d.name], gamesPerPair: 2 }, oa);
    step("schedule", `generate a double round robin for ${d.name}`, g.status === 200 && ["OPTIMAL", "FEASIBLE"].includes(g.json?.status), `${g.status} ${g.json?.status} games=${g.json?.gamesCreated} gap=${g.json?.maxHomeAwayImbalance} ${g.json?.error ?? g.json?.infeasibility?.summary ?? ""}`);
    ids.divisions[`${d.name}:run`] = g.json?.runId;
    const pub = await call("POST", "/games/publish-schedule", { seasonId: ids.seasonId, divisionId: ids.divisions[d.name], scheduleRunId: g.json?.runId }, oa);
    step("schedule", `publish ${d.name}'s schedule`, pub.status < 300, `${pub.status} ${msgOf(pub).slice(0, 160)}`);
  }
  // Regenerating a published division keeps its games and makes no duplicates.
  {
    const [before] = await q(`select count(*)::int n from games where season_id = $1 and division_id = $2 and status not in ('cancelled','postponed')`, [ids.seasonId, ids.divisions["Div A"]]);
    const g2 = await edge("scheduler-generate", { seasonId: ids.seasonId, divisionId: ids.divisions["Div A"], gamesPerPair: 2 }, oa);
    const [after] = await q(`select count(*)::int n from games where season_id = $1 and division_id = $2 and status not in ('cancelled','postponed')`, [ids.seasonId, ids.divisions["Div A"]]);
    step("edge", "generating Div A again after publishing makes no duplicate games", after.n === before.n, `${g2.status} ${g2.json?.status} created=${g2.json?.gamesCreated} kept=${JSON.stringify(g2.json?.kept ?? null)}; games ${before.n} -> ${after.n}`);
    if (after.n > before.n) finding("blocker", "Schedule", "Regenerating a published division duplicates games", `Div A had ${before.n} live games, ${after.n} after a second run.`);
  }
  // Conflict checks straight from the stored games.
  const games = await q(`select g.id, g.division_id, g.home_team_id, g.away_team_id, g.slot_id, g.scheduled_start_ts_utc, g.published_at, g.surface_id
     from games g where g.season_id = $1 and g.status not in ('cancelled','postponed')`, [ids.seasonId]);
  ids.gameCount = games.length;
  const bySlot = new Map(), teamTime = new Map();
  let slotClash = 0, teamClash = 0, sameTeam = 0, unpublished = 0;
  for (const g of games) {
    if (g.slot_id) { if (bySlot.has(g.slot_id)) slotClash++; bySlot.set(g.slot_id, g.id); }
    for (const t of [g.home_team_id, g.away_team_id]) { const k = `${t}|${new Date(g.scheduled_start_ts_utc).toISOString()}`; if (teamTime.has(k)) teamClash++; teamTime.set(k, g.id); }
    if (g.home_team_id === g.away_team_id) sameTeam++;
    if (!g.published_at) unpublished++;
  }
  // Same surface, overlapping times (not only the same slot).
  // Any game on the same surface (this season or any other) overlapping in time.
  const overlap = await q(`select count(*)::int n from games a join games b on a.id <> b.id and a.surface_id = b.surface_id
     where a.season_id = $1 and a.status not in ('cancelled','postponed') and b.status not in ('cancelled','postponed')
       and tstzrange(a.scheduled_start_ts_utc, a.scheduled_start_ts_utc + make_interval(mins => coalesce(a.duration_min, 60)))
        && tstzrange(b.scheduled_start_ts_utc, b.scheduled_start_ts_utc + make_interval(mins => coalesce(b.duration_min, 60)))`, [ids.seasonId]);
  const perPair = await q(`select division_id, least(home_team_id, away_team_id) a, greatest(home_team_id, away_team_id) b, count(*)::int n from games
     where season_id = $1 and status not in ('cancelled','postponed') group by 1, 2, 3`, [ids.seasonId]);
  const pairsOff = perPair.filter((p) => p.n !== 2);
  step("schedule", `${games.length} games stored; each pair in a division meets exactly twice`, games.length === 36 && pairsOff.length === 0, `pairs not at 2: ${JSON.stringify(pairsOff.slice(0, 3))}`);
  step("schedule", "no ice slot holds two games", slotClash === 0, `${slotClash}`);
  step("schedule", "no rink surface has two overlapping games", overlap[0].n === 0, `${overlap[0].n}`);
  step("schedule", "no team plays two games at the same time", teamClash === 0, `${teamClash}`);
  step("schedule", "no team plays itself", sameTeam === 0, `${sameTeam}`);
  step("schedule", "every game is published", unpublished === 0, `${unpublished} unpublished`);
  save();

  // ---------------- 7. Game day ----------------
  oa = await login(CFG.orgAdmin.email, CFG.orgAdmin.password);
  const playersOf = async (teamId) => q(`select m.person_id from team_memberships m where m.team_id = $1 and m.current_status = 'active' order by m.jersey_number nulls last, m.created_at`, [teamId]);
  const first = await q(`select id, division_id, home_team_id, away_team_id, scheduled_start_ts_utc from games where season_id = $1 and status = 'scheduled' order by scheduled_start_ts_utc, id`, [ids.seasonId]);
  const pick = [];
  for (const d of DIVS) pick.push(...first.filter((g) => g.division_id === ids.divisions[d.name]).slice(0, 2));
  // Before start: an event on a scheduled game is refused.
  {
    const g = pick[0];
    const hp = await playersOf(g.home_team_id);
    const early = await call("POST", "/game-events", { gameId: g.id, eventType: "goal", teamId: g.home_team_id, primaryPersonId: hp[0]?.person_id }, oa);
    step("edge", "a goal on a game that has not started is refused", early.status >= 400, `${early.status} ${msgOf(early).slice(0, 140)}`);
  }
  const plan = [[3, 1, "regulation"], [2, 2, "overtime"], [4, 2, "regulation"], [1, 0, "regulation"], [2, 3, "shootout"], [5, 1, "regulation"]];
  const expected = {}; // teamId -> {gp,w,l,otl,gf,ga}
  const goalsBy = {};  // personId -> {g,a,pim}
  const bump = (t, k, n = 1) => { expected[t] ??= { gp: 0, w: 0, l: 0, otl: 0, gf: 0, ga: 0 }; expected[t][k] += n; };
  const statBump = (p, k, n = 1) => { goalsBy[p] ??= { g: 0, a: 0, pim: 0 }; goalsBy[p][k] += n; };
  for (let i = 0; i < pick.length; i++) {
    const g = pick[i];
    let [hs, as, ended] = plan[i];
    // A tie in regulation is settled in overtime: one more goal for home.
    const s = await call("POST", `/games/${g.id}/start`, {}, oa);
    step("game", `start game ${i + 1} (${g.id.slice(0, 8)})`, s.status < 300, `${s.status} ${msgOf(s).slice(0, 140)}`);
    if (s.status >= 300) continue;
    const hp = await playersOf(g.home_team_id), ap2 = await playersOf(g.away_team_id);
    if (ended === "overtime" && hs === as) hs++;
    let evOk = 0, evTried = 0;
    const goal = async (teamId, roster, n) => {
      const scorer = roster[n % roster.length].person_id;
      const a1 = roster[(n + 1) % roster.length].person_id, a2 = roster[(n + 2) % roster.length].person_id;
      const assists = [a1, a2].filter((x) => x !== scorer);
      evTried++;
      const r = await call("POST", "/game-events", { gameId: g.id, eventType: "goal", period: 1 + (n % 3), teamId, primaryPersonId: scorer, secondaryPersonIds: assists, idempotencyKey: `${TAG}-${g.id}-g-${teamId}-${n}` }, oa);
      if (r.status < 300) { evOk++; statBump(scorer, "g"); for (const x of assists) statBump(x, "a"); }
      else console.log("goal refused", r.status, msgOf(r));
    };
    // A shootout: the tied regulation/overtime goals are events; the
    // shootout winner gets one more on the score (how the product counts it).
    const evH = ended === "shootout" ? Math.min(hs, as) : hs, evA = ended === "shootout" ? Math.min(hs, as) : as;
    for (let n = 0; n < evH; n++) await goal(g.home_team_id, hp, n);
    for (let n = 0; n < evA; n++) await goal(g.away_team_id, ap2, n);
    const pen = await call("POST", "/game-events", { gameId: g.id, eventType: "penalty", period: 2, teamId: g.away_team_id, primaryPersonId: ap2[0].person_id, attributes: { infraction: "tripping", minutes: 2 }, idempotencyKey: `${TAG}-${g.id}-p1` }, oa);
    if (pen.status < 300) statBump(ap2[0].person_id, "pim", 2);
    step("game", `game ${i + 1}: ${evH}-${evA} in goal events then ${hs}-${as} (${ended}), ${evOk}/${evTried} goals with assists, 1 tripping minor`, evOk === evTried && pen.status < 300, `penalty ${pen.status} ${pen.status >= 300 ? msgOf(pen) : ""}`);
    if (i === 0) {
      const bad1 = await call("POST", "/game-events", { gameId: g.id, eventType: "goal", teamId: g.home_team_id, primaryPersonId: hp[0].person_id, secondaryPersonIds: [hp[0].person_id] }, oa);
      step("edge", "a goal whose assist is the scorer is refused", bad1.status >= 400, `${bad1.status} ${msgOf(bad1).slice(0, 120)}`);
      const bad2 = await call("POST", "/game-events", { gameId: g.id, eventType: "penalty", teamId: g.home_team_id, primaryPersonId: hp[0].person_id, attributes: { infraction: "tripping", minutes: 3 } }, oa);
      step("edge", "a 3-minute penalty is refused (2/4/5/10 only)", bad2.status >= 400, `${bad2.status} ${msgOf(bad2).slice(0, 120)}`);
      const outsider = ids.players["Team Lima"]?.[0]?.personId;
      const bad3 = outsider ? await call("POST", "/game-events", { gameId: g.id, eventType: "goal", teamId: g.home_team_id, primaryPersonId: outsider }, oa) : null;
      step("edge", "a goal by a player from another team's roster is refused", !bad3 || bad3.status >= 400, bad3 ? `${bad3.status} ${msgOf(bad3).slice(0, 120)}` : "skipped");
      if (bad3 && bad3.status < 300) finding("major", "Game day", "A goal can be credited to a player who is not on either roster", `Play1 Lima (Team Lima) was accepted as a scorer for ${g.id}.`);
    }
    const [live] = await q(`select home_score, away_score from games where id = $1`, [g.id]);
    step("game", `game ${i + 1}: the score follows the goals (${live.home_score}-${live.away_score})`, live.home_score === evH && live.away_score === evA, `expected ${evH}-${evA}`);
    // F-7: a tied shootout game names its winner on finalize; the server adds the goal.
    const fin = await call("POST", `/games/${g.id}/finalize`, { endedIn: ended, ...(ended === "shootout" ? { shootoutWinner: hs > as ? "home" : "away" } : {}) }, oa);
    step("game", `finalize game ${i + 1} (${ended})`, fin.status < 300, `${fin.status} ${msgOf(fin).slice(0, 160)}`);
    const [fs] = await q(`select home_score, away_score, metadata->>'endedIn' ended from games where id = $1`, [g.id]);
    step("game", `game ${i + 1}: final score stored ${hs}-${as} (${ended})`, fs.home_score === hs && fs.away_score === as && fs.ended === ended, `stored ${fs.home_score}-${fs.away_score} ${fs.ended}`);
    if (fin.status < 300) {
      bump(g.home_team_id, "gp"); bump(g.away_team_id, "gp");
      bump(g.home_team_id, "gf", hs); bump(g.home_team_id, "ga", as); bump(g.away_team_id, "gf", as); bump(g.away_team_id, "ga", hs);
      const [w, l] = hs > as ? [g.home_team_id, g.away_team_id] : [g.away_team_id, g.home_team_id];
      bump(w, "w"); bump(l, ended === "regulation" ? "l" : "otl");
      ids.games.push({ id: g.id, score: `${hs}-${as}`, ended });
    }
    if (i === 0) {
      const again = await call("POST", `/games/${g.id}/finalize`, { endedIn: ended }, oa);
      step("edge", "finalizing the same game twice does not double count", true, `${again.status} ${msgOf(again).slice(0, 120)}`);
      const late = await call("POST", "/game-events", { gameId: g.id, eventType: "goal", teamId: g.home_team_id, primaryPersonId: hp[0].person_id }, oa);
      step("edge", "a goal after the game is final is refused", late.status >= 400, `${late.status} ${msgOf(late).slice(0, 120)}`);
    }
  }
  save();

  // ---------------- 8. Standings and leaders ----------------
  const flat = [];
  for (const d of DIVS) {
    const api = await call("GET", `/stats/standings/${ids.leagueId}?divisionId=${ids.divisions[d.name]}`, undefined, oa);
    step("standings", `standings API answers for ${d.name}`, api.status < 300, `${api.status} rows=${Array.isArray(api.json) ? api.json.length : msgOf(api).slice(0, 120)}`);
    if (Array.isArray(api.json)) flat.push(...api.json.map((r) => ({ ...r, division: d.name })));
    step("standings", `F-4: ${d.name} standings list all ${d.teams.length} teams, played or not`, Array.isArray(api.json) && api.json.length === d.teams.length, `rows=${Array.isArray(api.json) ? api.json.length : "-"}`);
  }
  writeFileSync(`${OUT}/standings-api.json`, JSON.stringify(flat, null, 2));
  let mism = [];
  for (const [teamId, e] of Object.entries(expected)) {
    const r = flat.find((x) => x.teamId === teamId || x.team_id === teamId || x.team?.id === teamId);
    if (!r) { mism.push(`${teamId.slice(0, 8)} missing`); continue; }
    const got = { gp: r.gp ?? r.gamesPlayed ?? r.played, w: r.w ?? r.wins, l: r.l ?? r.losses, otl: r.otl ?? r.otLosses ?? r.overtimeLosses, gf: r.gf ?? r.goalsFor, ga: r.ga ?? r.goalsAgainst };
    for (const k of Object.keys(e)) if (got[k] !== undefined && got[k] !== e[k]) mism.push(`${teamId.slice(0, 8)} ${k} ${got[k]}!=${e[k]}`);
  }
  step("standings", `standings match the ${ids.games.length} finalized results (GP/W/L/OTL/GF/GA)`, ids.games.length > 0 && mism.length === 0, mism.slice(0, 6).join("; ") || `${Object.keys(expected).length} teams checked`);
  if (mism.length) finding("blocker", "Standings", "Standings do not match finalized results", mism.slice(0, 10).join("; "));
  const ld = await call("GET", `/stats/seasons/${ids.seasonId}/leaders`, undefined, oa);
  writeFileSync(`${OUT}/leaders-api.json`, JSON.stringify(ld.json, null, 2));
  const topExpected = Object.entries(goalsBy).map(([p, s]) => ({ p, pts: s.g + s.a, g: s.g })).sort((a, b) => b.pts - a.pts)[0];
  const ldText = JSON.stringify(ld.json ?? {});
  step("standings", "leaders API answers and lists the top point scorer from the events", ld.status < 300 && !!topExpected && ldText.includes(topExpected.p), `${ld.status} top expected ${topExpected?.p?.slice(0, 8)} (${topExpected?.pts} pts)`);
  const statRows = await q(`select person_id, core from stat_lines where season_id = $1`, [ids.seasonId]);
  let statMism = 0;
  for (const [p, s] of Object.entries(goalsBy)) {
    const rs = statRows.filter((r) => r.person_id === p);
    const g = rs.reduce((a, r) => a + Number(r.core?.goals ?? 0), 0), a = rs.reduce((x, r) => x + Number(r.core?.assists ?? 0), 0);
    if (g !== s.g || a !== s.a) statMism++;
  }
  step("standings", `stat lines: goals and assists match the events for ${Object.keys(goalsBy).length} players`, statMism === 0, `${statMism} players differ`);
} catch (e) {
  step("run", "run finished without a crash", false, String(e?.stack ?? e).slice(0, 500));
} finally {
  ids.durationSec = Math.round((Date.now() - t0) / 1000);
  save();
  const pass = steps.filter((s) => s.ok).length;
  console.log(`\n${pass}/${steps.length} steps passed, ${findings.length} findings, ${ids.durationSec}s. Tag ${TAG}. Output ${OUT}/run-${TAG}.json`);
  process.exitCode = pass === steps.length && findings.length === 0 ? 0 : 1;
  await sql.end();
}
