# Competitor information architecture: SportsEngine and alternatives vs SportsPulse

Written 2026-10-25 on branch `pphl-journey-fixes`. Research only: no app code, tests or data were changed. Nothing here is committed.

**Why.** PPHL (adult ice hockey, on SportsEngine today) said they "could not understand the flow" of our apps: "so many modules and subdomains" (quoted in `apps/superadmin-web/src/components/layout/sidebar.tsx:44` and `apps/landing-web/src/app/sign-in/page.tsx:16`). This document reconstructs how SportsEngine HQ, its mobile app and the closest alternatives name things, group navigation and walk the main flows, then contrasts it with our four sidebars and sign-in entry, and proposes a release-1 navigation that a SportsEngine operator will recognise.

**Inputs.** `doc/traceability/benchmark.md` (2026-10-24; its SportsEngine sources are reused, its capability matrix is not redone), the four sidebars, the landing CTA and `/sign-in` chooser (commit f0764ee, 2026-10-25), the admin home (commit f3d70d9, 2026-10-25), and `rg -n "eyebrow=|title=" apps/*/src/app --glob page.tsx` for page vocabulary.

**Evidence levels.** `[fetched]` = the page was opened on 2026-10-25 and states the label or step. `[snippet]` = seen only in a search-result excerpt of that article (the article itself was not opened). `[unverified]` = title only, inferred, or the page could not be opened. Menus are never invented: where SportsEngine's help centre quotes a path such as "Competition > Season Management", that is the evidence; where no article quotes a label, it is marked unverified.

**Shorthand.** `H<id>` = `https://help.sportsengine.com/en/articles/<id>` ; `M<id>` = `https://mobile-help.sportsengine.com/en/articles/<id>` ; `TS<id>` = `https://helpme.teamsnap.com/article/<id>`. Intercom resolves the id without the slug. Full URLs are in section G.

**One caution.** No SportsEngine help article lists the HQ left navigation as a whole. The tree in section A is reconstructed from the navigation paths that individual how-to articles quote. Top-level labels and their sub-items are verified; their **order** on screen is not.

---

## A. SportsEngine HQ navigation tree

### A.1 Entry and top bar

- Sign in at `https://user.sportngin.com/users/sign_in` or via "Sign In" in the upper-right corner of the organisation's website; email first, then password; "Forgot your password?" offers "Reset Password" or "Email Magic Link" (H6304015 [fetched]).
- After sign-in a member lands on the **User Dashboard** (`app.sportngin.com/user/...`) with left-hand tabs including "Schedule" (H6307083 [fetched], H6311290 [fetched]), "Teams" (H6306846 [fetched], H6311063 [fetched]), "Settings" with a "Communications Preferences" tab (H6304668 [snippet]) and "Household" (H6304756 [snippet]).
- The **SE Bar** (top bar on every SportsEngine site) has a "My Organizations" dropdown that lists the sites you are a member of and, under "My Teams", your teams and "View All Teams" (H2876176 [fetched], H6306846 [fetched]).
- Admins reach HQ by clicking the "HQ Home" icon at the top of the screen (H2876231 [fetched]). The platform is multi-tenant: "everything revolves around organizations" and an organisation id "is sometimes called an 'HQ'" (H9095679 [fetched]).

### A.2 Left navigation (labels verified; order unverified)

- **Home** (tab label from H10302706 [fetched]; what the page shows is not documented: [unverified])
- **Members**
  - **Directory** (H6310277, H6310404, H6304301 [fetched]) with a "People" tab and a "Groups" sub-tab (H6399293 [snippet], H6512275 [fetched]); actions: "Add Person", "Permissions > Edit" (H6304301), "Message" and "Send Invoices" on selected people or groups (H6310404), three-dot "Export people > Export Current View / Export Default View" (H6310277); Smart Groups update automatically (H6310404); filters "Memberships" / "Active Memberships", "Membership ID", "Membership Status", "Expiration Date" (H6346391 [fetched])
  - **Memberships**: "Add Memberships" wizard (name, price, validity, rules, eligibility requirements such as waivers, proof of birth, background screening; welcome email; purchase window) (H6310249 [fetched]); "View Active Eligibility" beside a membership (H6330288 [snippet])
- **Competition**
  - **Season Management** (H6694766, H7142159, H6345009, H6345474, H7198583, H6345513, H7198563, H6342522, H6887700 [all fetched]). Inside: a season list with "Add Season"; per season the row/tab labels **Divisions**, **Teams**, **Rostering**, **Schedule**, **Settings**; **Venues** "at the top of the screen"; three-dot menus offer "Scheduling assistant", "Score Games", "Scores & Stats", "Add Game" / "Add Event", "Send Message", "Final Roster Notifications", "Share Season Site", "Sync Changes"; the Schedule list view is where you "generate, score, import, or export games" (H6345474). Team side panel: Roster, "Message History" (H6345513).
  - **Sport Management** (legacy page-based tool; "Competition, then Sport Management, then ... click Seasons" H6313638 [snippet]; "Tool Settings" categories "Roster", "Game Schedule", "Statistics", "Standings" H6381027 [fetched]; comparison in H7202912, transition in H9859399 [fetched])
  - **Rostering** (legacy Rostering Tool: "Assign Players" / "Assign Staff" tabs, filters "Keywords", "Birthdate Range", "Gender", "Rostered Status", "Team", drag and drop onto the team) (H2876231 [fetched], H6381027 [fetched])
- **Registration**
  - **Registrations** (H6306794, H6417513, H6380779 [fetched]): list with tabs incl. "Under Construction/Review" (H6306794); "Create New Registration" in the middle of the page (H6380779); per registration: "Edit Registration" > "Show Advanced Options" (Status, "Which types of registrations should be allowed?", "Require Login?", "Management Fees", "Bank Account", "Open Date/Close Date", "Sell Store Items and Collect Payments?"), forms and questions, "Attach Sale Item", "Quick Reports" / "Saved Reports" (H6402397 [snippet]), "Registration Site" > "Enable Registration" and "User Mode" to test (H6306794)
  - **Request**: "Registration Request Form" sent to the Registration Team, who build paid sessions (H6306766 [fetched])
- **Programs**: "Add Program" > "Get Started" wizard: Program Settings, Participation Options, Participation Limits, Electronic Documents, Signup Settings, Payment Settings, Signup Fields, then "Share" the signup link (H6398158 [fetched]). SportsEngine calls the activity a *Program* and the entry a *signup*; the word Registration is not used there.
- **Financials**
  - **Sale Items** (H10753287 [snippet]); **Invoicing** with "Send Invoices" (H6512275 [fetched]); **Orders** (H7947372 [snippet]); **Discounts** > "Add Discount" (H6325766 [fetched]); financial reports "Overview", "Payout Report", "Receivables Report", "Sale Items Report", "Adjustments Report", "Payments Report", "Refunds Report" (H6342603 [fetched]; the exact sub-menu that opens the reports is [unverified]); "Financial Settings" is step 2 of HQ onboarding (H9066921 [fetched]; its menu position [unverified])
- **Settings > Organization Settings** ("Affiliation Access" module, "Listings" tab) (H10302706, H6345595 [fetched / snippet])
- **Go to My Website**: opens the Sitebuilder site; editing happens there with the "Edit Mode" toggle and the yellow "Admin > Tool Settings" dropdown (H6342201 [fetched], H2876176 [fetched], H6381027 [fetched])
- **Add-Ons**: appears as an article title ("What Are Add-Ons?", H10023943) in search; the page returned 404 on 2026-10-25: [unverified]
- **Not a top-level item**: there is no "Messages" entry. Messaging is launched from Members > Directory (person or group three-dot "Send message", H6399293 [snippet]) or from Season Management (team or division three-dot "Send Message", H6345513 [fetched]).

### A.3 How the help centre groups the product (proxy for module naming)

The "For Admins" collection (`https://help.sportsengine.com/en/collections/3504181-for-admins`, 342 articles [fetched]) has these sub-collections, in this order: Season Management · Communication · Events and RSVPs · Financials & Reporting · HQ · Integration · Members · Memberships and Eligibility · Program Sign Ups · Registration · Safety · Sport Management · Settings · TeamCenter · Volunteer Management · Website.

### A.4 Recommended onboarding order (what SportsEngine tells a new admin to do first)

"Getting Started With SportsEngine HQ" (H9066921, modified 2026-08-06 [fetched]): 1 Getting Familiar With HQ · 2 Fill Out Your Organization's Financial Settings · 3 Learn More About Financial Tools and Reports · 4 Add Admins · 5 Request a Registration · 6 Get Your Website Ready · 7 Setup Your Season ("Competition > Season Management").

"Season Management - Getting Started" (H7142159 [fetched]) groups its links as: Creating a Season (Create the Season, Divisions, and Teams; Roster Teams) · Scheduling (Schedule Games and Events Manually; Import Schedule) · Season Management Settings (Standings and Statistics Settings; Season Site) · Scoring (Scoring & Adding Stats).

### A.5 Roles and permissions UI

- Organisation permissions are granted from **Members > Directory > person > Permissions > Edit**; only "Full Access" holders may grant. Levels: "Full Access"; "Limited Access: HQ Tools" (all non-financial admin tools), "Limited Access: Website", "Limited Access: Financials", "Limited Access: Registration Builder", "Limited Access: Compliance" (needs a Verify subscription); "No Access" (a role title without HQ access). "Roles" are "real-world titles" and grant nothing (H6304301, H6304495 [fetched]).
- Team permissions are granted by rostering someone as **Staff** in Season Management (or TeamCenter / app): "Full Access", "Team Settings", "Rostering", "Scheduling Events", "Scheduling Games", "Score Games", "View Only" (H6304495 [fetched]).
- Parent organisations with Affiliation Access see four HQ tabs for an affiliate: "Home", "Directory", "Memberships", "Season Management" (H10302706 [fetched]).
- HQ permissions are organisation-wide; there is no league-, season- or division-scoped admin (benchmark A.11; H6304495).

### A.6 Terminology SportsEngine uses (verbatim in the articles above)

Organization (HQ) · Season (with Active / Past by date) · Division · Team · Roster / Rostering / "Rostered Member" · Players and Staff · Member, Member Directory, Profile, Household, Guardian · Registration (session, entry, registrant types "Self", "Other", "Team", "Orphan") · Program and signup · Membership and Eligibility · Sale Item, Order, Invoice, Payment Terms, Discount · Venue and Sub-venue · Schedule, Game, Event (statuses Unscheduled, Scheduled, In Progress, Completed, Postponed, Canceled, Delayed, Deleted) · Scores & Stats, "Final" / "Final/OT", Standings · Message, Team Chat, RSVP (Going / Not Going / Maybe or Undecided) · Season Site · TeamCenter.

---

## B. SportsEngine flows, step by step

Each step is *screen → action*, with the article that states it. Steps marked [gap] are where the article is silent.

### B.1 Set up a season

1. HQ left nav → **Competition > Season Management** → "Add Season" (H6694766 [fetched]).
2. Add Season dialog → season name, sport, start date, end date → "Add Season". Dates drive Active / Past automatically (H6694766).
3. Season → **Divisions** tab → "Add Divisions" → one name per division → "Add Divisions" (H6694766).
4. Season → **Teams** tab → "Add Teams" → "Add Teams" (manually: team name + division, repeat, "Create") or "Import Teams" (H6694766; import columns in H6342663, benchmark).
5. Season → **Venues** (top of screen) → "Add Venue" → search address or name, pick the "Verified" match, add sub-venues (rinks) with notes → "Add Venue" (H6342522 [fetched]).
6. Season → **Settings** → "Edit" each block: "Standings Settings" (ranking criteria incl. hockey "Points, Overtime Wins and Losses, Goals For and Against, Goal Differential and Quotient"), "Standings Table Columns", "Score Type" (Quick score / Box score with periods), "Season Statistics", "Season Site" (H7198563 [fetched]).
7. Season → Settings → "Copy icon" for the Season Site URL or embed code; "Sync Changes" pushes recent edits (H6887700 [fetched]).

### B.2 Open registration

Two routes exist.

*Route A: built by SportsEngine (paid sessions).*
1. **Registration > Request** → "Registration Request Form" → "Submit"; the Registration Team builds the session (H6306766 [fetched]).
2. **Registration > Registrations** → "Under Construction/Review" tab → three-dot → "Registration Site" (H6306794 [fetched]).
3. Registration Site "Welcome" page → under "status" click "Enable Registration" → confirm → "Enable Registration" (H6306794).
4. "User Mode" → walk every page → on "Review" click "Delete Entry" to test without paying (H6306794).
5. Share the registration link on the website or by message ([gap]: the article does not say where the public link is copied).

*Route B: self-built with Registration Builder permission.*
1. **Registration > Registrations** → "Create New Registration" → mandatory fields → "Create Registration" (or open a past one → "Copy Registration") (H6380779 [fetched]).
2. "Edit Registration" → "Show Advanced Options": Status, allowed registrant types ("Self" for adult leagues, H6325766), "Require Login?", "Open Date/Close Date", "Sell Store Items and Collect Payments?", "Management Fees", "Bank Account" → "Save Registration" (H6380779).
3. Form → "Add Question" / "Create a Custom Question"; conditional logic via "Options > Edit Form Settings > Show Advanced Options" (H6380779); electronic documents as "Document Upload" questions or Electronic Documents (H6329831, benchmark).
4. Question → "Attach Sale Item" → "Add Sale Item" → "Add"; payment terms belong to the sale item (H6380779, H6325766 [fetched]).
5. **Financials > Discounts > Add Discount**: "Automatic Discounts", "Individual Codes", "Reusable Codes" (H6325766).
6. Enable and test as in Route A steps 2 to 4.

### B.3 Build teams and rosters

1. Prerequisite: people must already be in the Directory through registration or club assignment (H6345009 [fetched]).
2. **Competition > Season Management** → season → **Rostering** (H6345009).
3. Under "People" → "Select a Source" → a Registration or the Member Directory; next to "Assign" choose Players or Staff (H6345009).
4. Search by name or "Filters icon" (birthdate range, gender, roster status, team) → "Apply" → tick members (H6345009).
5. "Assign selected players/staff icon" → pick team, or drag onto the team; for staff set permissions and role → "Save"; a notification confirms (H6345009, H6304301).
6. **Teams** tab → team → player → "Team Information" → "Edit" → "Position" → "Save" (positions are required for stats) (H6345009); jersey number and position also editable (H8729025, benchmark).
7. Team three-dot → "Final Roster Notifications" to tell rostered members (H12004652, benchmark; H6345513 [fetched]).
8. Team manager alternative: **TeamCenter** (User Dashboard > Teams tab, or team page "Manage Team") → **Roster** tab → three-dot → "add Player" / "add Staff" → source Member Directory or "Add Person" (first name, last name, email) → jersey and position optional → "Add"; the person "will not receive team communications until they accept their invite" (H6311063 [fetched]).

### B.4 Publish a schedule

1. **Competition > Season Management** → season → **Schedule** (H6345474 [fetched]).
2. Manual: three-dot (right side) → "Add Game" or "Add Event" → form (a game needs at least one team) → tick "Notify teams of changes" → "Add Game" (H6345474). Calendar icon switches to monthly view; list view is required to generate, score, import or export (H6345474).
3. Assisted: Schedule three-dot → "Scheduling assistant" → four areas: **Venues** ("Add venue"), **Time Slots** ("Add time slots", "Add another"), **Scheduling Rules** ("Edit scheduling rules": game length and time rules → "Next" → time constraints → "Save"), **Games** ("Generate Games": divisions, teams, games per team → "Generate games" → review → "Add games") (H7207483 [fetched]).
4. Division three-dot → "Autoschedule Games" → review rules → "Autoschedule" → resolve conflicts, move games manually (H7207483).
5. Visibility: there is no publish button in the articles. Games are visible to rostered members once added; the Season Site is refreshed with "Sync Changes" (H6887700); rostered players receive an RSVP-status notification 48 hours before and staff 24 hours before (H6345474). Import/export through the Schedule list three-dot (H6345474; H9670909, H10064811 benchmark).

### B.5 Enter scores and standings

1. **Competition > Season Management** → season → **Schedule** → game three-dot → "Scores & Stats" → final score → "Save"; the game shows "Final" or "Final/OT" (H7198583 [fetched]).
2. Bulk: Schedule three-dot → "Score Games" → scores → "Set scored games to completed" → "Save" (H7198583).
3. Player stats: same "Scores & Stats" screen → per-player stats → "Save" (players need a position) (H7198583). Staff can also score from the app and TeamCenter (H7198583; M8284872 title [unverified]).
4. Standings are configured in season **Settings > Standings Settings** and shown on the Season Site; the article does not describe a manual recompute for Season Management (H7198563). The legacy Sport Management recompute trick (set finals back to Scheduled, change Tool Settings > Standings, set them Final again) is in H6326216 [fetched].

### B.6 Message a division

1. **Competition > Season Management** → season → choose **Teams** or **Divisions** (H6345513 [fetched]).
2. Division (or team) three-dot → "Send Message" (H6345513).
3. Pick recipients: "Players and Staff", "Players" or "Staff"; guardians and secondary emails are included automatically (H6345513).
4. Subject, Message, "Custom Fields" merge dropdown, optional attachments, URLs or registration links → "Send" (H6345513).
5. Review: **Teams** → team → "Message History" in the side panel (H6345513).
6. Alternative for any audience: **Members > Directory** → People or Groups → three-dot → "Send message" (H6399293 [snippet]; needs "Full Access" or "Limited Access - HQ Tools").

### B.7 Collect fees

*Through registration:* price lives on sale items attached to questions; payment terms ("Pay in full" plus up to three plans, installments by dates) are set per sale item or signup (H6325766, H6380779, H6398158 [fetched]; plan detail in H6314065, H6621108, benchmark). Orders and offline payments are under **Financials > Orders** (H7947372 [snippet]).

*Through invoices:*
1. **Financials > Invoicing** → "Send Invoices" (top right) (H6512275 [fetched]). Or **Members > Directory > Groups** → select group → three-dot → "Send invoice" (H6512275).
2. "Recipients", "Description", optional "Message" → "Next" (H6512275).
3. Amount, or "Itemize invoice" with sale items ("Apply") → who pays the processing fee → "Next" (H6512275).
4. "Select Payment Terms" (up to three; "Due on Custom Date" or installment dates) → optional partial payment on receipt → "Next" → review → "Send Invoice(s)" (H6512275).
5. Payer chooses the plan in the shopping cart; failures and reminders are handled from Invoicing / Orders (H6512275; H6341330, H8872387 benchmark).
6. Money view: **Financials** reports "Overview" (open balance, next payout), "Payout", "Receivables", "Payments", "Refunds" (H6342603 [fetched]).

---

## C. SportsEngine mobile app map

App: "SportsEngine - Team management", iOS id499597400, version 7.5.3 (App Store [fetched]); Android `com.sportngin.android` (listing would not render [unverified]). Features listed by the store: schedule, RSVP, team chat, roster, photos, calendar sync, notifications, quick scoring, multi-athlete calendar; "Stats" and "Standings" only for organisations on HQ.

Tabs and screens named in the help articles (the exact bottom-bar order is not documented: [unverified]):

- **Home** tab: list of your teams; a team's actions ("Add Event" under the team) start here (H6662746, M8284843, M8284822 [fetched]). Fans find teams from Home via the "Search" icon and the "Star" (H6662746) or "Add Team" > "Search for an Existing Team" > "Star Outline" (M8366551 [fetched]). Redesigned "Home screen" in 7.4.6 (App Store).
- **Teams** tab / "Teams list": rostered members' and guardians' teams appear here by default; if a team is missing, check the league website (H6662746, M8366551).
- **Schedules** (all teams, upcoming first) and per-team **Schedule** (H6662746, M8284822, H6311290). Event detail → "RSVP" → Yes / No / Maybe (M8284824 [fetched]; H6311290 shows Going / Not Going / Undecided), three-dot "Add Note" visible to admins only (M8284824). iCal / Google subscription per team or combined (M8284825, M8284837 titles).
- **Messages** and **Chat**: "Team Chats are real-time conversations among the team"; "Messages are longer form messages similar to emails" and can also go by email or text (M8264209 [fetched]); compose with "+ Icon", "To", "Subject", "Message", "Send icon"; chat has camera and paper-airplane icons (H6662746).
- **Standings** and **Stats** ("Player Stats" / "Team Stats" tabs) for HQ organisations (H6662746).
- **Roster** tab inside a team: "Add icon" → "Player" / "Staff" → details → "Add" (H6311063 [fetched]); pending members, guardians, team permissions (M8264310, M8264305, M10508536 titles).
- **Account** tab: "Bills", "Registration", "Dibs", "Membership", "Credentials" (M11321710 [fetched]); "Household page" and "Dibs page" named in release notes (App Store).
- Push notifications and per-game text/email preferences (M8262131, M8262144 titles).

How a player finds the team and next game: open the app → Teams tab (team is there if rostered) → tap the team → "Schedule"; or tap "Schedules" for every team with upcoming events first (H6662746, M8284822).

How a team manager (our captain) works: Home → team → "Add Event" / "Add Game" → fill in → "Notify Team Now" toggle → "Add" (M8284843 [fetched]; needs "Team Manager and Coach Access" or page owner); Schedules → event → "RSVP" tab → "Players" / "Staff" → "RSVP Summary" (Yes, No, Maybe, No Response, Not Invited) → "Send RSVP Reminders" → toggles → "Send" (M8284875 [fetched]); Roster tab → "Add icon" (H6311063); "How to Score Games" (M8284872 title); cancel / postpone / reschedule (M8284845 title).

Web equivalent for managers: **TeamCenter**, reached from the User Dashboard "Teams" tab, from a team page's yellow "Manage Team" button, or from the SE Bar "My Organizations > My Teams"; functions: roster players, schedule games, send messages, view RSVPs (H6306846 [fetched]). Messages from TeamCenter are not sent by SMS (H6323073, benchmark).

---

## D. Terminology table

"Our term today" is the label in a sidebar, page title or eyebrow (file cited once per row). "Recommended" is the label a SportsEngine user will recognise; where SportsEngine has no concept, keep ours but place it inside the familiar group.

| Concept | SportsEngine | PlayMetrics / TeamSnap / others | Our term today | Recommended for us |
|---|---|---|---|---|
| Tenant that owns everything | Organization ("HQ") (H9095679) | PlayMetrics: Club; TeamSnap: Organization ("My Organizations") (TS1739); Crossbar: organisation's site | "Organizations" (superadmin nav, eyebrow "tenancy"), "Organisation" (org-admin nav) | **Organization** everywhere (US spelling, one form) |
| Competition container | HQ has no league object above Season; legacy Sport Management had "League Page" > "Division Page" > "Team Page" (H6381027) | Crossbar: "Leagues" is a registration type; Zuluru: Leagues > divisions; SportsPress: Competitions (Leagues) | "Leagues" (eyebrow "competition") | **League** is fine, but the season must be the working unit (A.2); do not force a click on Leagues before Seasons |
| Time-boxed run of play | Season, Active / Past by dates (H6694766) | TeamSnap: Season under Program (TS1739); Crossbar: Season under a Registration (Registrar Overview) | "Seasons" (eyebrow "lifecycle") | **Season** |
| Grouping of teams | Division (H6694766) | TeamSnap: Division / subdivision; Zuluru: division | "Divisions" (eyebrow "brackets") | **Division**; eyebrow "Season > {name}" not "brackets" |
| Team entry into a season needing approval | Team registrant type (H6325766); Tourney team registration | Crossbar: team created inside the season | "Division apps" / "Division applications" / "Team applications" (three labels for one thing: sidebar, page title, `seasons/[id]/applications`) | **Team registrations** (or "Team applications"), one label, under Registration |
| People on a team | Roster, "Rostered Member", Players and Staff (H6345009) | TeamSnap: Roster; PlayMetrics: Rosters | "Memberships" (`/rosters` page title), "Roster", "Manage roster", "Active memberships" | **Rosters** (page) and **Roster** (one team); never "Memberships" for roster rows |
| Putting people on teams | Rostering (season tab) (H6345009) | TeamSnap: Add Teams / invitations; Crossbar: "Creating & Rostering Your Teams" | "Build rosters" (admin home), "Manage roster" (captain) | **Rostering** (admin), **Roster** (captain) |
| A person record | Member / Profile, Member Directory (H6310277) | PlayMetrics: Player Contact, player profile; TeamSnap: Roster profile | "Persons" (eyebrow "identity"), "Users" (eyebrow "directory") | **Members** (Directory); keep "Users" only in the super-admin Settings area |
| Paid annual membership + eligibility | Membership, Eligibility, Credentials (H6310249) | Crossbar: Memberships registration type | "Eligibility", "Compliance", "Documents" | **Eligibility** (one page) with Documents as a tab |
| Sign-up to play | Registration (session, entry), Program signup (H6380779, H6398158) | PlayMetrics: Program registration; LeagueApps: Program; Crossbar: Program / Session | "Registrations", "Forms", "Open registrations" (player nav) titled "Find a team" | **Registration** (admin group), **Register** (player action) |
| Question set | Registration form, questions (H6380779) | Crossbar: "Creating a Form" | "Forms" (eyebrow "compliance") | **Registration forms**, inside Registration |
| Waiver | Electronic Documents (H6329831) | Crossbar: Document Signature | "Documents", "Document signatures" | **Waivers & documents** |
| Money owed | Invoice, Order, Sale Item, Payment Terms (H6512275) | TeamSnap: Invoices; LeagueApps: Invoices | "Invoices" (nav) vs page "Invoices & AR"; "Finance ops" (nav) for `/payments`; "Finance" (org); "Dues" (captain); "Payments" (player) | **Financials** group: Invoices, Payments, Refunds, Discounts, Reports; captain **Dues**; player **Payments** |
| Price break | Discount (Automatic / Individual Codes / Reusable Codes) (H6325766) | | pricing tiers, promo code in funnel | **Discounts** |
| Place of play | Venue, Sub-venue (H6342522) | OpenLeague: Venue, Ice surface; Zuluru: Facility, Field | "Venues, surfaces, ice slots" | **Venues** (rinks as sub-venues) |
| Calendar of play | Schedule; Game; Event (H6345474) | TeamSnap: Schedule, games and events; PlayMetrics: Events | "Schedule" (nav) with sub-pages Generate, Conflicts, Parity, Fairness, Rinks, Runs, Verify; "Games"; "Game events" (eyebrow "play-by-play") | **Schedule** (one page per season with Games list); scorekeeping under the game, not a nav item |
| Automatic schedule | Scheduling assistant: Venues, Time Slots, Scheduling Rules, Generate Games, Autoschedule (H7207483) | | "Generate · {season}", "Fairness", "Parity", "Run history" | **Scheduling assistant** with steps Venues & time slots, Rules, Generate, Review |
| Results | Scores & Stats, Score Games, "Final" / "Final/OT" (H7198583) | SportsPress: Event Results | "Stats" (eyebrow "analytics"), "Enter results" (admin home) | **Scores & standings** |
| Table | Standings, Standings Settings (H7198563) | SportsPress: League Tables; WPCM: League Tables | "Standings" inside Stats | **Standings** visible as its own tab |
| Communication | Message (email), Team Chat, RSVP (H6345513, M8264209) | TeamSnap: Messages (chats, posts, emails, alerts) | "Communications" (eyebrow "outbound"), page "Notification outbox", "Send a broadcast" | **Messages** |
| Attendance | RSVP: Going / Not Going / Maybe (H6311290) | TeamSnap: Availability | "Lineups", "game_attendance" (no player surface) | **RSVP** (player), **Lineup** (captain, inside the game) |
| Admin access | Permissions: Full / Limited Access (HQ Tools, Website, Financials, Registration Builder, Compliance); Roles are titles (H6304495) | Crossbar: Admin, Staff, Webmaster; TeamSnap: Owner, Manager, Commissioner | "Roles" (eyebrow "iam"), "Users" | **Admins & permissions** under Settings |
| Activity record | not offered (benchmark A.10) | Zuluru: activity logs | "Audit" (eyebrow "trail"), "Audit log" | **Activity log** under Settings |
| Team manager | Team Manager / Coach / Staff with team permissions (H6304495) | TeamSnap: Manager, Team Owner; Crossbar: Head Coach, Manager | "Captain", "Team admin" | **Captain** is PPHL's own word; keep it, say "captain or coach" in entry copy |
| Spare player | not offered | OpenLeague: role-limited signup slots | "Free agents", "Find a team" | **Free agents** inside Rostering / Register |

---

## E. Our IA vs theirs

### E.1 Side by side

Counts are from the sidebar files on 2026-10-25.

| Surface | Ours today | SportsEngine equivalent |
|---|---|---|
| Entry | landing `/sign-in` chooser asks "What do you do in your league?" and forwards to one of four apps, each with its own sign-in and session (f0764ee; `section-cta.tsx` now shows four cards: "I run the league", "I run a club or organisation", "I captain or coach a team", "I play, or I am a parent"); the earlier fifth card "League Admin" and `league.sportspulse.us` were removed in the same commit | one sign-in (`user.sportngin.com`), then one User Dashboard; admins click "HQ Home"; organisations and teams switch through the SE Bar "My Organizations" dropdown (A.1) |
| Admin console (`apps/superadmin-web`) | 30 items for a super admin, 28 for a league admin: platform block Overview, Organizations, Users, Persons, Roles, Audit, Admin Console; then sections **Setup** (Org setup), **League** (Seasons, Leagues, Divisions, Teams, Memberships), **Compliance** (Registrations, Division apps, Transfers, No-show report, Forms, Documents, Eligibility), **Operations** (Schedule, Venues, Games, Game events, Stats, Invoices, Finance ops, Communications, Reports, Data Migration) | about 8 top-level items (Home, Members, Competition, Registration, Programs, Financials, Settings, Go to My Website) with 2 to 4 sub-items each; the season is a workspace with tabs Divisions, Teams, Rostering, Schedule, Settings, Venues (A.2) |
| Org console (`apps/org-admin-web`) | 15 items: Overview, Organisation, Org setup, Leagues, Seasons, Divisions, Teams, Schedule; **Operations** Venues, Registrations, Forms, Finance, Disputes, Communications; **Records** Audit | same HQ; a club under a league sees Home, Directory, Memberships, Season Management through Affiliation Access (H10302706) |
| Captain app (`apps/team-admin-web`) | 12 items for a captain: Overview, Roster, Schedule, Lineups, Stats; **// Captain console** Manage team, Manage roster, Invites, Join requests, Free agents, Dues, Compliance | TeamCenter / app team: Roster, Schedule, Messages, RSVPs, scoring, team settings (H6306846, H6304495) |
| Player app (`apps/player-web`) | 9 items: Home; **// My game** Schedule, Stats; **// My team** Team; **// My account** Payments, Compliance, Notifications; **// Discover** Open registrations, Profile | app tabs Home, Teams, Schedules, Messages/Chat, Standings, Stats, Account (Bills, Registration, Membership, Credentials) (C) |
| First screen (admin) | `/dashboard`: hero headline, stat cells (Leagues active, Players, Suspended orgs, Live games), then since f3d70d9 a "Where each season stands" lifecycle (Season set up, Registration, Teams, Rosters, Schedule, Results & standings, Playoffs) with one next step per live season | HQ Home: contents undocumented [unverified]; onboarding article leads with Financial Settings, Admins, Registration, Website, Season (A.4) |

### E.2 Friction points (the eight biggest first)

1. **Thirty navigation items in five groups versus about eight.** A SportsEngine admin works inside one season workspace with six tabs; ours spreads the same season across Seasons, Leagues, Divisions, Teams, Memberships, Registrations, Division apps, Schedule, Venues, Games, Game events, Stats and Invoices, every one a top-level link (`superadmin-web/.../sidebar.tsx:57-98`).
2. **Four apps, four sessions, four sign-ins.** SportsEngine has one account and one dashboard; roles change what you see, not where you log in (A.1). A PPHL captain who also plays must sign in twice with us (`player-web` Home banner deep-links to `team-admin-web`, sidebar comment). The new `/sign-in` chooser helps, but it still asks the user to self-classify before signing in, and the four cards are the first thing a visitor must decode.
3. **Internal jargon as labels.** "Persons" (eyebrow "identity"), "Memberships" for roster rows (eyebrow "roster"), "Division apps", "Finance ops" (for `/payments`), "Org setup", "Game events" (eyebrow "play-by-play"), "Invoices & AR", "No-show report" titled "Teams that didn't return", "Disputes". SportsEngine says Members, Rosters, Team registration, Financials, Season Management, Scores & Stats (D).
4. **Eyebrows that describe the codebase, not the page.** `// DIRECTORY Users`, `tenancy Organizations`, `iam Roles`, `trail Audit`, `ingest Data Migration`, `outbound Communications`, `brackets Divisions`, `lifecycle Seasons`, `rosters Teams`, `// admin · division applications`. The `//` prefix is rendered in mono uppercase by `PageHeader` (`team-admin-web/src/components/layout/page-header.tsx:32`). SportsEngine's breadcrumbs are the path you clicked ("Competition > Season Management > Schedule").
5. **One concept, several labels, across apps.** Division apps / Division applications / Team applications; Invoices / Finance / Finance ops / Dues / Payments; Communications / Notification outbox / Send a broadcast / Comms; Organizations / Organisation; Roster / Manage roster; Compliance (captain) vs Eligibility (admin) vs Compliance (player) for overlapping things. SportsEngine uses one noun per concept (A.6).
6. **Developer copy in product subtitles.** "Decisions made here propagate to the player's wallet / refund channel via the same path Stripe webhooks travel" (`org-admin-web/.../disputes/page.tsx:61`), "Captured by the global audit interceptor" (`audit/page.tsx:57`), "Tap a template code to see the rendered body and the audit trail of which event triggered it" (`communications/page.tsx:128`), "the same path Stripe webhooks follow downstream" (`finance/page.tsx:103`). SportsEngine help copy is task-first ("Click Add Season").
7. **No single season workspace.** SportsEngine's season row carries Divisions, Teams, Rostering, Schedule, Settings and the three-dot actions (score, message, share site). Ours puts Schedule generation under `/scheduling/[seasonId]/{generate,conflicts,parity,fairness,rinks,runs,verify,tournament}`, team applications under `/seasons/[id]/applications`, rosters under `/rosters`, results under `/stats` and `/games`, each reached from the sidebar rather than from the season. The lifecycle strip on the new admin home (f3d70d9) is the right idea and should become the season page itself.
8. **Identifiers where names belong.** `roles/[id]` lists holders by `title={a.userId}` (`superadmin-web/.../roles/[id]/page.tsx:232`); invoices, registrations and import jobs show `id.slice(0, 8)` as the visible reference (`org-admin-web/.../finance/invoice-table.tsx:97`, `player-web/.../registrations/page.tsx:221`, `data-migration/[id]/page.tsx:67`). SportsEngine shows names, team names and dates; ids appear only in exports.

Further points, smaller but real:

9. "Org setup" wizard sits in its own **Setup** group, open by default (`sidebar.tsx:183`), while SportsEngine folds setup into Season Management ("Add Season", "Add Divisions", "Add Teams").
10. The platform block (Organizations, Users, Persons, Roles, Audit, Admin Console) is shown above the league work for every admin, including a league admin who never touches tenancy; SportsEngine puts organisation administration under Settings and Members.
11. The org console orders Leagues before Seasons; the admin console orders Seasons before Leagues. Same company, two mental models.
12. Captain nav duplicates: "Roster" and "Manage roster"; "Overview" and "Manage team". SportsEngine's team view has one Roster.
13. Player "Open registrations" opens a page titled "Find a team" with eyebrow "// find a team"; the nav label, title and SportsEngine's "Register" / "Registration" all differ.
14. No public, unauthenticated schedule or standings page (benchmark B-5); SportsEngine users expect the Season Site link to work without an account (H6887700).
15. Spelling drift: "Organisation" (org console nav and page title; also "No organisation in scope" in the admin console's own `payments/page.tsx:64`) vs "Organizations" (admin console nav); "finalised" vs US labels elsewhere. PPHL is a US league; SportsEngine is US English throughout.

### E.3 What a SportsEngine-habituated league operator clicks first

| Flow (section B) | On SportsEngine they click | In ours today they must find | Gap |
|---|---|---|---|
| Set up a season | Competition > Season Management > Add Season, then Divisions and Teams tabs | Setup > Org setup (wizard), or League > Seasons then League > Divisions then League > Teams, each its own list | three sidebar visits instead of one workspace; "Org setup" is not a word they use |
| Open registration | Registration > Registrations > Create New Registration (or Request); Enable Registration | Compliance > Forms (build), then Compliance > Registrations (queue), season page to open; player sees "Open registrations" | Registration is filed under "Compliance"; the open/close switch is on the season, not on the form |
| Build teams and rosters | Season > Teams tab; Season > Rostering (drag from registration to team) | League > Teams (list), Compliance > Division apps (approve), League > Memberships (rows), captain app for invites | "Memberships" and "Division apps" are not recognisable; rostering is split between admin and captain apps with no drag-from-registration view |
| Publish a schedule | Season > Schedule > three-dot > Scheduling assistant; Add Game with "Notify teams of changes" | Operations > Schedule > pick season > Generate / Conflicts / Parity / Fairness / Rinks / Runs / Verify; Operations > Games for single games; Operations > Venues separately | seven sub-pages where SportsEngine has four assistant areas; no notify-on-change (benchmark B-10) |
| Enter scores and standings | Season > Schedule > game three-dot > Scores & Stats; Score Games for bulk; Standings in Settings and on the Season Site | Operations > Games > game page; Operations > Game events (play-by-play); Operations > Stats for standings | three nav items for one job; "Game events" is a scorer's internal term |
| Message a division | Season > Divisions > three-dot > Send Message | Operations > Communications > "Send a broadcast" (org) or Communications page titled "Notification outbox" | audience is not picked from the division row; the page is named after the delivery log |
| Collect fees | Financials > Invoicing > Send Invoices; Orders; Discounts; reports | Operations > Invoices (page "Invoices & AR"), Operations > Finance ops (`/payments`), org console "Finance", "Disputes" | two finance items with unclear split; discounts live in the registration pricing tier, not under Financials |

---

## F. Recommended navigation for SportsPulse release 1

Constraints kept: four apps with their own sessions (repo decision 2026-05-09), superadmin-web as the god app with role filtering, no new apps. Everything below is a relabel and regroup of existing routes; new routes are marked (new). Labels use US spelling and SportsEngine's nouns from section D. Eyebrows become the parent group or the season name; the `//` prefix goes.

### F.1 Entry: one page, one question, then route by role

Today: `landing /sign-in` already asks "What do you do in your league?" and forwards to four sign-in pages (f0764ee). Keep it as the only link from the landing header and footer, and:

- Put the same chooser on each app's `/sign-in` page under the form ("Not an admin? Open the player app"), so a wrong-app landing is one click to fix (the admin layout already redirects a wrong role to `/sign-in?error=wrong_role`, `superadmin-web/src/app/(admin)/layout.tsx:44`).
- After a successful sign-in in any app, if the user holds a role that belongs to another app, show that destination as a card on Home ("You also captain the Nighthawks: open the team app"). The player Home banner does this for captains already; make it symmetric.
- Remember the last chosen app in a cookie on `sportspulse.us` so the chooser preselects it (new).
- Later (not release 1): one Supabase session shared across subdomains would make this SportsEngine-like (sign in once, land on the right app). Out of scope here because of the per-app session decision.

Card copy: "I run the league" · "I run a club" · "I captain or coach a team" · "I play, or I am a parent" (as shipped), with the SportsEngine verbs underneath (Seasons, Registration, Rosters, Schedule, Scores & standings, Financials, Messages).

### F.2 Admin console (`superadmin-web`, league admins and super admins)

Grouped the way HQ groups, eight top-level items; each line is label → existing route(s) → one-line rationale.

- **Home** → `/dashboard` — keep the season lifecycle strip (f3d70d9) as the first viewport; drop the hero headline and the platform stat cells for non-super admins. Rationale: SportsEngine's onboarding and our PPHL feedback both say "where is my season and what is next".
- **Season Management** → `/seasons` list, and one season workspace `/seasons/[id]` with tabs **Divisions** (`/divisions` filtered), **Teams** (`/teams` filtered, with "Team registrations" = `/seasons/[id]/applications`), **Rostering** (`/rosters` filtered; Transfers as an action), **Schedule** (`/scheduling/[seasonId]` with the assistant steps Venues & time slots, Rules, Generate, Review and the Games list; Conflicts / Parity / Fairness / Runs / Verify become tabs of Review), **Scores & standings** (`/games` filtered + `/stats` standings; Game events only inside a game), **Settings** (season rules, points per result, tiebreakers, roster lock, playoffs = `/scheduling/[seasonId]/tournament`). **Venues** → `/venues` as a sub-item. Rationale: this is HQ's "Competition > Season Management" row with the same six tabs (A.2); seven of our sidebar items disappear into it.
- **Leagues** → `/leagues` as a sub-item of Season Management (or a filter on Seasons). Rationale: PPHL has one league; SportsEngine has no league object in the nav.
- **Registration** → sub-items **Registrations** (`/registrations` queue), **Registration forms** (`/forms`), **Waivers & documents** (`/documents`), **Team registrations** (`/division-applications`, shared with the season Teams tab). Rationale: HQ's "Registration > Registrations" plus the builder; nothing about registration belongs under "Compliance".
- **Members** → sub-items **Directory** (`/persons`, renamed; Users merged in as a filter for super admins), **Eligibility** (`/eligibility`, with USA Hockey status), **Free agents** (player pool). Rationale: HQ "Members > Directory / Memberships"; "Persons" and "Users" are database words.
- **Financials** → sub-items **Invoices** (`/finance`), **Payments & refunds** (`/payments`, renamed from "Finance ops"; disputes inside), **Discounts** (new, see benchmark B-7), **Reports** (`/reports` financial set). Rationale: HQ "Financials" with Invoicing, Orders, Discounts, reports (A.2).
- **Messages** → `/communications` compose first, delivery log as a second tab; templates under Settings. Rationale: HQ users say "Send Message"; nobody looks for an "outbox" or "outbound".
- **Reports** → `/reports` (registration, roster, schedule, standings exports; No-show report moves here). Rationale: HQ's Quick / Saved Reports and exports are a reporting habit.
- **Settings** (super admin, and the org-level settings for league admins) → **Organization** (`/organizations`, `/organizations/[id]`), **Admins & permissions** (`/roles`, `/users` grants), **Activity log** (`/audit`), **Data import** (`/data-migration`), **Admin Console** (`/admin`). Rationale: HQ puts tenancy and permissions under Settings and the Directory, not above the season work.

Removed as top-level: Org setup (becomes "Add season" / "Add divisions" / "Add teams" buttons inside Season Management plus a first-run checklist on Home), Game events, Division apps, Memberships, Transfers, No-show report, Finance ops, Persons, Users, Roles, Audit (all re-homed above).

Page headers: eyebrow = "Season Management · Fall 2026" style path; title = the noun; subtitles say what the user can do, not how the system is built.

### F.3 Org console (`org-admin-web`)

Same groups, filtered: **Home** · **Season Management** (Seasons, Divisions, Teams, Rostering, Schedule, Scores & standings, Venues) · **Registration** (Registrations, Registration forms) · **Members** (Directory, Eligibility) · **Financials** (Invoices, Payments & refunds, Reports) · **Messages** · **Settings** (Organization, Admins, Activity log). "Org setup" and "Organisation" merge into Settings > Organization plus the Home checklist; "Disputes" becomes a filter in Payments & refunds. Rationale: an org admin is HQ's affiliate admin who sees Home, Directory, Memberships, Season Management (H10302706); the same labels in the same order as the league console means PPHL staff can move between consoles without relearning.

### F.4 Captain app (`team-admin-web`)

Six items, team-scoped, in TeamCenter order: **Home** (next game, RSVP count, registration CTA when open) · **Roster** (`/roster` + `/captain/roster` merged; "Add players" opens Invites, Join requests and Free agents as tabs) · **Schedule** (`/schedule`; Lineup and Attendance live on the game page) · **Messages** (`/comms` when built; hidden until then, as now) · **Dues** (`/captain/dues`) · **Team settings** (`/captain/team`, with Compliance as a tab). Stats stays on the Schedule game pages and a "Standings" link. Rationale: TeamCenter and the app give a manager Roster, Schedule, Messages, RSVPs and settings (H6306846, H6304495); "Captain console" as a second section duplicates Roster and splits one job.

### F.5 Player app (`player-web`)

Six items in the mobile app's order: **Home** (my teams, next game, things to do) · **Schedule** (`/schedule`, with RSVP when built) · **Team** (`/team`: roster, standings, stats) · **Register** (`/register`, titled "Register for a season"; "Find a team" as the free-agent tab) · **Payments** (`/payments`) · **Account** (`/profile`, with Registrations, Waivers & eligibility = `/compliance`, Notifications as tabs). Rationale: SportsEngine's app is Home, Teams, Schedules, Messages, Standings/Stats, Account (C); "Discover", "My game", "Compliance" are not words a player uses.

### F.6 Label rules for all four apps

- One noun per concept, from column "Recommended" in D; sweep nav labels, page titles, eyebrows and empty states together (CLAUDE.md "sweep every consumer").
- Eyebrow is the clicked path, never a system word; no `//`, no mono uppercase codes.
- Names, not ids: role holders by display name and email; invoice references as a human number (INV-0042) or the payer name, with the UUID in a copy affordance only.
- Subtitles describe the user's next action; words such as webhook, interceptor, template code, outbox, tenancy, ingest, iam, AR do not appear in product copy.
- US spelling throughout (Organization, finalized).

---

## G. Sources (all accessed 2026-10-25 unless marked)

### G.1 SportsEngine HQ help centre (`https://help.sportsengine.com/en/articles/<id>`)

Fetched this pass: H9066921 Getting Started With SportsEngine HQ (modified 2026-08-06) ; H6381027 Welcome League and Club Administrators ; H6694766 Season Management - Create a Season ; H7142159 Season Management - Getting Started ; H10302706 Organization and Affiliation Admin Navigation ; H9859399 Transition to Season Management from Sport Management ; H6325766 Registration Builder Cheat Sheet ; H6380779 Welcome Registration Builders ; H6306766 How to Request a Registration ; H6306794 How to Enable and Test Your Registration Session ; H6417513 How to Edit a Registration Entry ; H6398158 Creating Program Sign Ups ; H6345009 Season Management - Rostering ; H2876231 How to Roster Using the Rostering Tool ; H6311063 How to Add Players or Staff to Your Roster in TeamCenter ; H6306846 What is TeamCenter ; H6345474 How to Schedule Games and Events ; H7207483 Season Management - Creating a Schedule with Scheduling Assistant ; H6342522 Season Management - Venues ; H7198583 Season Management - Scoring & Adding Stats ; H7198563 Season Management - Standings, Statistics & Scoring Settings ; H6326216 How to Update Standings After Games Are Finalized ; H6887700 Season Management - Share Season Site ; H6345513 Season Management - Messaging ; H6304301 How to Grant Permissions to Members ; H6304495 What Are the Different Types of Permissions ; H6342603 Learn About Financial Reporting Tools ; H6512275 How to Send Invoices ; H6310277 How to View and Export Member Data ; H6310404 Members Guide ; H6346391 How to View Membership Data in the Member Directory ; H6310249 How to Create Memberships ; H6342201 How to Display Programs on Your Website ; H2876176 Website Guide ; H6304015 How to Sign In to My Account ; H6307083 How to Sync Your Team Schedule to Your Google Calendar ; H6311290 How Do I RSVP ; H6662746 SportsEngine Mobile Start-Up Guide ; H9095679 Introduction to the Platform Data Structure ; H6399532 SportsEngine HQ Overview (USAV-specific; no nav content) ; collection index https://help.sportsengine.com/en/collections/3504181-for-admins.

Search snippets only (article not opened): H9583584 Season Management - Manage Auto-Sync ; H6313638 How to Add Additional Player/Coach Information ; H6399293 How to Send Messages to Members or Groups ; H6325544 Send a Message to a Group From Your Directory ; H6342422 How to Message Un-Registered Members ; H6433690 Membership Status Report ; H6330288 View a Membership's Active Eligibility ; H6402397 How to Create Registration Reports ; H6311531 How to Copy a Past Registration ; H10753287 What are Reference Codes ; H7947372 How to Record Offline Payments ; H6345595 Upload Banner Image to a SportsEngine.com Listing ; H6304668 How to Update Profile Information ; H6304756 Additional Emails for an Athlete ; H6323073 Send a Message from TeamCenter.

Unverified (title only or page failed): H10023943 What Are Add-Ons (404 on 2026-10-25) ; H12004652 Final Roster Notifications, H8729025 Jersey Number and Position, H6329831 Electronic Documents, H6342663 Teams Import, H9670909 Schedule Import, H10064811 Schedule Export, H6314065 / H6621108 payment plans, H6341330 Failed Payments, H8872387 Edit Payment Plans, H7202912 Sport vs Season Management (all fetched 2026-10-24 for benchmark.md and reused here without reopening).

### G.2 SportsEngine mobile help (`https://mobile-help.sportsengine.com/en/articles/<id>`) and stores

Fetched: collections index `https://mobile-help.sportsengine.com/en/` ; Getting Started 5537914 ; Scheduling 5537954 ; Communication 5537950 ; Account Basics 5537938 ; Team Tools 5537955 ; Rostering 5537951 ; M8366551 How to Access a Premium HQ Team in the App ; M8284843 How to Schedule a Game or Event ; M8284822 How to View the Schedule ; M8284824 How to RSVP to a Game or Event ; M8284875 Managing RSVPs as a Team Manager ; M8264209 Team Chats vs Messages ; M11321710 Access MySE Details in the Mobile App ; App Store listing https://apps.apple.com/us/app/sportsengine-team-management/id499597400 (v7.5.3). Titles only: M8284872 How to Score Games ; M8284845 Cancel, Postpone, or Reschedule ; M8264310 Manage Pending Members ; M10508536 Types of Team Permissions ; M8262131 / M8262144 notifications ; M10100112 Team Updates as an Organization Admin. Not readable: Google Play listing `com.sportngin.android` (page did not render) ; parent guide PDF `cdn1.sportngin.com/attachments/document/e8eb-3174412/...Parents.pdf` (binary would not decode).

### G.3 Alternatives

- PlayMetrics: https://home.playmetrics.com/clubs/team-management [fetched] ; https://home.playmetrics.com/playmetrics-features [fetched] ; help centre articles 360021201253 (Introduction to the PlayMetrics Club System) and 360024272234 (Using PlayMetrics as a Player Contact) returned HTTP 403; role list (Administrators, Directors, Coaches, Team Managers, Player Contacts) and the parent's left-hand "Club Programs" menu come from search snippets of those articles [snippet].
- TeamSnap: TS183 TeamSnap for Teams: Administrator guide to getting started [fetched] ; TS1739 Add a sports organization team [fetched] ; TS917 Manage Tabs in Organization Settings [fetched] ; https://teams-help.teamsnap.com/article/2970-teamsnap-one-mobile-guide-staff-parents-and-players [fetched].
- LeagueApps: https://leagueapps.com/admins/ [fetched] ; https://leagueapps.com/blog/product-update-manager-console-improvements-and-new-reporting-tool/ (dated 2012-11-07) [fetched] ; support.leagueapps.com articles 360039864833 and 360039380834 returned HTTP 403; "Manage > All Programs", "Manage > Members", "Reporting > Dashboard", "Settings > Account Settings" come from search snippets [snippet].
- Crossbar: https://help.crossbar.org/en/ [fetched] ; Admin Overview https://help.crossbar.org/en/articles/9939597-admin-overview [fetched] ; Registrar Overview https://help.crossbar.org/en/articles/9860089-registrar-overview [fetched] ; Registrar Resources collection 3076580 [fetched] ; third-party coaches' guide https://www.lakelandyouthsoftball.com/coaching-resources/coaches-guide-to-crossbar/96728 [fetched, not Crossbar's own copy].
- SportsPress: https://raw.githubusercontent.com/ThemeBoy/SportsPress/master/includes/admin/class-sp-admin-menus.php and `includes/class-sp-post-types.php` [fetched] ; https://docs.themeboy.com/en/articles/14788075-competitions-and-seasons [fetched]. Note: the code registers the taxonomy as "Leagues" while the current docs say "SportsPress > Competitions".
- WP Club Manager: https://raw.githubusercontent.com/WPClubManager/wp-club-manager/develop/includes/admin/class-wpcm-admin-menus.php and `readme.txt` [fetched]; documentation at https://wpclubmanager.com/documentation/ not opened.
- Zuluru3: https://raw.githubusercontent.com/Zuluru/Zuluru3/master/src/Controller/AppController.php [fetched]; help templates directory not found via the GitHub API (`templates/Help` holds one `view.php`).
- OpenLeague: https://raw.githubusercontent.com/mbeacom/openleague/main/README.md [fetched].

### G.4 Repository evidence (branch `pphl-journey-fixes`, 2026-10-25)

`apps/superadmin-web/src/components/layout/sidebar.tsx` ; `apps/org-admin-web/src/components/layout/sidebar.tsx` ; `apps/team-admin-web/src/components/layout/sidebar.tsx` ; `apps/player-web/src/components/layout/sidebar.tsx` ; `apps/landing-web/src/components/landing/section-cta.tsx` and `apps/landing-web/src/app/sign-in/page.tsx` (commit f0764ee) ; `apps/superadmin-web/src/app/(admin)/dashboard/page.tsx` and `apps/superadmin-web/src/components/dashboard/season-flow.tsx` (commit f3d70d9) ; `apps/superadmin-web/src/app/(admin)/layout.tsx` ; `apps/team-admin-web/src/components/layout/page-header.tsx` ; page titles and eyebrows from `rg -n "eyebrow=|title=" apps/*/src/app --glob page.tsx` ; `doc/traceability/benchmark.md`.

### G.5 Open-source "new season" in two lines each (from G.3)

- **SportsPress**: WordPress menu SportsPress (Settings, Configure, Leagues/Competitions, Seasons), Events, Teams, Players, Staff; taxonomies Leagues, Seasons, Venues, Positions, Jobs. New season: SportsPress > Seasons > Name > "Add New Season", then SportsPress > Settings > General > "Current Season"; teams and events are then tagged with it [fetched].
- **WP Club Manager**: menu Club Manager > Dashboard, Seasons, Competitions, Teams, Rosters (club mode), League Tables, Settings, Status. New season: Club Manager > Seasons (a taxonomy term), then matches tagged with season and competition; step detail [unverified], and the plugin is dropping league support in v3.
- **Zuluru3**: menu Dashboard, My Profile, Registration, Teams, Leagues, Tournaments, Facilities (label configurable, default "Field"), People, Newsletters, Configuration, Tasks, Help. New season: Leagues > "Create League" (a league carries the season name; divisions sit under it), then Registration > "Create Event" for sign-up; step detail [unverified].
- **OpenLeague**: team-first routes Team dashboard, Roster, Calendar, Events (new / detail); no league or season setup flow is documented [fetched].
