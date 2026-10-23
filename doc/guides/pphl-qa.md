# SportsPulse Q&A — forms, player registration, captain team setup

Answers to the Q&A tab of SP-Changes (review call, 23 Oct 2026). Written
from what the product does today on staging and production, including the
parts that do not work yet. Apps: **Admin** = superadmin / league admin
console, **Org admin** = org console, **Captain** = team console,
**Player** = player app.

---

## 1. Form "Purpose" — what each option is for

When an admin clicks **New form** (Admin or Org admin → Forms), Purpose
decides where the form is used.

| Purpose | Used today? | What it does | Who fills it in |
|---|---|---|---|
| **Season registration** | **Yes** | The questions a player answers in the public registration funnel for a season (player-web → Open registrations → pick a season). Must be published and tied to the season (or league-wide for that league). Without one, the season never shows under "Leagues accepting registrations right now". | Players (and captains using the funnel's team path) |
| **Role profile** | **Yes** | Extra profile fields for a role, shown in the onboarding wizard the first time someone signs in with that role, and in the "set up profile now" step of Invite user. Use "Applies to roles" to pick the role (e.g. Coach). If none exists, built-in default fields are used. | New users of that role, or the admin inviting them |
| **Team application** | **No** | Intended for the free-agent / team application flow, but no screen reads it. The captain's "Register your team" flow uses its own fixed steps and ignores this form. | Nobody yet |
| **Custom** | **No** | Stored and listed only; nothing renders it to anyone. | Nobody yet |

**Recommendation:** remove *Team application* and *Custom* from the
dropdown until a flow uses them, so admins are not building forms nobody
sees. (Existing rows stay; only the option is hidden.) Say if you would
rather we wire them up instead — e.g. Team application questions shown to
captains when they apply for a division.

**Scope** (Org-wide / League / Season / Division) limits where the form
applies. **Applies to roles** empty means every role in that scope.

---

## 2. Player registration — every way a player can get onto a team

### Before any of these: the admin side
1. Admin creates the league, season (with registration open and close dates) and divisions: Admin → **Org setup**.
2. Admin builds and publishes a **Season registration** form for that season: Forms → New form → Purpose = Season registration → build → Publish.
3. The season is open to players while today is inside its registration window and its status is Draft, Registration open or In progress.

### Way A — Player registers directly (no team yet chosen)
| Step | Who | Where | What |
|---|---|---|---|
| 1 | Player | Player app → **Open registrations** | Sees seasons accepting registrations in their organisation. Signed-out visitors are sent to sign in first. |
| 2 | Player | Funnel, step 1 | Picks **Register as a player**. |
| 3 | Player | Funnel, step 2 | Creates an account, or **Signs in** (the real password is required). |
| 4 | Player | Funnel, steps 3-5 | Answers the form questions, signs waivers, picks a price tier, pays (payments are a dummy on staging today). |
| 5 | Minor only | Guardian email | If the player is under 18, a parent/guardian gets a consent link and confirms; the player then clicks **My parent has confirmed**. |
| 6 | Admin / Org admin | **Registrations** queue | Reviews and approves. |
| 7 | Captain or admin | Captain → Roster → Add player, or Admin → Memberships | Places the approved player on a team. |

### Way B — Captain sends an invite link
| Step | Who | Where | What |
|---|---|---|---|
| 1 | Captain | Captain → **Invites** | Picks the season, chooses *Personal email* or *Team link*, clicks create. Gets a full link (`player app/invite/…`). No email is sent yet, so the captain shares the link (text, WhatsApp, email). |
| 2 | Player | Opens the link | Sees "Join *Team name*". Signs in or creates an account. A personal invite only works for the email it was sent to. |
| 3 | Player | Clicks **Join** | Goes straight onto the team's roster for that season (roster cap and roster-lock date are checked). Lands on Player → My team. |

Note: the funnel's "Captain invite" option does not use the link; use the
link itself.

### Way C — Free agent (player without a team)
| Step | Who | Where | What |
|---|---|---|---|
| 1 | Player | Player app → Open registrations → **Join the free-agent pool** (or funnel → Free agent) | Lists position, level and availability for a season. |
| 2 | Captain | Captain → **Free agents** | Sees free agents in every season the team is playing in, with the season name. |
| 3 | Captain | Clicks **Claim** | Player is added to the roster immediately. (There is no accept/decline step for the player yet.) |

### Way D — Player asks to join a team
| Step | Who | Where | What |
|---|---|---|---|
| 1 | Player | Player → **My team** → Join a team | Sends a join request to a team. |
| 2 | Captain | Captain → **Join requests** | Approves or declines. |

### Way E — Captain or admin adds the player directly
Captain → **Manage roster** → Add player (search by name), or Admin →
Memberships. Used for players who are already known to the league.

---

## 3. Captain creating a team — step by step

There are two routes today. They do the same job; we recommend keeping
only Route 1 (approval-based) to avoid two different processes.

### Route 1 — Captain console (approval by the league)
| Step | Who | Where | What |
|---|---|---|---|
| 1 | Admin | Admin → Users → **Invite user** | Invites the captain with role *Captain* on their team (or creates the team first: Admin → Teams → New team, choosing the captain). |
| 2 | Captain | Captain app → sign in | Completes onboarding. |
| 3 | Captain | Captain → **Register your team** | Picks the open season, then the division. Submits. Status: *Pending approval*. |
| 4 | Admin / League admin | Admin → Seasons → *season* → **Applications** (or Division applications) | Approves or rejects, with a reason. |
| 5 | Captain | Captain → Register your team → **Set up** | Confirms the team profile, sets how dues are split (even or custom), and lists the players (by email) who owe a share. |
| 6 | System | — | Creates the team's dues invoice and one share per player; the team is **Applied**, then **Confirmed** once deposits reach the team's threshold. |
| 7 | Players | Way B, C, D or E above | Join the roster. |
| 8 | Players | Player → **Payments** | Pay their share. Captain tracks it on Captain → **Dues** (per-player Remind works; custom split edits are not saved yet). |

### Route 2 — Public funnel "Register a team"
A captain opens the season's registration link and picks **Register a
team**, enters the team name and colour, and pays. The team is created
directly as *Applied* in the chosen division, with the captain role
granted — no admin approval step.

---

## 4. Known gaps to keep in mind while testing
- No emails are sent on staging (invites, consent, reminders) — links are shown on screen instead.
- Payments are a dummy (no card is charged).
- Suspensions, ID-document review, captain team messages and store ordering are not built yet.
