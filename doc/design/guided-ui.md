# Guided UI: rules and plan

Owner directive (28 Oct 2026): the apps are text heavy and not guided.
Users feel overwhelmed. Every app must feel familiar and guided, simple
enough that a child could run it without help.

This file is the rule for every UI change in player-web, team-admin-web,
org-admin-web and superadmin-web. Read it before touching a page.

## What we measured (production, 28 Oct, before)

Read-only crawl as each smoke user (`output/ux-baseline/baseline.json`):

| Page | Words on page | Words above the fold | Long paragraphs |
|---|---|---|---|
| Org home | 556 | 226 | 4 |
| Org registrations | 331 | 124 | 4 |
| Org finance | 212 | 96 | 3 |
| Super-admin home | 546 | 240 | 1 |
| Super-admin registrations | 1409 | 210 | 2 |
| Player home | 217 | 80 | 4 |
| Player profile | 311 | 110 | 5 |
| Player waivers | 222 | 125 | 2 |
| Team home | 121 | 87 | 3 |

Where the text comes from:

1. **Page header** (`PageHeader`, 136 files): a mono caps eyebrow that
   repeats the title, a 56px title, then a paragraph explaining the page.
   It takes about 250px before any content shows.
2. **Section header** (`SectionRail`): `// 01 · QUEUE` in mono caps, then
   another paragraph. Often in developer language ("the same path Stripe
   webhooks follow downstream").
3. **Mono uppercase labels everywhere**: buttons, stat labels, field
   labels, sidebar groups. Shouting text is slow to read.
4. **Help text under every field**, even obvious ones.
5. **Repeated detail**: each season on the home page shows all 7 steps
   as 7 boxes of text, repeated per season.

## Principles we apply

| Principle | What it means here |
|---|---|
| Hick's law | Fewer choices per screen. One primary button per page. |
| Jakob's law | Look like apps people know (SportsEngine, TeamSnap, Stripe). Familiar words, familiar places. |
| Recognition over recall | Show the next step as a button. Never make people read to find it. |
| Progressive disclosure | Explanations hide behind a small (?) button. Details open on demand. |
| Gestalt: proximity, common region | Group related things in one card. Space separates groups, not text. |
| Gestalt: similarity | Same thing looks the same in every app: status pills, buttons, numbers. |
| Goal gradient | Show progress ("Step 2 of 7") so people see how close they are. |
| Zeigarnik | Unfinished tasks are listed first, with one button each. |
| Von Restorff | Only the next action is coloured. Everything else is quiet. |
| Doherty threshold | Every click answers in under 400ms: optimistic state, skeletons. |
| Emil Kowalski motion | Motion only to explain a change. 150 to 250ms, ease-out. No motion on things people do often. Buttons press to 0.97. Respect reduced motion. |
| Hallmark | No numbered mono eyebrows, no filler stats, tokens only, every state designed. |

## Text budget (hard rules)

- **Page header:** title plus at most one action. No eyebrow that repeats
  the title. The description is hidden behind a (?) button.
- **Section header:** one short sentence-case heading. No numbering, no
  `//`, no caps. Any explanation goes behind (?).
- **Fields:** a clear label. Help text only when the answer is not
  obvious, and then at most 8 words.
- **Empty states:** one short line and one button.
- **Labels:** sentence case. Mono caps only for codes and IDs.
- **Words:** say what the user does ("Approve"), never how the system
  works ("inline", "funnel", "webhook", "cohort", "scope").
- **5-second test:** a new user can say what the page is for and what to
  click next within 5 seconds.

## Plan

One slice at a time. Each slice is measured with the same crawl and
checked in a browser as the role it serves.

1. **Shared header and section header** (all apps at once). Smaller
   title, no repeated eyebrow, explanation behind (?), no numbering.
2. **Shared labels**: sentence case on stat tiles, chips, sidebar group
   names and buttons.
3. **Each home page leads with one "Next step" card**: player, captain,
   org admin, super admin. The season tracker shows "Step 2 of 7" with
   one button; the 7 boxes open on demand.
4. **Copy sweep**: remove developer language from every page; trim field
   help text.
5. **Forms**: group fields into short cards, one column on phones.
6. **Navigation**: fewer sidebar groups for the org admin, plain names.

Done for a slice means: words above the fold down on every page it
touches, no page lost a needed action, and the role walked the flow in a
browser on staging, then production.

## Status (28 Oct 2026)

| Slice | What shipped |
|---|---|
| 1 Headers | `PageHeader` title only, explanation behind (?) (`InfoDisclosure`); `SectionRail` without numbering |
| 2 Labels | `guided.css` turns mono caps labels into sentence case; badges, table heads, sidebar groups |
| 3 Homes | `TodoList` "Needs you" plus the main object on all four homes; season card is one progress bar |
| 4 Copy | Developer words removed from 40 strings; `FieldHint` folds help over 8 words; plain wizard questions |
| 5 Forms | Setup wizard season step grouped as a season runs; playoffs optional and closed |
| 6 Navigation | A sidebar group with one link is that link; the org admin's Registration group starts open |

Production crawl, before and after slices 1 and 2: above-the-fold words
3,215 to 2,546; long paragraphs 44 to 19; org home 556 to 94 words.

## Next phase — workflow pilots, 5 November 2026

The owner still finds the interfaces difficult to understand. Text reduction
alone does not establish usability. Each further sprint follows one complete
PPHL job, with a named starting point, a clear outcome and a receiving surface.

The first local pilot is the organization home: choose a working season,
open that season's games, inspect one game and return to the same context.
Other tasks remain available on demand. Regular-season games must not send
the operator back to Playoffs. Ambient decorative motion is omitted from
the organization console; route-loading feedback stays.

The job order, current evidence and acceptance gates are recorded in
`pphl-ux-sprints-2026-11-05.json`. The pilot is not deployed. PPHL usability
acceptance still requires an operator to attempt the job unaided; browser
checks and a successful build do not establish that outcome.

## Visual feedback — 5 November 2026

The owner rejected a flat, generic appearance and asked for a livelier, more
recognizable SportsPulse experience. The season-setup visual pilot keeps the
existing Inter, violet and light/dark tokens. A single live season pass shows
actual entered values. Step handoffs, the progress marker and rink movement
explain changes; reduced motion skips spatial transitions. Generic welcome
slogans and decorative stock-icon tiles are excluded. This pilot remains local
until its visual review; engineering checks do not establish aesthetic acceptance.

The second visual pass makes the progress steps lead the rail, reduces the
season pass to a compact supporting object, steadies the form footer and
shortens entry motion to 180 ms. Advanced league settings keep their fields
without repeating default format/privacy values in the closed summary.

The next pass extends that structure through divisions, registration and final
review. Division basics show five fields; age limits and the complete game
rules remain available. Copy keeps those values independent. Registration
uses separated sections rather than nested cards. Review emphasizes dates,
fees and included documents; its actions follow the explicit confirmation so
the action bar cannot obscure it.

## Phone workflow pilot — 6 November 2026

Season setup in the organization and super-admin consoles has a dedicated
phone interaction. A compact step menu preserves orientation. Season date
questions use a native picker. Divisions show one active editor, with a sticky
division picker and an action menu for add, copy and remove. New divisions
focus their name after becoming visible; saved divisions keep their edit lock.
Required documents and custom questions open together on demand.

The primary action stays within thumb reach and accounts for safe-area insets.
It withdraws while the visual viewport reports an open keyboard. Enter moves
between visible inputs without advancing setup or publishing. Inputs use a
16px font, and primary actions provide a 48px touch target. Final review
keeps save and publish after the required confirmation. The existing theme,
draft contract, validation and publishing behavior remain in use.

This is a local pilot for the two setup consoles. The other role interfaces
still need their own phone task passes. Chromium touch emulation checks the
journey and viewport changes; physical iOS/Android keyboards and assistive
technology remain separate acceptance checks.

The phone test also found the super-admin command-palette pill covering the
setup action bar. Phone page search now lives in the header, while its dialog
renders outside the sticky header. Shared menu, theme and account buttons
have 44px phone targets. The desktop page-search shortcut stays available.

## Deployment checkpoint — 6 November 2026

The owner authorized merging and deploying the completed work. The setup
pilot and preceding backend fixes deployed to production and staging at
`e7b554b1`; both `main` and `codex/staging` were updated. The database
prerequisites and scheduler functions were released first. Deployed phone
journeys passed in both setup consoles. Physical-device acceptance and the
other role interfaces' phone task passes remain outstanding.
