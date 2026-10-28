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
