# SportsPulse: how the main flows work

For PPHL operators. Each step names who does it and the button they click.
Written 28 Oct 2026 from the code as it is today.

---

## 1. Registration form "Purpose"

Where: **Registration forms → New form**.

| Purpose | What it is for | Who sees it |
|---|---|---|
| **Season registration** | The form players fill in to register for one season. Pick this for every season. | Players, on the season's sign-up link. |
| **Role profile** | Extra profile questions for one role, like coach or referee. | People given that role, when their profile is set up. |

Two older options, **Team application** and **Custom**, are no longer offered
for new forms: nothing in the app uses them yet.

- **Scope**: which part of your organization the form belongs to: the whole
  organization, one league, or one division.
- **Season**: asked only for a Season registration form. Once set, the form
  shows that season as set; click **Change** only to move the form to
  another season.
- **Applies to roles**: shown only for Role profile forms. Tick the roles
  that should answer these questions.
- A form goes live only after you open it and click **Publish registration**.

---

## 2. How a player gets registered and onto a team

### Steps every player goes through

The sign-up link walks the player through these screens, in order:

1. Choose how to register
2. Division (only if there are two or more)
3. Account
4. Details
5. Parent consent (only for a minor)
6. Waivers
7. Price
8. Review
9. Payment
10. Done

How the registration's status moves along:

1. Starts as **Pending payment**. For a minor it starts as **Waiting for
   parent consent**, then becomes Pending payment once the parent confirms.
2. On the Payment screen the player chooses one of two buttons:
   - **Pay**: the status becomes **Pending review**.
   - **Submit for offline payment**: the status becomes **Pending
     offline**, and an invoice is created.
3. The admin opens **Registrations**, then **Review submission**, then
   **Approve** or **Reject**. Approve works only on Pending review or Pending
   offline.
4. On approval, the player gets the player role. They join a team if one
   was chosen, or the free-agent pool if they registered as a free agent.

### Way A: the player registers directly (Player)

1. Opens the season's sign-up link and picks **Register as a player**.
2. Goes through the screens above.
3. If the link came from a team, they join that team when approved.
4. If not, after approval they open **My registrations → Find a team** and
   click **Apply** on a team. Way D then follows.

### Way B: the captain sends an invite (Captain, then Player)

1. **Captain** opens **Invite players**, picks the season, and sends either:
   - a personal email invite, or
   - a team link.
2. **Player** opens the invite, signs in or creates an account, and accepts.
3. What happens next depends on the player's registration:
   - **Approved for the season**: on the roster now.
   - **Submitted and waiting for approval**: joins the team when approved.
   - **No registration yet**: taken to the sign-up with the team already
     filled in, then the steps above.

### Way C: free agent (Player, then Captain)

1. **Player** picks **Free agent** on the sign-up, or opens **Join the
   free-agent pool**.
2. Pays, and the admin approves. The player is now in the pool.
3. **Captain** opens **Free agents** and clicks **Offer a spot**.
4. **Player** accepts. They join that team, and offers from other teams are
   withdrawn.

### Way D: the player asks to join (Player, then Captain)

1. **Player** clicks **Apply to join** on a team.
2. **Captain** opens **Join requests** and clicks **Approve** or **Reject**.
3. The same rule as Way B applies: an approved registration joins now;
   otherwise the player is asked to register first.

### Returning player

1. Signs in from **Already have an account?** on the sign-up. Their details
   are filled in.
2. An unfinished registration shows **Resume your registration** on their
   home page.

---

## 3. A captain registering a team

### Route 1: new team, through the sign-up (Captain)

1. Opens the season's sign-up link and picks **Register a team**.
2. Enters the team name and colour.
3. Pays.
4. **Admin** approves the registration. This creates:
   - the team;
   - its place in the division;
   - the captain role.

### Route 2: team already exists, from the team app

1. **Captain** opens **Register the team**, picks the open season, and
   clicks **Apply for this division**. While it waits, the captain can still
   withdraw it.
2. **Admin** opens **Team applications**. The list defaults to **Needs
   your decision**. Click **Approve**, or **Reject** with a reason.
3. **Captain** sees "Application approved" and clicks **Set up roster &
   dues**. The wizard has four steps:
   1. Confirm the team
   2. Division
   3. Roster: invite players by email
   4. Split the team dues: the total must match the fee
4. Each invited player follows Way B above.

On Team applications, a row marked **Approved · captain setting up dues**
needs nothing from the admin. The captain acts next.

---

## 4. Scheduling (Super admin or Org admin)

1. **Rinks & ice time**:
   - add each venue and its ice surfaces;
   - add ice slots, one at a time or as a weekly pattern;
   - tick **Playoff ice** on any slot held for playoffs.
2. **Schedule** → **Generate** on the season.
3. On the Generate page, click **Add blackout** for dates with no games
   (all rinks or one rink).
4. Pick a division, set games per pair and the maximum games per week, then
   click **Generate**. This replaces earlier draft games.
5. Check the result:
   - **Conflicts**: overlapping games; use **Resolve**, then **Apply**.
   - **Fairness**: click **Compute**.
   - **Runs**: earlier attempts.
6. Click **Publish**. It appears after a successful run. Teams are emailed
   and rinks are notified. Publish does not check for open conflicts, so
   clear them first.
7. **Playoffs**: click **Generate bracket**. This needs enough Playoff ice
   slots. Then click **Publish playoff games**.

---

## 5. Why ShPl2 could not be approved

ShPl2 is **Pending payment**: the player started registering but has not
reached the Payment screen. There is nothing for an admin to approve yet.

- The player opens **Resume your registration**, then clicks **Pay** or
  **Submit for offline payment**.
- The row then moves to **Pending review** or **Pending offline**, and
  **Approve** works.

The Submissions list and the Registrations list no longer show Approve on
such rows. They say **Waiting for player to pay** instead.

There is no admin button today to record a payment or waive the fee for a
Pending payment registration. That is a known gap; see the release note.
