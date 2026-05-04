**Sports Pulse Key Workflows:**

Drafted below is a list of key workflows that are a candidate for a workflow diagram

- Player Registration & Approval
- Schedule Generation & Publishing
- Game Day Scoring & Finalization
- Payment & Invoicing

## Free Agent Registration & Assignment

- Substitution Request (Goalie911)
- Compliance (Waiver + Consent + Eligibility Approval)

A few additional key workflows being captured for brevity

# **League Admin - Create Season, Sub-Leagues, Divisions and Teams**

- - Company Creation (e.g. PPHL)
    - League Creation (e.g. Watertown A Division, Boston B Division - Sport!)
    - League Admin Creates a Season/Division (core setup process).
- **Referee Assignment & Confirmation** (covers UC-30).
- **Video Workflow** (live stream + highlights).
- **Merchandising Workflow** (auto-store creation -> player order).
- **Communication Workflow** (announcements, team messages, auto game-change alerts).
- **Multi-Team/Family Dashboard Workflow** (aggregating multiple schedules).

# **1: Player Sign Up, Registration & Approval**

### **Actors:**

### **Player** (or Parent/Guardian if minor), **System** (Sports Pulse platform), **Payment Gateway** (Stripe/PayPal/etc.), **League Admin** (for eligibility review), **Team Captain** (when invite-based registration applies)

### **Workflow:**

- **Player Initiates Sign Up  
   **
  - Player (or parent) clicks "_Sign Up"_ on the portal.

- **Account Handling  
   **
  - If it is a new user, then create an account (email/phone verification).
  - If it is an existing user, "Login".

- **Profile & Details Entry**

Player or parent (in case of minors) enters:

- - **Personal info (required):**
- Name\*, DOB\*, Gender\*, photo/avatar, Email/Phone, Address
- Emergency contact and phone
  - **MInor Specific:**
- Parent or guardian details info collected. (name, email, phone, relationship, custody notes (optional)).
  - **Eligibility Details:**
- USA Hockey ID (or governing body ID)\*
- Expiry date\*
- Level (A/B/C/D), Position(s), Shot hand(L/ R), Jersey # preference
- Height/weight (optional), Handedness
- Medical/allergy notes (optional, minimal)

System then stores the profile as **"Pending Eligibility Review."**

League Admin reviews and marks player as **"Active"** if eligible.  
Only **Active** players can proceed to registration.

- **Profile & Details Entry**

Player can start registration in two ways:

#### **A. From Dashboard (Self-Registration)**

- Player clicks registration link.
- Chooses: League → \[Sub-League\] → \[Division\] → Team.

#### **B. Invite-Based (Captain/Admin Invite)**

- Player clicks on the shared invite link.
- Directed to the appropriate team/division.
- Registration flow continues from there.

- **Waiver & Consent**

System presents:

- Code of Conduct
- Liability waiver
- Photo/media consent
- Required documents (age/residency proof if needed)

Player (or parent for minors) must digitally sign.

**Decision** → Waiver Signed?

- Yes → Continue
- No → Blocked

- **Payment**

System calculates invoice based on:

- League type (Normal vs Draft)
- Account type (Returning vs New)
- Division fees
- Team fee split (if captain is dividing dues)

Player selects payment option:

- Full
- Installments
- Offline/manual

Payment sent to **Payment Gateway**.

**Decision → Payment Success?**

- Yes → Continue
- No → Status = _Pending Payment_

- **Payment**

System verifies:

- Age/division fit
- Duplicate accounts
- SafeSport cert / ID docs (if required)

Player status becomes: **Pending Admin Review  
**Team Captain and League Admin see the request in the dashboard.

###

- **Admin & Captain Approval**

- League Admin approves/rejects eligibility.
- Captain approves/rejects team join request (if team invite flow applies).

If **Rejected**:

- Refund credited to player account.

If **Approved**:

- Proceed to confirmation.

###

- **Confirmation and Activation**

- System sends confirmation (email/SMS).
- Player added to:
  - Team roster **OR**
  - Free agent pool

## **Decisions:**

- Waiver Signed?
- Payment Successful?
- Eligibility Pass?
- Admin/Captain Approval?

(Placeholder for visual workflow diagram)

##

##

##

##

##

## **2: Scheduling**

### **Actors:**

### League Admin, System (Scheduler Engine), Captains / Players, Referees

Player preference, rink availability, league times.

### **Dependencies:**

### Rink availability, Blackout dates, League times, Player/team preferences, Max games per week, Home/away balance, Conflict rules

### **Workflow:**

- **Admin Initiates Scheduling**

Admin selects **Season → Division.**

Click **"Generate Schedule".**

- **Enter Constraints & Availability**

Admin provides:

- Rink availabilities & time slots
- Blackout dates
- Scheduling rules:
  - Max games/week/team
  - Home/away balancing
  - Player/team availability (if supported)

If system cannot retrieve availability/settings, then  
Admin must proceed with **manual scheduling only**.

- **System Auto-Generates Schedule  
   **
  - Scheduling engine runs algorithm
  - Produce a draft schedule.

- **Decision: Conflicts Detected?  
   **
  - **No** -> Proceed to admin review.
  - **Yes** ->

System flags unresolved issues:

- Double-bookings
- Time collisions
- Missing rink slots
- Unassigned games

Admin may:

- Manually adjust
- Mark as _Unscheduled_ for correction later

- **Admin Reviews Draft Schedule  
   **
  - Admin checks draft schedule presented for review
  - Validates key games for:

- Rivalries
- Prime-time games
- Fair distribution
- Travel timing (optional)

- **Manual Adjustments  
   **
  - Admin manually edits individual games.
  - Admin edits:
    - Game times
    - Dates
    - Rinks
  - System validates changes & prevents new conflicts.

If rink/calendar data missing →  
Admin handles conflict resolution manually.

- **Publish Schedule  
   **
  - Admin approves and publishes the schedule.
  - Schedule becomes visible on league portal.

- **Notifications Sent  
   **
  - Players, captains, referees automatically notified of their upcoming games.
  - Calendar sync links updated (Google/iCal).

### **Decisions:**

- **Are there scheduling conflicts?  
   **
  - If yes -> flag and manual adjustment required.
  - If no -> proceed to review.

- **Does admin approve draft?  
   **
  - If yes -> publish.
  - If no -> adjust manually, then re-approve.

### **End State**

- Published schedule visible to all stakeholders.
- Notifications sent and logged.

**Note**: If the rink availability, scheduling rules, black-out date info can't be retrieved for any reason, the conflict resolution has to be handled manually by the Admin and the scheduling has to be handled manually.

(Space for visual workflow diagram)

## **3: Game Day Scoring and Finalization**

### **Actors:**

Scorekeeper, Referee, **Captain** (attendance + referee rating), System (Stats Engine), Players / Captains/ Spectators (view results), League Admin (optional oversight)

### **Workflow:**

- **Pre-Game Setup**

Scorekeeper logs into the system (tablet/laptop).

Selects the scheduled game from the fixture list.

System loads:

- Rosters
- Assigned referees
- Blank digital scoresheet

Captains take player attendance:

- Mark present/absent players
- Identify substitutes
- System updates no-show rate tracking per player/team

- **During Game: Event Logging**

Scorekeeper records events live:

- Goals (scorer, assist(s), timestamp)
- Penalties (player, infraction, duration)
- Goalie changes
- Shots on goal, saves
- Other stats (if enabled):
  - Games Played, Goals, Assists, Points, PIM
  - +/- , GWG, Faceoff %, Blocked Shots
  - Goalie stats: Minutes, Saves, Shots Faced, GA, SV%, GAA
  - Advanced (optional/extensible): xG, CF%, etc.

Events appear live for:

- System backend
- Spectators (if live stream or scoreboard enabled)

- **Decision: Is Device Online?**
  - **Yes** → Events sync in real-time to backend.
  - **No** → Events cached locally and auto-synced when back online.

- **End of Game**
  - Scorekeeper submits final tallies.
  - Captain can **rate the referee** with optional reason/comment.

- **Referee Review & Finalization  
   **
  - Referee reviews all logged events on digital scoresheet.
  - **Decision Point: Approve?**

- Yes → Digitally signs & confirms
- No → Sends back to scorekeeper for correction

- **System Locks Scoresheet**
  - Once finalized, scoresheet locked from further editing.
  - Status = _Official Result_.
  - No further edits allowed (unless admin override)

- **Stats Engine Updates  
   **

System updates:(points, penalties)

- Player stats
- Goalie stats
- Team statistics

Standings recalculated

Leaderboards refreshed

**If playoff game**:

- Stats stored under **playoff-only records**
- Regular season averages remain unchanged or unimpacted

- **Notifications & Publishing**

Final game result published to:

- League website
- Team dashboards
- Mobile app (if applicable)

Notifications sent to:

- Players
- Captains
- Spectators / fans (if subscribed)

### **Decision:**

**Is device online?**

- Sync now vs cache locally

**Did referee approve scoresheet?**

- Approve → finalize and lock
- Reject → return to scorekeeper

### **End State**

- Official game result stored and published.
- No-show rates recorded
- Stats updated across players, teams, and league standings.
- Immutable audit trail of events and referee confirmation.
- Finalized scores visible to all authorized users

(Space for visual workflow diagram)

## **4: Payment & Invoicing**

### **Actors:**

Player / Parent (payer), Captain (splits dues among team members)), League Admin(oversight, refunds, manual adjustments), System (Billing Engine), Payment Gateway (Stripe, PayPal, etc.)

### **Workflow:**

- **Invoice Creation  
   **
  - Triggered by:
    - Player registration
    - Team dues
    - Manual admin-created invoice
  - System generates invoice → assigns to **player or team**
  - Initial status: **Pending Payment**

- **Invoice Notification  
   **
  - Player/Parent (or Captain for team dues) notified via email/SMS/app.
  - Invoice visible in dashboard.

- **Payment Attempt  
   **
  - User selects payment method (credit/debit, wallet, installments, offline).
  - System passes request to payment gateway.

- **Decision: Payment Successful?  
   **
  - **Yes** -> Payment gateway confirms transaction.
    - System updates invoice status = _Paid_.
    - Player/team status becomes Active.
    - Confirmation sent to payer.

  - **No** -> Payment fails
    - System logs failure.
    - Status remains _Pending Payment_.
    - Reminder scheduled.

- **Team Dues Split (if applicable)  
   **
  - Captain splits dues:
- Evenly OR custom per player
  - System generates **sub-invoices**.
  - Players notified to pay their share.
  - System tracks:
- Amount paid
- Outstanding balances

- **Refunds or Credits  
   **
  - Trigger: Admin approves refund/credit request
  - Admin selects invoice or transaction

Two outcomes:

- **Refund** → sent through gateway to original payment source
- **Credit** → applied to player's in-app wallet
- System logs transaction

- **Overdue Reminders**

System runs daily job:

- Identifies overdue invoices
- Sends reminders automatically
- Applies late fees (if configured)

- **Admin Oversight  
   **
  - Admin dashboard displays:
    - Paid / Overdue / Partial / Canceled
  - Admin can manually override:
    - Mark invoices as paid
    - Cancel invoices
    - Apply discounts, extensions, or waivers

### **Decisions:**

- Did payment succeed?
- Has full balance been settled (player or team)?
- Refund or credit if payment reversed?

### **End State**

- Invoice fully or partially settled.
- Payment status stored with audit trail.
- Player/team financial status updated accordingly.
- Refunds and credits logged.

(Space for visual workflow diagram)

## **5A: Free Agent Registration & Assignment**

### **Actors:**

Player (Free Agent), Captain, League Admin, System (Roster Engine/ Registration module), Payment Gateway (optional)

### **Workflow:**

#### **1\. Free Agent Registration**

## Player selects

→ League → Sub-League → Division

## Chooses: **Free Agent option**

## **No payment required at registration**

## Enters

## Preferred position ranking (e.g., 1. Goalie, 2. Forward)

## Availability (days/times)

## Skill level

## System adds player to \*\*Free Agent Pool

\*\*

#### **2\. Captain Requests Full-Time Player**

## Captain browses free agent pool

## Filters by

## Position needs

## Skill level

## Availability

## Captain selects candidate & submits request

#### **3\. Admin Approval**

## Admin approves or denies the request

## If **denied** → Captain chooses another free agent

## If **approved** → move to assignment

#### **4\. Payment Handling (Optional)**

## Captain chooses

## Charge free agent for remaining games

## OR waive charges

## If he has to be charged

## Invoice generated

## Free agent pays

## Funds applied to team total

#### **5\. Roster Assignment**

## Free agent added as **full-time player**

## Team roster updated accordingly

### **Decisions:**

## Does admin approve free agent assignment?

## Does captain choose to charge the player?

## Does payment complete?

### **End State**

## Free agent becomes a **full-time rostered player**

## Payment (if any) recorded

## Player removed from free agent pool

## Assignment logged

##

##

## **5B: Substitution Request (Goalie911)**

### **Actors:**

Captain, Substitute Player (Pool Member), System (Roster Engine), League Admin (optional oversight), Payment Gateway (if charging subs)

### **Workflow:**

#### **1\. Trigger: Need Identified**

- Captain sees missing player (injury, conflict, absence)
- Opens game details → clicks **Request Substitute**

#### **2\. System Filters Eligible Substitutes**

Filters include:

- Positioning in the match (goalie/forward/defense)
- Skill level
- Availability
- Past performance metrics
- No-show rate

#### **3\. Captain Sends Request**

Options:

- Direct request to selected players  
   **OR**
- Broadcast to pool with criteria

System sends notifications:

- Email / SMS / In-App

#### **4\. Decisions:**

#### **Substitute Responds?**

- Accept → Added temporarily to roster
- Decline → Captain requests another
- No reply → Reminders or admin escalation

#### **5\. Captain Confirms or Rejects Substitute**

- Captain sees substitute's:
  - Performance history
  - Position fit
  - No-show rate
- Captain accepts or tries another subs

#### **6\. Payment (Optional)**

Captain may choose to:

- **Charge per game**
  - Substitute pays via portal
- **No charge**
  - Skip the payment step

#### **7\. Roster Update**

- Substitute added as a **part-time player**
- Marked as temporary for that game
- **Lockout rule:** No roster edits within 4 hours of game

#### **8\. Admin Oversight (Optional)**

- Admin notified
- Can override, reject, or track substitution

#### **9\. Post-Game Tracking**

- No-show recorded if sub doesn't appear
- Stats tracked and stored under substitute history
- If the same sub plays **3+ games** with a team → he is eligible for **playoffs  
   **

### **Decisions:**

- Did substitute accept or decline?
- Does sub meet league eligibility rules?
- Is the request before roster freeze?
- Charging or not?
- Has sub played atleast 3 games (playoff rule)?

### **End State:**

- Substitute added to roster for game
- Payment status recorded (if applicable)
- Compliance + audit tracking updated
- Performance and no-show stats logged

(space for visual flow diagram)

# **7: League Admin - Create Season, Sub-Leagues, Divisions and Teams**

# **Actors:**

Org Admin / League Admin, System (League Management Engine)

## **Assumptions:**

- Organization exists (PPHL).
- Admin has appropriate permissions.
- Base organization settings are configured.

## **Workflow**

### **1\. Organization and Admin Setup**

- Org Admin onboarded to the platform.
- Admin is granted controls for:
  - Creating seasons, sub-leagues, and divisions
  - Adding teams
  - Managing schedules & rulesets
  - Approving rosters & scoresheets
  - Taking any disciplinary actions
  - Making financial adjustments
  - Posting announcements / content

### **2\. Create Season**

- Admin launches Admin Dashboard → selects **Create Season**
- Admin inputs **season metadata**:
  - SeasonName (eg. "2025 Winter")
  - Year
  - Season Start date & End Date
  - Registration window
- System assigns a unique identifier, a **Season ID** for this season

### **3\. Create League / League Page**

- Admin selects **Create element**
- Admin chooses **Element Type**:
  - General
  - League
  - Club
  - Link
  - Team

- Admin selects **League** and enters the **League Metadata**:
  - Name
  - Shortform
  - Gender
  - Tier
  - Sport
  - Season type
  - Standing type
  - Color scheme
  - Logo
- Admin selects **Regular Season** or an alternate season type
- Optional: Admin can keep page **Private** (Draft) or **Publish  
   **

System generates: A unique Identifier for League (a **League ID)** which is linked to **Season ID**

### **4\. Create Sub-Leagues (Optional)**

- Admin repeats League Page creation steps to add sub-leagues.
- Sub-leagues inherit rules/settings of the League, but may override.

System generates: **Subleague ID**, associated with **League ID**.

### **5\. Create Divisions**

- Inside a league or sub-league, Admin clicks **Create Division**
- Admin enters:
  - Division Name
  - Age group / Skill level
  - Max teams
- System generates: **Division ID,** a unique identifier for the created Division.

### **6\. Configure Division Rules & Settings**

Admin defines:

- Playoff format
- Game frequency
- Roster lock date
- Blackout dates
- Max roster size
- Eligibility rules

These Rule(s) shall be stored as a **rule-set**

### **7\. Add Teams Inside Division**

- Admin clicks **Create Team**
- Enters:
  - Team name
  - Short name
  - Gender
  - Colors
  - Logo

- System creates: **Team ID,** a unique identifier for the created team and it is linked to the **Division ID**

(Optional) Admin designates **Team Managers/Captains**

### **8\. Rink / Resource Availability**

- Admin enters rink availability or syncs rink schedule
- Used later for scheduling

### **9\. Configure Roles & Permissions**

Admin as well defines:

- Who can:
  - Create the teams
  - Approve the rosters
  - Manage the scoresheets
  - Post the announcements

System applies role-based access.

### **10\. Validation**

System checks for:

- Conflicting season or division dates
- Overlapping blackout windows
- Rule collisions

**Decisions: Any Conflicts?**

- No → Proceed
- Yes → System highlights issues → and Admin resolves them

### **11\. Save or Publish**

Admin chooses:

- **Draft Mode** → Not visible to public
- **Publish / Go Live**

System creates:

- Season
- League / Sub-League
- Division
- Teams

Along with:

- Default notifications
- API hooks
- Placeholder for scheduling & registration

## **Decisions:**

- **Are there any rule/date conflicts?**
  - Yes → Must resolve before publish
- Draft vs Published Season?
- Are sub-leagues needed?
- Are teams created now or later?

## **End State / Data Created**

- Season ID, League ID, Subleague ID (if any), Division ID, Team ID
- Rule-set (global + division overrides)
- Registration & scheduling queues initialized
- Public or private visibility set

# **Workflow 6: Compliance (Waiver, Consent, Eligibility, Certification)**

### **Actors:**

### Player, Parent/Guardian (if minor), System (Compliance Engine), League Admin, Captain (Visibility Only), Governing Body APIs (optional, e.g., USA Hockey)

## **Workflow:**

### **1\. Trigger: Registration or Roster Assignment**

Compliance is enforced when:

- Player registers for season/division/team
- Player is added as substitute or free agent
- Player updates expired documents
- Governing body ID expires

### **2\. Waiver & Conduct Agreement**

System displays required waivers:

- Liability waiver
- Code of conduct
- Media/photo release
- Concussion / injury policy (if applicable)

**Decision Point → Waiver Signed?**

- Yes → Proceed
- No → Registration blocked

Digital signature includes:

- Timestamp
- Name/role
- IP/device
- Stored in compliance log

### **3\. Parental Consent (if Minor)**

If DOB < 18:

- System identifies required guardian approval
- Parent/Guardian signs:
  - Participation consent
  - Media consent
  - Medical acknowledgment

**Decision: → Consent Provided?**

- Yes → Proceed
- No → Blocked & reminders triggered

### **4\. Eligibility Verification**

Players complete eligibility data:

- Governing body ID (e.g., USA Hockey #)
- Expiry date
- Division-appropriate age range
- Skill level / tier
- Position or gender restrictions (if applicable)

**Optional:** System queries governing body via API

**Document Upload:**

- Birth certificate / age proof
- Residency (if required)
- SafeSport / Respect in Sport certificate
- Government-issued ID (if necessary)

### **5\. Admin Compliance Review**

League Admin reviews flagged or required submissions:

- Validates uploaded documents
- Approves or rejects
- Adds comments if corrections needed

**Decision Point → Eligibility Approved?**

- Yes → Status: **Eligible / Active**
- No → Status: **Pending / Rejected**, player notified

### **6\. Automated System Rules**

System checks for:

- Expired certifications
- Duplicate accounts
- Division-age mismatch
- Max roster size
- Substitution/game eligibility

If any violation triggered:

- Player marked **"Ineligible"**
- Admin alerted
- Captain sees blocked status

### **7\. Final Confirmation**

Upon completion:

- Compliance record stored (immutable)
- Player:
  - Added to roster OR
  - Added to free agent pool OR
  - Added as approved substitute

Audit log includes:

- Signed waivers
- Consent forms
- Admin approvals
- Document metadata

### **8\. Ongoing Compliance Monitoring**

System runs scheduled audits:

- Governing body ID expiry
- Missing certifications
- Outdated waivers
- Roster freeze rules
- Playoff eligibility (min games played)

If non-compliant:

- Player flagged
- Captain & admin notified
- Playoff/game lockouts enforced

## **Decision:**

- Has player signed all required waivers?
- Is parental consent required and provided?
- Are eligibility documents valid and approved?
- Is the player within division rules (age, skill, gender)
- Do certifications meet minimum standards?
- Has roster freeze or playoff eligibility rule been violated?

All records include:

- Digital signature
- Timestamp
- IP/device
- Admin actions (if any)
- Immutable audit trail

# **Workflow 8: Referee Assignment & Confirmation**

**Actors:** System Scheduler, Referee Assignor (Admin), Referee (User), Notification Service

**Preconditions:** Games scheduled; referee pool populated with availability/certification levels.

**Workflow narrative:**

- System (auto job) or assignor initiates referee assignments for an upcoming date range.
- System fetches unassigned games and available referees (filter: certification, distance, skill).
- System runs matching algorithm to propose assignments (primary + backups).
- Assignor reviews proposed assignments in dashboard and may tweak (swap/refine).
- System sends notification to assigned referee(s) with game details and request to confirm.
- **Decision:** Referee responds (Confirm / Decline / No response).
  - **Confirm:** Assignment locked; system adds to referee calendar.
  - **Decline:** System marks referee unavailable for that slot and finds next candidate (go back to step 3 for that game).
  - **No response:** System retries per retry policy (e.g., 1 hour later) and then escalates to assignor if still unfilled.
- System provides assignor a dashboard showing assignment statuses (confirmed, pending, declined, unfilled).
- For last-minute cancellations, a rapid reassign flow flags substitute refs and notifies them.

**Decision points**

- Does matched referee confirm?
- If decline/no-response → auto-reassign or escalate to manual.

**End state / data updated**

- game_id → referee_id mapping with confirmation timestamps; calendar events; notification logs.

# **Workflow 9: Video: Live Streaming & Auto-Highlights**

**Actors:** Rink/Streaming Provider (hardware), System (Video Service), Scorekeeper/System Events, Viewer (fan/player), Admin/Moderator

**Pre-conditions:** Rink camera/account configured; streaming provider integrated; game scheduled and streaming enabled.

**Workflow narrative:**

- Pre-game: System verifies stream link (RTMP/RTSP or provider token) is active and tied to game_id.
- At start time, streaming feed begins (auto or manual start). System embeds stream on team/game page.
- Scorekeeper logs events in real time. When a goal or key event occurs, the scoresheet generates an event timestamp.
- **Auto-Highlight Trigger:** Video service receives event timestamp and clips a pre-defined window (e.g., 10s before -> 15s after).
- System transcodes clip into web-friendly formats and generates a thumbnail.
- Clip metadata is linked to player(s), game, and team pages; access permissions applied (public/team/subscriber).
- If pay-per-view is configured, the system checks viewer access before playback.
- Users can share, save to personal highlights, or flag for moderation.
- Admins/moderators can review flagged clips and take action (remove, edit visibility).
- After the game, full recording persisted in media storage and index updated for search.

**Decision points**

- Is streaming feed healthy? (Yes -> continue; No -> notify admin and optionally fall back to recorded upload.)
- Is the clip auto-generation successful? (Yes -> publish; No -> queue for manual clipping.)

**End state / data created**

- stream_url, highlight media_id records, access policies, view analytics.

# **Workflow 10: Merchandising - Auto-Create Team Store → Player Order**

**Actors:** System (Merch Service), Admin/Captain, E-commerce Provider (Shopify), Player/Parent (Buyer)

**Preconditions:** Team roster finalized; merchandising integration configured (API keys).

**Workflow narrative:**

- Admin/Captain triggers "Create Team Store" or platform auto-creates based on roster finalization.
- System generates a product catalog template (jerseys, hoodies, caps) with team branding assets and personalization fields (name/number).
- System pushes catalog to e-commerce provider via API and creates team store (or populates an existing one).
- Team store link appears on the team page; notifications sent to roster.
- Player/Parent visits store, selects items and personalization options.
- Checkout handled by e-commerce platform (payments, shipping).
- Order confirmation and fulfillment tracking sync back to Sports Pulse (order_id, status).
- System logs purchases for accounting and optional group order aggregation (for bulk discounts).
- If inventory or sizing issues occur, store displays backorder or pre-order info; system notifies buyers.

**Decision points**

- Does API sync succeed? (Yes -> store live; No -> retry/log and notify admin.)
- Is personalization data valid? (Yes -> proceed; No -> error to user.)

**End state / data created**

- store_id, product SKUs, order_id records, fulfillment status, financial reconciliation records.

# **Workflow 11: Communication- Announcements, Team Messages, Auto-Game-Change Alerts**

**Actors:** Admin, Captain, System (Notification Service), Recipient Users (Players/Parents/Refs), Moderation Service

**Preconditions:** Contact info and notification preferences set for users.

**Workflow narrative:**

- Admin/Captain composes message in the messaging UI (select audience: league/division/team/individual).
- System performs audience resolution (collects recipient contact channels and opt-outs).
- Admin selects channels (email, SMS, push, in-app). Optionally schedule send time.
- System performs content checks (length, template variables). If content moderation is enabled, message may be queued for review.
- System sends message via channel providers, with retry policies and fallback channels for failures.
- For event-driven messages (e.g., game change), the system automatically composes templated messages and triggers delivery to affected users.
- Delivery logs and read receipts are stored; admins can view delivery analytics.
- Recipients can reply to certain message types (team chat) - replies routed back to sender or team thread.
- If channel fails repeatedly, system escalates to admin with error logs.

**Decision points**

- Is recipient opted out of a channel? (Yes → use alternate channel; No → send.)
- Does message require moderation? (Yes → hold; No → send.)

**End state / data created**

- Notification logs, delivery status, read receipts, message threads for team communication.

# **Workflow 12: Multi-Team / Family Dashboard (Aggregate View)**

**Actors:** Parent/Guardian, Player (multi-team), System (Dashboard Service)

**Preconditions:** Parent/guardian account linked to multiple player profiles; players registered on teams.

**Workflow narrative:**

- Parent logs in and opens "Family Dashboard."
- System fetches linked player profiles and their team/season assignments.
- System aggregates schedules, payments, and notifications for all linked players.
- Dashboard displays a combined calendar view (color-coded by child/team) and consolidated payment summary.
- Parent can filter view by child, team, or date range and export combined calendar (iCal/Google).
- Parent can set universal notification preferences or customize per child/team.
- If schedule conflicts exist between children (overlapping games/practices), system highlights conflicts and optionally suggests swapping/backup options (if integrated).
- Parent can also initiate payments for multiple players from a single checkout flow (batch payment), or split across cards.
- System logs all family-level actions (exports, payments) in audit trail.

**Decision points**

- Are there schedule conflicts between linked players? (Yes -> show conflict resolution suggestions; No -> normal display.)
- Does parent choose to pay consolidated invoices? (Yes -> combined payment flow; No -> individual payments.)

**End state / data presented**

- Unified calendar, consolidated financial view, conflict highlighting, export links, and action history.