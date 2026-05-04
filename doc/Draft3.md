# **Use Case Document (Draft ver 1.0)**

## **1\. Use Case Catalog**

### **Registration & Rostering**

- **UC-01:** Player Registration

- **UC-02:** Parent/Guardian-Assisted Registration

- **UC-03:** Free Agent Registration & Assignment

- **UC-04:** Captain Invites Player to Team

- **UC-05:** Admin Approves/Rejects Roster Eligibility

### **Scheduling**

- **UC-06:** Auto-Generate League Schedule

- **UC-07:** Manual Schedule Override by Admin

- **UC-08:** Publish Schedule & Notify Teams

- **UC-09:** Schedule Playoff Brackets

- **UC-10:** Create Pickup Game Session

### **Game Operations**

- **UC-11:** Scorekeeper Enters Game Events (Goals, Penalties)

- **UC-12:** Referee Finalizes Scoresheet

- **UC-13:** Stats Update to Player Dashboards

- **UC-14:** Suspension/Eligibility Auto-Tracking

### **Financials**

- **UC-15:** Player Pays Registration Fee _(upfront/ installments), explore captain payment_

- **UC-16:** Captain Splits Team Dues Among Players

- **UC-17:** Admin Issues Refund/Credit

- **UC-18:** System Sends Overdue Payment Reminder

### **Communication**

- **UC-19:** Admin Sends League-Wide Announcement

- **UC-20:** Captain Sends Team Message

- **UC-21:** Automated SMS/Push for Game Change

### **Video & Media**

- **UC-22:** Stream Live Game on Team Page

- **UC-23:** Auto-Highlight Generated on Goal

- **UC-24:** User Uploads Video Clip

### **Merchandising**

- **UC-25:** Auto-Create Team Store from Roster

- **UC-26:** Player Orders Jersey via Store

### **Compliance & Governance**

- **UC-27:** Player Signs Digital Waiver

- **UC-28:** Parent Provides Consent for Minor

- **UC-29:** Admin Validates ID/Eligibility Document

### **Referee & Substitutes**

- **UC-30:** Referee Assigned Automatically to Game

- **UC-31:** Captain Requests Substitute Player (Goalie911)

### **Multi-Team/Family**

- **UC-32:** Parent Views Multiple Children's Schedules in Dashboard

- **UC-33:** Player Belongs to Multiple Teams

## **2\. Use Cases detailing**

### **UC-01: Player Registration**

- **UMS:** Player, System, Captain (optional), League Admin (optional).

- **Preconditions:  
   **
  - Registration period is open.

  - Player has a valid email/phone for verification.

- **Trigger:** Player clicks "Register" on league/club portal.

- **Main Flow:  
   **
  - Player selects league/division/team or "Free Agent."

  - System prompts for account creation/login.

  - Player enters personal info (name, DOB, gender, contact).

  - System requests waiver acceptance and optional medical/emergency contact details.

  - Player uploads ID/proof (if required).

  - Player selects payment option (full, installment, team dues).

  - Payment processed through integrated gateway.

  - System confirms registration, assigns to roster/free agent pool.

  - Confirmation email/SMS sent.

- **Alternative Flows:  
   **
  - **Payment Failure:** System retries or allows offline payment logging; player status set to "Pending."

  - **Eligibility Mismatch:** System flags to League Admin for manual review.

  - **Waiver Not Signed:** Registration blocked until waiver signed.

- **Postconditions:  
   **
  - Player account created, status = Active (or Pending if awaiting admin approval).

  - Player visible on team roster or free agent pool.

- **Data Involved:  
   **
  - user_id, player_id, name, DOB, contact info, waiver record, payment transaction, team_id/free_agent flag.

###

### **UC-02: Parent Assisted Registration**

- **UMS:** Parent/Guardian, Player, System.

- **Preconditions:  
   **
  - Player is under 18.

  - Parent account exists or is created.

- **Trigger:** Parent clicks "Register Child" on portal.

- **Main Flow:  
   **
  - Parent logs into system and selects "Add Child."

  - Parent enters child's details (DOB, contact, medical/emergency).

  - System validates child's age for division eligibility.

  - Parent signs digital consent + waiver.

  - Parent selects team (invite code) or free agent registration.

  - Parent pays fees on behalf of child.

  - Confirmation sent to parent and player profile created for child.

- **Alternative Flows:  
   **
  - Parent skips payment → player status "Pending Payment."

  - Invalid age for division → error shown.

- **Postconditions:  
   **
  - Child player registered, linked to parent/guardian account.

  - Consent and waiver stored.

- **Data Involved:  
   **
  - parent_user_id, player_id, DOB, waiver record, payment, parent-child linkage.

###

### **UC-03: Free Agent Registration & Assignment**

- **UMS:** Player, Captain (optional), League Admin, System

- **Preconditions:  
   **
  - Registration period is open.

  - Player does not belong to a team.

- **Trigger:** Player selects "Register as Free Agent."

- **Main Flow:  
   **
  - Player completes registration steps (personal info, waiver, payment).

  - System adds player to free agent pool.

  - Captains of eligible teams receive notifications of available free agents.

  - Captain browses free agent pool and "pitches" an invite.

  - Player accepts or declines captain's invite.

  - On acceptance, system moves player from free agent pool to team roster.

- **Alternative Flows:  
   **
  - No teams pick up player → Player remains free agent, visible until roster deadline.

  - Admin manually assigns player to a team.

  - Player withdraws from free agent pool → system removes profile.

- **Postconditions:  
   **
  - Player either stays in free agent pool or joins a team roster.

- **Data Involved:  
   **
  - player_id, free agent status flag, team_id (if assigned), payment, waiver record.

###

### **UC-04: Captain Invites Player to Team**

- **UMS:** Captain, Player, System

- **Preconditions:  
   **
  - Team exists in current season.

  - Roster not locked.

- **Trigger:** Captain clicks "Invite Player."

- **Main Flow:  
   **
  - Captain enters player's email/phone or selects from past roster.

  - System sends invitation (email/SMS).

  - Player receives invite, logs in or creates account.

  - Player accepts invite and completes registration (waivers, payment).

  - System auto-validates eligibility (age, division level).

  - Player added to team roster.

- **Alternative Flows:  
   **
  - Player declines invite → System notifies captain.

  - Player ignores invite → Reminder sent before roster deadline.

  - Eligibility mismatch → Flag to League Admin for manual override.

- **Postconditions:  
   **
  - Player's status = Active on team roster OR Invite Declined.

- **Data Involved:  
   **
  - team_id, player_id, invite status (pending, accepted, declined), waiver, payment.

###

### **UC-05: Admin Approves/Rejects Roster Eligibility**

- **UMS:** League Admin, Player, System

- **Preconditions:  
   **
  - Player has registered and is pending eligibility approval.

  - Eligibility rules exist (age range, governing body ID, compliance flags).

- **Trigger:** Player added to roster; eligibility check requires admin review.

- **Main Flow:  
   **
  - Admin opens "Pending Roster Approvals."

  - System displays player info (DOB, ID, waiver, compliance flags).

  - Admin approves player → player roster status becomes "Active."

  - Admin rejects player → system removes player from roster, notifies captain/player.

- **Alternative Flows:  
   **
  - Missing documentation → Admin requests resubmission, status = "Incomplete."

  - Appeal/override → Admin manually assigns player despite flag.

- **Postconditions:  
   **
  - Player marked either "Active" (eligible) or "Rejected."

  - Team roster updated accordingly.

- **Data Involved:  
   **
  - player_id, team_id, compliance docs, waiver, admin decision log, audit record.

###

### **UC-06: Auto-Generate League Schedule**

- **UMS:** League Admin, System Scheduler

- **Preconditions:  
   **
  - Season/division setup completed.

  - Teams are registered and rosters active.

  - Rink availability and blackout dates entered.

- **Trigger:** League Admin selects "Auto-Generate Schedule."

- **Main Flow:  
   **
  - Admin configures scheduling rules (time slots, home/away balance, max games per week).

  - System algorithm runs auto-scheduling engine.

  - Draft schedule generated.

  - Admin previews draft schedule and confirms.

  - Final schedule published to league portal.

- **Alternative Flows:  
   **
  - Scheduling conflict detected → system suggests resolution or prompts manual adjustment.

  - Algorithm fails to place some games → flagged as "Unscheduled" for manual placement.

- **Postconditions:  
   **
  - Full league schedule generated and stored.

- **Data Involved:  
   **
  - season_id, division_id, team_id, rink_id, start_time, end_time, ruleset JSON.

###

### **UC-07: Manual Schedule Override by Admin**

- **UMS:** League Admin, System

- **Preconditions:  
   **
  - Auto-generated or previously published schedule exists.

- **Trigger:** Admin selects a scheduled game to change.

- **Main Flow:  
   **
  - Admin selects game and modifies time, date, or rink.

  - System checks for conflicts (rink double-booking, team overlap).

  - If valid, system saves new schedule.

  - Notifications sent to affected teams/refs.

- **Alternative Flows:  
   **
  - Conflict detected → system blocks change unless Admin chooses "Force Override."

- **Postconditions:  
   **
  - Updated schedule live in portal.

  - Notifications sent.

- **Data Involved:  
   **
  - game_id, new start_time, end_time, rink_id, change log, notifications.

###

### **UC-08: Publish Schedule & Notify Teams**

- **UMS:** League Admin, System, Captains, Players, Refs

- **Preconditions:  
   **
  - Draft schedule exists.

- **Trigger:** Admin clicks "Publish Schedule."

- **Main Flow:  
   **
  - System publishes schedule to public portal.

  - Team dashboards updated with upcoming games.

  - System sends notifications (email/SMS/push) to Captains, Players, Refs.

  - Calendar sync links (iCal/Google) updated.

- **Alternative Flows:  
   **
  - Notifications fail → retry with backup channel (email → SMS).

- **Postconditions:  
   **
  - Schedule visible to all participants.

  - Notifications logged.

- **Data Involved:  
   **
  - game_id, notification queue, user_id recipients, delivery status.

###

### **UC-09: Schedule Playoff Brackets**

- **UMS:** League Admin, System

- **Preconditions:  
   **
  - Regular season completed with final standings.

  - Playoff rules configured (points for win/tie/OT, seeding logic).

- **Trigger:** Admin selects "Generate Playoff Bracket."

- **Main Flow:  
   **
  - System calculates standings based on ruleset.

  - System auto-assigns seeds to teams.

  - Bracket auto-populated with matchups.

  - Admin assigns rink/time for playoff games.

  - Bracket published to portal.

- **Alternative Flows:  
   **
  - Tiebreaker required → system prompts Admin to select rule (head-to-head, goal diff).

  - Admin manually re-seeds teams.

- **Postconditions:  
   **
  - Playoff bracket live and visible.

- **Data Involved:  
   **
  - standings, team_id, seed, game_id, bracket structure JSON.

### **UC-10: Create Pickup Game Session**

- **UMS:** Player, League Admin, System

- **Preconditions:  
   **
  - Pickup session feature enabled for league/rink.

- **Trigger:** Admin or Player creates pickup game listing.

- **Main Flow:  
   **
  - Creator specifies date/time, rink, max players/goalies, fee.

  - System opens registration link.

  - Players register and pay online.

  - System assigns players to teams (balanced by skill rating if available).

  - Notifications sent with roster and details.

- **Alternative Flows:  
   **
  - Max capacity reached → waitlist enabled.

  - Player cancels → spot offered to waitlist.

- **Postconditions:  
   **
  - Pickup game session filled and confirmed.

- **Data Involved:  
   **
  - pickup_game_id, rink_id, participants, payments, waitlist entries.

###

### **UC-11: Scorekeeper Enters Game Events (Goals, Penalties)**

- **UMS:** Scorekeeper, Referee, System

- **Preconditions:  
   **
  - Game scheduled and scoresheet created.

  - Scorekeeper logged in with assigned permissions.

- **Trigger:** Scorekeeper starts digital scoresheet on tablet.

- **Main Flow:  
   **
  - Scorekeeper selects the scheduled game.

  - System loads rosters and officials.

  - During game, scorekeeper records events:
    - Goal (scorer + assist(s) + time).

    - Penalty (player, infraction, time).

    - Goalie changes, shots on goal, saves.

  - Events appear in real-time on system.

- **Alternative Flows:  
   **
  - Device offline → data cached locally, syncs when reconnected.

  - Player not on roster → "Add as Sub" option.

- **Postconditions:  
   **
  - Game log updated with event data.

  - Stats pipeline triggered.

- **Data Involved:  
   **
  - game_id, scoresheet_id, player events, timestamps.

###

### **UC-12: Referee Finalizes Scoresheet**

- **UMS:** Referee, Scorekeeper, System

- **Preconditions:  
   **
  - Game completed.

  - Scoresheet populated with events.

- **Trigger:** Referee clicks "Finalize Scoresheet."

- **Main Flow:  
   **
  - Referee reviews entered events.

  - Referee confirms final score, penalties, and goalie stats.

  - Referee digitally signs (system logs user_id, timestamp).

  - Scoresheet status = Finalized.

- **Alternative Flows:  
   **
  - Discrepancy found → referee edits or sends back to scorekeeper.

- **Postconditions:  
   **
  - Scoresheet locked from further edits.

  - Official result stored.

- **Data Involved:  
   **
  - scoresheet_id, referee_id, final score, digital signature log.

###

### **UC-13: Stats Update to Player Dashboards**

- **UMS:** System, Player, Captain, League Admin

- **Preconditions:  
   **
  - Scoresheet finalized.

- **Trigger:** Scoresheet marked "Finalized."

- **Main Flow:  
   **
  - System parses finalized scoresheet.

  - Player and team stats updated (goals, assists, PIM, goalie saves).

  - Leaderboards recalculated.

  - Player dashboards updated in real-time.

- **Alternative Flows:  
   **
  - Correction submitted → Admin adjusts scoresheet manually → Stats pipeline re-runs.

- **Postconditions:  
   **
  - Stats visible on team pages, player profiles, league leaderboards.

- **Data Involved:  
   **
  - player_id, team_id, stat aggregates (season + lifetime).

### **UC-14: Suspension/Eligibility Auto-Tracking**

- **UMS:** System, League Admin, Player, Captain

- **Preconditions:  
   **
  - Rules for suspensions/eligibility defined (e.g., 3 misconducts = 1 game suspension).

- **Trigger:** System detects infraction threshold in finalized scoresheets.

- **Main Flow:  
   **
  - System reviews player infractions after each game.

  - If suspension triggered → player flagged as "Suspended."

  - Notification sent to player, captain, and league admin.

  - Suspension automatically expires after defined games/time.

- **Alternative Flows:  
   **
  - Admin manually overrides suspension (reduce/extend/remove).

- **Postconditions:  
   **
  - Suspension status updated and tracked.

  - Player blocked from appearing on active roster until cleared.

- **Data Involved:  
   **
  - player_id, suspension flag, misconduct history, auto-expiration date.

### **UC-15: Player Pays Registration Fee**

- **UMS:** Player, Parent/Guardian (optional), Payment Gateway, System

- **Preconditions:  
   **
  - Player registered for season (pending payment).

  - Valid payment method available (credit card, wallet balance, offline option).

- **Trigger:** Player selects "Pay Registration Fee."

- **Main Flow:  
   **
  - Player views invoice in dashboard.

  - Player selects payment method (credit card, wallet, installment plan).

  - System connects to payment gateway (e.g., Stripe).

  - Payment processed; gateway returns confirmation.

  - System updates invoice status = Paid.

  - Confirmation email/SMS sent to player/parent.

- **Alternative Flows:  
   **
  - Payment fails → retry allowed; system logs failure and sends reminder.

  - Player chooses offline payment → Admin marks invoice manually as Paid.

- **Postconditions:  
   **
  - Invoice settled in system.

  - Player status = Active.

- **Data Involved:  
   **
  - invoice_id, player_id, amount, payment transaction token, invoice status.

### **UC-16: Captain Splits Team Dues Among Players**

- **UMS:** Captain, Players, System

- **Preconditions:  
   **
  - Team invoice created (full season dues).

  - Roster set up with registered players.

- **Trigger:** Captain selects "Split Dues" option.

- **Main Flow:  
   **
  - Captain enters split preferences (equal share, custom amounts).

  - System calculates individual player invoices.

  - Players notified of dues via email/SMS.

  - Players pay their share (UC-15).

  - System tracks total vs. outstanding balance.

- **Alternative Flows:  
   **
  - Player fails to pay by deadline → system sends auto-reminders.

  - Captain pays for missing balance using credit/wallet.

- **Postconditions:  
   **
  - Team invoice fully or partially settled.

- **Data Involved:  
   **
  - team_id, invoice_id, player_id, dues breakdown, payment status.

### **UC-17: Admin Issues Refund/Credit**

- **UMS:** League Admin, Player, System, Payment Gateway

- **Preconditions:  
   **
  - Player/team payment recorded.

  - Refund/credit request approved by Admin.

- **Trigger:** Admin selects "Issue Refund" or "Apply Credit."

- **Main Flow:  
   **
  - Admin selects transaction/invoice in dashboard.

  - Admin chooses refund (back to original payment method) or credit (to player wallet).

  - System processes request:
    - Refund → call payment gateway API.

    - Credit → update player wallet balance.

  - System updates invoice/transaction record.

  - Notification sent to player.

- **Alternative Flows:  
   **
  - Gateway refund fails → Admin notified with error log.

- **Postconditions:  
   **
  - Player receives refund/credit.

  - Financial records updated.

- **Data Involved:  
   **
  - invoice_id, transaction_id, refund_id, wallet balance, admin audit log.

### **UC-18: System Sends Overdue Payment Reminder**

- **UMS:** System, Player, Captain, Admin

- **Preconditions:  
   **
  - Invoice exists with unpaid balance past due date.

- **Trigger:** Automated job checks for overdue payments (daily).

- **Main Flow:  
   **
  - System identifies unpaid invoices.

  - System generates overdue reminder notification.

  - Notification sent to player (and captain if team dues).

  - System increments reminder count.

  - Late fee applied if configured.

- **Alternative Flows:  
   **
  - Admin disables auto-reminders for specific invoices.

- **Postconditions:  
   **
  - Player notified.

  - Late fees added where applicable.

- **Data Involved:  
   **
  - invoice_id, due_date, balance, notification log, late fee record.

### **UC-19: Admin Sends League-Wide Announcement**

- **UMS:** League Admin, System, Players, Captains, Parents, Refs

- **Preconditions:  
   **
  - Admin has permission to broadcast messages.

  - Recipients exist in league database.

- **Trigger:** Admin selects "Send Announcement."

- **Main Flow:  
   **
  - Admin drafts message (subject + body + attachments/links).

  - Admin selects recipients (all players, captains, refs, or specific divisions).

  - System sends message via chosen channels (email, SMS, push, in-app).

  - Delivery status tracked (delivered, failed).

- **Alternative Flows:  
   **
  - Delivery failure → retry or fallback to alternate channel (e.g., SMS if email bounces).

  - Admin schedules message for future time.

- **Postconditions:  
   **
  - Announcement sent and logged in system.

- **Data Involved:  
   **
  - announcement_id, league_id, message content, recipient list, delivery logs.

###

### **UC-20: Captain Sends Team Message**

- **UMS:** Captain, Players, Parents, System

- **Preconditions:  
   **
  - Captain assigned to a team.

  - Team roster active.

- **Trigger:** Captain selects "Send Message to Team."

- **Main Flow:  
   **
  - Captain drafts message.

  - Captain selects recipients (all players, specific roles, parents).

  - System delivers via email/SMS/in-app chat.

  - Team members receive notifications.

- **Alternative Flows:  
   **
  - Message blocked by system (e.g., inappropriate content if content moderation enabled).

  - Player opted out of specific channel → fallback to another.

- **Postconditions:  
   **
  - Team members receive and can respond (if enabled).

- **Data Involved:  
   **
  - team_id, message_id, recipients, message content, delivery log.

### **UC-21: Automated SMS/Push for Game Change**

- **UMS:** System, Players, Captains, Refs, Parents

- **Preconditions:  
   **
  - Game scheduled.

  - Notification preferences enabled.

- **Trigger:** Game time/location/status updated in system.

- **Main Flow:  
   **
  - Admin modifies schedule (manual or auto-reschedule).

  - System detects change and triggers notification event.

  - System generates SMS/push/email message with new details.

  - All affected users notified.

- **Alternative Flows:  
   **
  - User disabled SMS → fallback to email/push.

  - Notification delivery fails → system retries and logs failure.

- **Postconditions:  
   **
  - All stakeholders informed of schedule change.

- **Data Involved:  
   **
  - game_id, old vs new schedule data, recipients, delivery log.

### **UC-22: Stream Live Game on Team Page**

- **UMS:** System, Streaming Provider, Players, Parents, Fans, Admin

- **Preconditions:  
   **
  - Rink equipped with live-streaming camera (RTSP/RTMP supported).

  - Streaming service (e.g., LiveBarn, AWS IVS) integrated.

  - Team page exists in platform.

- **Trigger:** Game scheduled to start.

- **Main Flow:  
   **
  - Streaming feed initiates at game start.

  - System embeds live stream on relevant team and league pages.

  - Users log in and access stream (free or paywall).

  - System tracks view counts and access logs.

- **Alternative Flows:  
   **
  - Stream fails → fallback to recorded upload.

  - Pay-per-view enabled → prompt user for payment before access.

- **Postconditions:  
   **
  - Live video available to eligible viewers.

- **Data Involved:  
   **
  - game_id, stream_url, viewer logs, payment (if applicable).

###

### **UC-23: Auto-Highlight Generated on Goal**

- **UMS:** System, Scorekeeper, Players, Fans

- **Preconditions:  
   **
  - Game streamed live.

  - Scorekeeper logs events in real time.

- **Trigger:** Goal event entered in digital scoresheet.

- **Main Flow:  
   **
  - System detects goal event timestamp.

  - System clips ±10-15 seconds of video around event.

  - Highlight linked to player(s) involved.

  - Clip published on player profile, game recap, team page.

- **Alternative Flows:  
   **
  - System fails to auto-generate clip → Admin manually clips and assigns.

- **Postconditions:  
   **
  - Highlight available for replay and sharing.

- **Data Involved:  
   **
  - game_id, event timestamp, video clip metadata, player_id(s).

### **UC-24: User Uploads Video Clip**

- **UMS:** Player, Captain, Coach, System

- **Preconditions:  
   **
  - User authenticated with valid role.

  - File format supported (e.g., MP4).

- **Trigger:** User clicks "Upload Highlight/Video."

- **Main Flow:  
   **
  - User selects file and enters metadata (title, tags, player/team/game association).

  - System validates file type, size.

  - Video uploaded to media storage.

  - System generates thumbnail and transcodes for playback.

  - Clip published on relevant page (player profile, team gallery).

- **Alternative Flows:  
   **
  - Upload fails (size limit, network) → system retries or notifies user.

  - Content flagged → sent to moderator for review.

- **Postconditions:  
   **
  - Video stored and accessible within platform.

- **Data Involved:  
   **
  - media_id, uploader_id, storage URL, metadata, moderation flag.

### **UC-25: Auto-Create Team Store from Roster**

- **UMS:** System, League Admin, Team Captain, Players, Merchandising Partner (e.g., Shopify)

- **Preconditions:  
   **
  - Team roster finalized.

  - Merchandising integration enabled (API credentials for partner platform).

- **Trigger:** Admin or Captain selects "Generate Team Store."

- **Main Flow:  
   **
  - System pulls roster data (player names, jersey numbers).

  - System creates merchandise catalog (jerseys, hoodies, caps) with personalization options.

  - Catalog synced to e-commerce partner (e.g., Shopify store).

  - Store link published on team portal.

  - Notifications sent to players/parents with store link.

- **Alternative Flows:  
   **
  - Integration fails → Admin manually uploads CSV to partner platform.

  - Team opts out of merchandising → store not created.

- **Postconditions:  
   **
  - Team-branded merchandise store available online.

- **Data Involved:  
   **
  - team_id, roster list, product catalog, e-commerce integration metadata.

### **UC-26: Player Orders Jersey via Store**

- **UMS:** Player, Parent, E-commerce Partner, System

- **Preconditions:  
   **
  - Team store exists and is live.

  - Player roster linked to merchandise catalog.

- **Trigger:** Player/Parent visits store and places order.

- **Main Flow:  
   **
  - Player selects product (jersey/gear).

  - Player personalizes (name, number).

  - Order added to cart and checkout completed.

  - Payment processed by e-commerce partner.

  - Order confirmation sent to buyer and logged in system.

  - Order status updates (processing → shipped).

- **Alternative Flows:  
   **
  - Payment failure → retry or order canceled.

  - Inventory shortage → backorder flagged.

- **Postconditions:  
   **
  - Order processed with tracking details.

  - System logs transaction for record.

- **Data Involved:  
   **
  - order_id, player_id, product details, personalization, payment confirmation, shipping status.

### **UC-27: Player Signs Digital Waiver**

- **UMS:** Player, Parent/Guardian (if minor), System, League Admin

- **Preconditions:  
   **
  - Player registration in progress or pending.

  - Waiver templates configured in system.

- **Trigger:** Registration flow reaches waiver step.

- **Main Flow:  
   **
  - System displays digital waiver (injury liability, code of conduct, etc.).

  - Player (or parent/guardian if under 18) reviews waiver.

  - Player signs electronically (checkbox + digital signature or typed confirmation).

  - System stores waiver acceptance with timestamp and IP.

  - Registration continues.

- **Alternative Flows:  
   **
  - Waiver not signed → registration blocked.

  - Player uploads scanned signed copy → Admin verifies manually.

- **Postconditions:  
   **
  - Waiver record stored and linked to player profile.

- **Data Involved:  
   **
  - player_id, waiver_id, digital signature, timestamp, IP log.

###

### **UC-28: Parent Provides Consent for Minor**

- **UMS:** Parent/Guardian, Player, System

- **Preconditions:  
   **
  - Player is under 18.

  - Parent account linked to child player.

- **Trigger:** Parent attempts to register minor.

- **Main Flow:  
   **
  - Parent logs into platform and initiates registration for child.

  - System prompts for digital consent form.

  - Parent signs digital consent (checkbox + digital signature).

  - Consent stored in player's compliance record.

  - Registration proceeds.

- **Alternative Flows:  
   **
  - Parent declines → registration canceled.

  - Parent provides paper consent → Admin uploads scanned record.

- **Postconditions:  
   **
  - Consent record tied to player profile.

- **Data Involved:  
   **
  - parent_user_id, player_id, consent_id, digital signature, timestamp.

### **UC-29: Admin Validates ID/Eligibility Document**

- **UMS:** League Admin, Player, System

- **Preconditions:  
   **
  - Player uploaded ID/eligibility proof (e.g., birth certificate, governing body card).

- **Trigger:** Admin reviews player compliance queue.

- **Main Flow:  
   **
  - Admin selects pending eligibility document.

  - System displays uploaded file and associated metadata (DOB, division rules).

  - Admin validates document → marks Approved.

  - If invalid, Admin rejects with reason.

  - Notification sent to player/captain.

- **Alternative Flows:  
   **
  - Document unreadable → Admin requests resubmission.

  - Admin overrides with manual approval despite mismatch.

- **Postconditions:  
   **
  - Player eligibility status updated (Approved/Rejected).

- **Data Involved:  
   **
  - player_id, document_id, admin decision log, audit record.

### **UC-30: Referee Assigned Automatically to Game**

- **UMS:** System, League Admin, Referee

- **Preconditions:  
   **
  - Referee pool exists in system.

  - Availability and certification level recorded.

  - Games scheduled.

- **Trigger:** Admin or system runs referee assignment job.

- **Main Flow:  
   **
  - System reviews scheduled games and available referees.

  - Algorithm matches referees based on division, availability, and conflict rules.

  - Referee(s) assigned to game.

  - Assignment notification sent to referee and admin.

  - Referee confirms availability.

- **Alternative Flows:  
   **
  - No available referee → system flags for manual assignment.

  - Referee declines → system reassigns or escalates to admin.

- **Postconditions:  
   **
  - Referee(s) officially assigned to game.

- **Data Involved:  
   **
  - game_id, referee_id, assignment status, confirmation log.

### **UC-31: Captain Requests Substitute Player (Goalie911)**

- **UMS:** Captain, Substitute Pool Player, System, League Admin

- **Preconditions:  
   **
  - Substitute pool exists (pre-approved eligible players).

  - Team has shortage (injury, absence).

- **Trigger:** Captain selects "Request Substitute" for a game.

- **Main Flow:  
   **
  - Captain opens game details and clicks "Request Sub."

  - System shows list of eligible substitutes (with skill level/position).

  - Captain selects preferred substitute.

  - System sends request to substitute player.

  - Substitute accepts or declines.

  - If accepted, player added temporarily to roster for that game.

  - League Admin notified for oversight.

- **Alternative Flows:  
   **
  - No substitute accepts → Captain retries with other players.

  - Admin overrides and assigns substitute manually.

- **Postconditions:  
   **
  - Substitute added to game roster (temporary).

- **Data Involved:  
   **
  - game_id, team_id, substitute_id, confirmation logs, roster override flag.

### **UC-32: Parent Views Multiple Children's Schedules in Dashboard**

- **UMS:** Parent/Guardian, Player(s), System

- **Preconditions:  
   **
  - Parent account linked to two or more child player profiles.

  - Children registered for active leagues/teams.

- **Trigger:** Parent logs into portal or app.

- **Main Flow:  
   **
  - Parent selects "Family Dashboard."

  - System retrieves all linked children's schedules.

  - Dashboard displays combined calendar (games, practices, events).

  - Parent can filter by child/team/league.

  - Option to export to Google/iCal provided.

- **Alternative Flows:  
   **
  - One child not registered yet → system displays "No schedule available."

  - Parent links new child mid-season → dashboard auto-updates.

- **Postconditions:  
   **
  - Parent sees a unified schedule for all children.

- **Data Involved:  
   **
  - parent_user_id, child player_ids, schedule data, calendar export links.

### **UC-33: Player Belongs to Multiple Teams**

- **UMS:** Player, Captains, League Admin, System

- **Preconditions:  
   **
  - Player eligible to play in multiple divisions/teams.

  - Registration rules allow multi-team participation.

- **Trigger:** Player accepts invites or registers for more than one team.

- **Main Flow:  
   **
  - Player joins Team A via invite or registration.

  - Player also registers for Team B (same or different division).

  - System validates eligibility (no conflicting restrictions).

  - Player's dashboard aggregates schedules and stats across teams.

  - Notifications include all team-related communications.

- **Alternative Flows:  
   **
  - Scheduling conflict detected → system highlights overlap.

  - League Admin enforces limit (e.g., max 2 teams per season).

- **Postconditions:  
   **
  - Player active in multiple team rosters with combined schedule view.

- **Data Involved:  
   **
  - player_id, multiple team_ids, eligibility flags, combined stats/schedules.