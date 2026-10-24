# Flow analysis: why PPHL could not understand SportsPulse, and what changed

Date: 25 Oct 2026. Trigger: PPHL (Ven), 24 Oct: "there's so many modules and
subdomains, which I don't understand ... we cannot move forward unless we
really pin down the major components of our first release." Founder, 25 Oct:
the 404s were a symptom; the real problem is that a SportsEngine user cannot
tell what to do next. Companion documents: `competitor-ia.md` (SportsEngine
and alternatives, with sources) and `../traceability/benchmark.md`
(capability gaps).

## 1. What a PPHL operator saw on 24 Oct (evidence: crawl JSON, `test-results-audit/`)

| Symptom | Where | Why it confuses a SportsEngine user |
|---|---|---|
| Five sign-in links on the landing page (superadmin., league., org., team., player.) | `landing-web` nav + CTA | SportsEngine has one sign-in; the role decides what you see. A league admin here had to know that "league." is the admin console. |
| 30 menu items in the admin console, grouped as Platform / Setup / League / Compliance / Operations | `superadmin-web` sidebar | SportsEngine HQ groups by the operator's job (members, teams, competition, registration, money, messaging). "Compliance" and "Operations" are our words, not theirs. |
| Developer vocabulary on every page: "Tenants on the platform", "Persons", "Memberships", "Division apps", "Finance ops", "Append-only ledger", "DivisionTeamEntry", "roster_moves", "IAM", "AR escalations", "ON-CONFLICT" | page headers | None of these words exist in SportsEngine. The operator has to translate before acting. |
| Home page is a marketing hero with platform totals ("The pulse of every league", 24 live leagues) | `/dashboard` | It answers "how big is the platform", not "where is my season and what do I do next". |
| Placeholder pages reachable from the menu: Video, Team store, captain Communications ("Coming soon") | player and captain apps | Dead ends read as broken product. |
| API failures rendered as "404 This page could not be found" (43 pages), empty lists shown as truth (17 pages) | all apps | The operator cannot tell "nothing here" from "something failed", and a 404 says "you are in the wrong place". |
| League admin: Users/Forms "Could not load", Registrations/Transfers/Eligibility "Super admin access required", user pages 404 | admin console as league_admin | The role PPHL's operators get could not do its job. |

## 2. What changed (commits of 24–25 Oct on `pphl-journey-fixes`)

| Change | Commit | Effect for PPHL |
|---|---|---|
| One sign-in entry on the landing site: "What do you do in your league?" with four plain answers; the `league.` link removed from the menu and CTA | `f0764ee` | One decision instead of five URLs. |
| Admin console home opens with **Where each season stands**: for every live season the seven steps (set up → registration → teams → rosters → schedule → results → playoffs), live counts, and one "Next:" button that deep-links to the page that does it. Shared with the org console. | `f3d70d9`, `f0764ee` | The first screen says what to do next, in the order a season actually runs. |
| Every admin console page header rewritten in league-operator language (People, Rosters, Team applications, Registration forms, Waivers & documents, Game log, Rinks & ice time, Messages, Activity log, Import data, Platform settings); menu labels match | `24b0bf0`, `52f052e` | No translation step; the menu word is the page word. |
| Placeholders (Video, Team store, captain Communications) out of the menus; super-admin-only modules hidden from scoped admins | `c66e81f` | Fewer items, none dead. |
| API failures show who is responsible ("Your role does not have access" / "server problem on our side") instead of a 404; empty lists only when the list is really empty | `c66e81f` | "Nothing here" means nothing here. |
| League admins can read users, forms, registrations, team applications, transfers, eligibility and documents inside their scope | `3ad966b`, `4dbbb4b`, `121979a` | PPHL's own role works in the console. |
| Navigation regrouped the way SportsEngine HQ groups the work: Home, Season, Teams, Registration, Games & results, Members, Financials, Messages, Reports, Settings (admin console); same groups filtered for the org console; player app My games / My team / My account / Register | `8ffa1bd` | A SportsEngine user finds things where they expect them; top-level count drops from 30 flat items to 1 + 9 groups. |
| Code-style `//` prefix removed from every page eyebrow in the apps | `8ffa1bd` | Headers read as English, not as source code. |
| Season page opens with the same lifecycle strip and next step | `9232baf` | The season is the working surface, as in HQ Season Management. |
| Test payments labelled "no real card is charged while the league is testing" | `f3d70d9` | Testers know the mock is intentional. |

None of this is live for PPHL yet: production is on `a2cf243` until the Vercel plan is upgraded (Hobby cap of 100 deployments per day, hit 24 Oct 16:21 UTC).

## 3. Open UX work (ordered by how much it removes the learning curve)

1. **Regroup the admin console menu the way SportsEngine HQ groups it** (People, Teams, Competition, Registration, Schedule, Results, Payments, Messages, Reports, Settings) and cut the top level to about ten items; apply the same groups to the org console. Waits on `competitor-ia.md` for the exact labels so the words match what PPHL already uses.
2. **Season hub page** (`/seasons/:id`) as the operator's working surface: the same seven steps as the home card, each expanding into the actions for that step, so an operator never needs the side menu for a normal season.
3. **Captain app home = "your season"**: register the team (when open), roster status against the lock date, dues collected, next game; the captain findings CAP-1..24 are being fixed in parallel.
4. **Player app home for a player with nothing yet**: one card, "Find a season to join", then registration status, then team/schedule. Verify with the unhappy personas (returning user, minor, free agent).
5. **Public pages**: schedule, standings and team pages without sign-in, plus an iCal feed (benchmark B-5/B-6). This is what SportsEngine users open every day.
6. **Vocabulary pass on the remaining surfaces**: dialogs, empty states, toasts and emails ("org_admin — Org Admin" style strings; SETUP-7 in progress), and the `//` eyebrows, which read as code to non-developers.
7. **In-app help on each page**: one line "What this is for" plus a link to the step it belongs to in the season flow.

## 4. How we will know

- Crawl as each role: zero 404 / error / could-not-load pages (already true on staging-v3 for admin, league admin and org admin).
- Journeys J1–J17 and the league-admin journey pass step by step; findings closed in `doc/testing/bugs/`.
- A walk-through script for a SportsEngine-habituated operator (set up a season, open registration, place teams, publish a schedule, enter a score, send a message) completed without using search or help; time and wrong turns recorded.
