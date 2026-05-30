# Avario Available — team-facing self-serve ice request

URL: `/Available/Available.aspx`. Page title: "Available".

This is **the team manager's surface**: a team picks an available
unassigned event from the league's pool and submits a request to
take it. The league reviews and approves the request, which moves
the event into the team's schedule.

It's the only operator-facing tab that's primarily a
**team-self-service** surface — every other tab is for the league
scheduler.

## Top bar — team selector

A dropdown with **every team in the season** is at the top. The
operator (who is logged in as a league admin) is "spoofing" the
team's view here — in production, a team manager logs in and sees
their team pre-selected. The dropdown lets the league scheduler
test/preview as any team. From the snapshot, ~160 teams are
selectable.

## Page sections

### Pending Requests (top)
- Heading: "Pending Requests"
- Helper text: *"Final event availability will be confirmed upon
  submitting the request."*
- **Submit Requests** button (disabled when zero events selected)
- Empty state: "No Events Requested"

### Available Events (below)
- Heading: "Available Events"
- Refresh + Eraser action buttons
- Filter bar:
  - **Week Start** — calendar with `<<` / `>>` week navigation
    (defaults to next Monday, value seen: `05/25/2026`)
  - **Location(s)** — multi-select
  - **Time Range** (from / to)
  - **Duration Range** (from / to, default 60 / 60 = 60-minute slots)
  - **Day of Week** — Mon/Tue/Wed/Thu/Fri/Sat/Sun/Weekdays/Weekend
  - Page size: 10 / 25
- **Request Selected** button — submits the selected events as
  requests (which become pending)
- Empty state: "No Events Available for Display. Please update the
  filter criteria above."

## Key observations

1. **Week-paged, not date-range.** Unlike the Schedule tab which
   filters by arbitrary date range, Available is **week-locked** —
   request flows happen at week granularity. This mirrors how rinks
   actually open up ice: weekly drops.
2. **Default Duration 60–60** says "show me 60-minute slots." Most
   adult-rec slots are 60 min; tournaments / specialty might want
   longer. The duration range is a way to filter to "just the
   normal stuff."
3. **Two-stage flow**: select events → click "Request Selected" →
   they move to "Pending Requests" (now editable as a batch) →
   click "Submit Requests" → batch goes to the league for
   approval. Letting teams curate a basket before submitting
   reduces back-and-forth.
4. **Final availability confirmed upon submission** — the helper
   text warns this is **soft-locked**, not hard-reserved at
   selection time. Another team could submit for the same event
   between your select and your submit. The race is resolved at
   submit time.
5. **No price shown in this view.** A team picks the slot; price is
   probably attached at the event level (per-event cost we saw in
   Payment module). Worth verifying — teams must know cost before
   committing.

## Question-marks
- Where does the **approval** of a Pending Request happen? Likely
  in a league-admin-only inbox we haven't surfaced yet. Either in
  the Schedule tab (unassigned → assigned to a team) or under a
  notification/inbox surface.
- Is there a **request expiry / TTL**? Submitted-but-not-approved
  requests presumably can't sit in limbo forever blocking the
  event.
- Can a team **withdraw** a submitted request? Or is it terminal
  once submitted?

## SportsPulse equivalence

We don't have anything in this shape. We have:
- A schedule with assigned events (admin-driven)
- No "browse-and-request" pool

To ship:

- **New table** `ice_requests`:
  - id, team_id, event_id, requester_user_id, submitted_at,
    state (pending | approved | denied | expired | withdrawn),
    decided_by_user_id, decided_at, decision_note
- **New `events.state` value**: `available` (in addition to
  `assigned`, `unassigned`, `cancelled`). Available events are
  visible to teams in the Available view.
- **Team-admin-web `/ice/available` page** (mirroring Avario's
  layout):
  - Week-paged grid
  - Filter bar (locations, time range, duration, day of week)
  - Multi-select rows
  - "Add to Basket" → "Submit Request"
  - Pending requests panel up top (per-team)
- **Admin approval UI** in superadmin-web:
  - New section under Schedule: "Pending Ice Requests"
  - Per-row Approve / Deny buttons
  - Approve flips the event from `available` → `assigned` with
    the requesting team as the assignee
- **Race resolution**: pessimistic lock on event row when
  approving; if another team's request was already approved,
  current request auto-transitions to `denied` with
  decision_note = "Slot taken by [team]".
- **Request expiry**: cron job marks pending requests older than
  72 hours as `expired`, frees the event.
- **Notifications**: notify team manager on approve/deny;
  notify league scheduler on new pending request.
