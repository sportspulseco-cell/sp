# Tester walk — 2026-05-16

Walks executed against deployed apps via Playwright (MCP). Five surfaces
were exercised; one accessibility finding repeats across three apps;
one i18n scope finding turned up while comparing my new scaffold
against the deployed marketing copy.

Origin head at walk time: `fc85a7d docs/plan: rewrite to be 1:1 with the
broken-flow audit`. Every commit since (35 unpushed locally) was
**not** deployed when these walks ran, so anything those commits change
won't reflect here yet.

## Surfaces walked

| App | URL | Result |
|---|---|---|
| Landing | `https://sp-landing-seven.vercel.app/` | Renders. Hero, sections, footer ticker all visible. |
| Landing | `/pricing`, `/contact` | Render. No console errors. |
| Super-admin | `/sign-in` | Renders; email + password fields carry accessible names. |
| Org-admin | `/sign-in` | Renders; **input labels missing accessible names** (see BUG-1). |
| Team-admin | `/sign-in` | Renders; **same label issue** as org-admin. |
| Player | `/sign-in` | Renders; **same label issue** as org-admin. |

## Findings

### [BUG-1] Sign-in inputs missing accessible names · minor

**Surface:** `org-admin-web`, `team-admin-web`, `player-web` — every `/sign-in`

**Repro:**
1. Navigate to `https://sp-org-admin.vercel.app/sign-in`
2. Inspect the accessibility tree (Playwright snapshot or DevTools).

**Expected:** Each `<input>` exposes its visible label to screen-readers
(matches the superadmin pattern: `textbox "Work email"`).

**Actual:** Both inputs surface as bare `textbox` with no accessible name.
The visible label exists alongside the input but isn't bound to it.

**File (likely):** `apps/<role>-web/src/app/sign-in/page.tsx` — three
sign-in pages diverged from the superadmin variant. Add `htmlFor` /
`id` pairing or an `aria-label`.

**Why it matters:** Screen-readers, password managers, and Playwright
selectors all key off accessible names. The superadmin sign-in works
correctly; the three role-targeted apps don't.

### [BUG-2] i18n target locales don't match deployed marketing copy · planning

**Surface:** landing-web footer ticker (deployed) vs new i18n scaffold
(unpushed in this session).

The deployed footer ticker advertises **"EN-AR-HI MULTILINGUAL"**
(English / Arabic / Hindi). The i18n scaffold I just landed (commit
`c8ff703`) baselined `LOCALES = ['en','es']` instead.

**Recommendation:** before pushing the next deploy, decide whether to:
- swap `messages/es.json` → `messages/ar.json` (RTL — also flip
  `<html dir>` based on locale) and add `messages/hi.json`, or
- keep `es` as a placeholder and add `ar` + `hi` alongside.

The scaffold itself is locale-agnostic — only the seed JSONs and the
`LOCALE_LABELS` map in `apps/landing-web/src/i18n/config.ts` need to
change. Arabic in particular needs RTL: set
`<html lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>` in
`apps/landing-web/src/app/layout.tsx`.

### [INFO] Most of this session's work isn't deployed yet

35 commits are unpushed (`git log origin/main..HEAD`). Anything those
commits touch (parental-consent route on player-web, the `/register`
funnel route on player-web, every new `/org-admin/...` write endpoint,
the i18n switcher on landing) will only become testable after the next
push + Vercel auto-deploy. Re-run this walk after deploy to verify.

## Deferred — needs credentials

The audit doc's tester-walk items (#2/#15/#19) want flows walked **as the
role being tested**. Without sign-in credentials I can't:
- approve a registration as org-admin (UI ships in `e81ab67`)
- record an offline payment as org-admin (UI ships in `a8da7e2`)
- compose a broadcast as org-admin (UI ships in `841e4c4`)
- create a captain assignment as org-admin (`3d67690`)
- adjudicate a refund assessment (`66b702b`)
- exercise the new push-subscription endpoint (`ebfd997`)
- walk the captain rollover wizard (D2 / Backlog #19)

These are the highest-value next walks once you can hand me credentials
(or once the new work is deployed and seeded with mock data).
