# **Sports Pulse Platform Requirements**

**1\. Introduction**

### **1.1 Purpose**

The purpose of this document is to define the requirements for SportsPulse - a comprehensive sports league and club management platform that provides features comparable to and beyond existing systems such as **SportsEngine** and **Crossbar**. The platform will enable administrators, captains/coaches, referees, players and parents/guardians to seamlessly manage leagues, clubs, teams, schedules, finances, communications, and statistics via a web and mobile interface.

This document will serve as the foundation for:

- Development and architecture design.

- Stakeholder alignment (league operators, referees, coaches, players).

- QA/test planning and acceptance criteria.

- Future scalability for multi-sport adoption.

### **1.2 Scope**

The platform will provide:

- End-to-end season management (divisions, teams, scheduling, playoffs).

- Player and team registration, eligibility validation, and waiver management.

- Integrated payments, invoices, and financial tracking (with QuickBooks integration).

- Live scorekeeping, statistics tracking, and automated leaderboards.

- Video integration (live streaming, highlights, on-demand playback).

- Communication tools (SMS, email, push notifications, chat).
- Merchandising (team stores integrated with Shopify).

- Tournament and pickup-game scheduling/management.

- Compliance tools (waivers, IDs, SafeSport tracking, parental consent).

- Role-based permissions for different user categories.

The system will operate as a **cloud-hosted web application with companion mobile apps (iOS/Android)** and will scale across youth and adult organizations, single leagues and multi-sport clubs.

### **1.3 Definitions, Acronyms, and Abbreviations**

- **AR** - Accounts Receivable

- **RBAC** - Role-Based Access Control

- **API** - Application Programming Interface

- **GDPR/CCPA** - Data privacy compliance regulations

- **SafeSport** - USA Hockey compliance training program

- **Free Agent** - A player not yet assigned to a team

- **Subs Pool** - Pool of substitute players for filling roster gaps

### **1.4 References**

- **Sports Pulse Mind Map** - Feature mind map detailing needed modules  
   Sports Pulse Mind Map

- **User Roles & Data Comparison** - Roles, permissions and data model  
   User Roles, Data, Comparison

- SportsEngine and Crossbar (available open documentation)

### **1.5 Overview of Document Structure**

This document is structured as follows:

- Section 1: Introduction

- Section 2: Overall Description

- Section 3: System Features and Requirements

- Section 4: External Interface Requirements

- Section 5: System Architecture Overview

- Section 6: Non-Functional Requirements

- Section 7: Appendix

## **2\. Overall Description**

### **2.1 Product Perspective**

The platform shall be a **new, standalone system** built to provide flexibility for both **youth sports organizations** (with parent/guardian oversight, compliance) and **adult recreational leagues** (captain-led, self-managed teams).

It will include:

- **Services** (Registration, Rostering, Scheduling, Payments, Stats, Video, Messaging, Merchandising).

- **APIs** for integration with financial, merchandising, and streaming systems.

- **Responsive design** for web and **native mobile apps** for on-the-go use.

### **2.2 User Classes and Characteristics**

From the roles matrix

User Roles, Data, Comparison:

- **Guest**: View public standings, schedules, news. No edit permissions.

- **Player**: Register, join teams, view stats, make payments, manage communication preferences.

- **Parent/Guardian**: Register/manage child players, payments, waivers, consents.

- **Captain/Coach (Team Manager)**: Create/manage teams, invite/remove players, manage payments, submit game rosters and scoresheets.

- **Scorekeeper/Referee**: Game-day access to digital scoresheet, submit stats, finalize game results.

- **League Admin**: Manage seasons, divisions, schedules, rosters, discipline, financial overrides, league-wide communication.

- **Organization Admin (Super Admin)**: Multi-league/org-level management, billing, role assignment, global configuration.

- **Content Moderator**: Manage content, news, photos, comments.

- **Customer Support**: Read-only access with authority to issue credits/refunds.

### **2.3 Operating Environment**

- **Web App**: Accessible via browsers (Chrome, Safari, Edge, Firefox).

- **Mobile App**: iOS and Android (native, with offline capabilities for scorekeeping).

- **Hosting**: Cloud-native (AWS/Azure).

- **Database**: Relational DB (PostgreSQL/MySQL) with NoSQL support for logs/analytics.

- **3rd Party Integrations**: QuickBooks, Shopify, video streaming APIs, email/SMS gateways.

### **2.4 Constraints/compliance**

- Must comply with **payment security standards**.

- Must store only minimal medical info (emergency contacts, not diagnoses).

- Must comply with **GDPR/CCPA** for data retention and user consent.

- Offline scorekeeping must sync without data loss.

- Must support both youth compliance workflows and adult honor-system workflows.

### **2.5 Assumptions and Dependencies**

- Organizations have reliable internet access at least for administrative functions.

- Scorekeeping devices (iPads, tablets) provided by leagues.

- External integrations (QuickBooks, Shopify, SMS/email gateways) remain stable and available.

- Video features may depend on hardware (cameras at venue).

## **3\. System Features and Requirements**

### **3.1 Financial Tracking & Accounts Receivable (AR) Management**

**Description:** Provides administrators with tools to manage invoices, payments, refunds, credits, and integration with accounting systems.

**FR:**

- FR-3.1.1: Display real-time AR dashboard (team and player balances).

- FR-3.1.2: Track unpaid balances, payment plans, and overdue amounts.

- FR-3.1.3: Send automated reminders for overdue payments (email/SMS).

- FR-3.1.4: Export financial reports in CSV/PDF for accounting.

- FR-3.1.5: Support discount codes, family caps, and installment plans.

- FR-3.1.6: Apply late fees and charges for failed payments automatically.

- FR-3.1.7: Support offline payment logging.

- FR-3.1.8: Allow partial captain overrides with system safety checks.

- FR-3.1.9: Integrate with **QuickBooks** for financial syncing.

- FR-3.1.10: Track payroll for referees/scorekeepers.

**NFR:**

- Accuracy: ±0.1% in financial records.

- PCI DSS compliant storage/processing.

- Report generation within ≤5 seconds for up to 10,000 records.

### **3.2 Live Video Integration & Highlights**

**Description:** Allows live streaming, highlights, and automated video clipping of games.

**FR:**

- FR-3.2.1: Integrate live camera feeds (LiveBarn-style).

- FR-3.2.2: Stream games on team pages with optional pay-per-view.

- FR-3.2.3: Auto-highlight goals and key plays via scorekeeping integration.

- FR-3.2.4: Allow manual highlight clipping and user uploads.

- FR-3.2.5: Share clips by player, team, or game.

- FR-3.2.6: Support announcer/commentary audio feed.

**NFR:**

- Video streams must support **720p minimum, 3s latency**.

- Clips available for sharing within **2-3 minutes** of game event.

###

### **3.3 Goalie911 / Substitute Requests Tool**

**Description:** Provides captains and players a structured way to request substitutes.

**FR:**

- FR-3.3.1: Captains/players can request subs via portal.

- FR-3.3.2: System sends SMS alerts to ranked pool of eligible subs.

- FR-3.3.3: Enforce eligibility rules (level matching, availability).

- FR-3.3.4: Provide approval workflow for Division Head.

**NFR:**

- Notification delivery success ≥98% within 30 seconds.

### **3.4 Direct Online Registration & Auto-Roster Assignment**

**Description:** Streamlines registration and automatically updates team rosters.

**FR:**

- FR-3.4.1: Allow players to register directly to a team or as free agents.

- FR-3.4.2: Auto-assign jersey numbers and update rosters.

- FR-3.4.3: Captains can invite players from past rosters.

- FR-3.4.4: System sends alerts for players to confirm/decline registration.

- FR-3.4.5: Support waivers, code of conduct, ID uploads.

- FR-3.4.6: Flag mis-leveled players for admin review.

- FR-3.4.7: Auto-pitch free agents to captains to fill roster spots.

**NFR:**

- Registration process must complete in ≤3 minutes average.

- Secure document uploads (encryption at rest + in transit).

### **3.5 Live Stats, Standings & Schedule Integration**

**Description:** Tracks and displays real-time game stats, standings, and schedules.

**FR:**

- FR-3.5.1: iPad-compatible stat-entry app for scorekeepers.

- FR-3.5.2: Real-time update of scores and standings.

- FR-3.5.3: Display leaderboards by team, player, division.

- FR-3.5.4: Support attendance tracking and misconduct reports.

- FR-3.5.5: Allow sub-rosters and suspension tracking with auto-expiration.

**NFR:**

- Stats update latency ≤5 seconds.

- Uptime for schedule/stat services ≥99.9%.

### **3.6 Credit & Wallet System**

**FR:**

- FR-3.6.1: Player wallet for credits/gift cards.

- FR-3.6.2: Credits usable for fees, tournaments, or apparel.

- FR-3.6.3: Transferable balances between users.

**NFR:**

- Credit transfer should confirm within 2 seconds.

### **3.7 Team Stores (Factory Gear/Shopify Integration)**

**FR:**

- FR-3.7.1: Auto-generate team store based on roster.

- FR-3.7.2: Integrate with Shopify for fulfillment.

- FR-3.7.3: Support seasonal ordering windows and jersey color selection.

**NFR:**

- Store availability 24/7 with >99.5% uptime.

### **3.8 Scheduling & Ice Allocation**

**FR:**

- FR-3.8.1: Input available rink times and restrictions.

- FR-3.8.2: Auto-generate balanced schedules.

- FR-3.8.3: Track ice usage and utilization.

- FR-3.8.4: Support blackout times, league vs. tournament modes.

**NFR:**

- Auto-schedule generation for 200+ games in ≤60 seconds.

### **3.9 Referee Scheduling & Notifications**

**FR:**

- FR-3.9.1: Auto-assign refs based on availability and skill.

- FR-3.9.2: Notify refs of changes via SMS/app.

- FR-3.9.3: Dashboard for assigners with override rights.

**NFR:**

- Notifications within ≤30 seconds of schedule change.

### **3.10 Team & Player Notifications**

**FR:**

- FR-3.10.1: Automated notifications for game changes, suspensions, eligibility.

- FR-3.10.2: Multi-channel delivery: email, SMS, push.

**NFR:**

- Delivery success ≥98%.

### **3.11 Captain Dashboard & Roster Management**

**FR:**

- FR-3.11.1: Captains can add/drop players pre-roster lock.

- FR-3.11.2: Edit jersey numbers, contact info.

- FR-3.11.3: Auto-track playoff eligibility.

- FR-3.11.4: Import/export roster tools.

**NFR:**

- Roster updates must reflect within ≤2 seconds.

### **3.12 Advanced Menu Navigation**

**FR:**

- FR-3.12.1: Multi-level navigation (Org > League > Division > Team).

- FR-3.12.2: Breadcrumbs and site map for easy navigation.

**NFR:**

- Load times ≤2 seconds per navigation step.

### **3.13 Playoff Seeding & Bracket Auto-Fill**

**FR:**

- FR-3.13.1: Define points per win/tie/OT.

- FR-3.13.2: Auto-generate playoff brackets.

- FR-3.13.3: Publish games to schedules.

**NFR:**

- Bracket generation ≤5 seconds.

### **3.14 Pickup Hockey Scheduling**

**FR:**

- FR-3.14.1: Online registration with payment for pickup games.

- FR-3.14.2: Cap number of skaters/goalies.

- FR-3.14.3: Auto-balance teams by skill rating.

- FR-3.14.4: Waitlist functionality.

**NFR:**

- Team assignment algorithm ≤2 seconds.

### **3.15 Tournament Registration & Management**

**FR:**

- FR-3.15.1: Tournament landing pages.

- FR-3.15.2: Automated roster validation.

- FR-3.15.3: Scheduling software with fair matchups.

- FR-3.15.4: Mobile-first score updates.

- FR-3.15.5: License scan for ID checks.

**NFR:**

- Tournament dashboard must support 100+ teams simultaneously.

### **3.16 Family & Multi-Team Dashboard**

**FR:**

- FR-3.16.1: Parents can manage multiple children/teams.

- FR-3.16.2: Sync calendar, payments, messages across linked accounts.

**NFR:**

- Calendar sync updates within 60 seconds.

### **3.17 Team Communication Tools**

**FR:**

- FR-3.17.1: Built-in chat, SMS, email.

- FR-3.17.2: Announcements from captains/coaches.

- FR-3.17.3: Auto-reminders for payments and games.

**NFR:**

- Message delivery success ≥98%.

### **3.18 Custom Forms, Surveys & Feedback**

**FR:**

- FR-3.18.1: Custom forms for waivers, evaluations, feedback.

- FR-3.18.2: Export data to CSV.

**NFR:**

- Form submission latency ≤2 seconds.

### **3.19 Admin/Backend Functionality**

**FR:**

- FR-3.19.1: Full CMS-style admin dashboard.

- FR-3.19.2: Role-based permissions (RBAC).

- FR-3.19.3: Audit logs and activity tracking.

- FR-3.19.4: Email marketing (built-in or Mailchimp API).

**NFR:**

- Admin UI must handle 500+ concurrent users without degradation.

### **3.20 Coaches Practice Corner**

**FR:**

- FR-3.20.1: Upload/share practice plans (PDF, video).

- FR-3.20.2: Assign jerseys for practices.

- FR-3.20.3: Video breakdown integration (HUDL-style).

**NFR:**

- Practice content upload ≤50 MB per file.

### **3.21 Mobile App Features**

**FR:**

- FR-3.21.1: Provide schedules, standings, stats, rosters.

- FR-3.21.2: Support push notifications.

- FR-3.21.3: Role-based views (Player, Captain, Admin, Ref).

**NFR:**

- App must sync updates within ≤5 seconds of web changes.

- Offline mode for scorekeeping.

# **4\. External Interface Requirements**

### **4.1 User Interfaces (UI)**

- **Web Application  
   **
  - Responsive design (desktop, tablet, mobile browsers).

  - Intuitive dashboards for Players, Captains, Admins, Refs, Parents.

  - Multi-level navigation with breadcrumbs (Org → League → Division → Team).

  - Accessibility compliant (WCAG 2.1 AA).

- **Mobile Application (iOS/Android)  
   **
  - Role-specific interfaces (Player, Captain, Ref, Admin).

  - Offline mode for referees/scorekeepers.

  - Push notifications for events, games, payments, and alerts.

- **Admin/Back-Office Dashboard  
   **
  - Content Management System (CMS) for schedules, rosters, news, and stats.

  - Permission-based access (RBAC) from **roles doc  
     **User Roles, Data, Comparison  
     .

  - Bulk import/export tools (CSV, Excel).

### **4.2 Hardware Interfaces**

- **Scorekeeper Tablets (iPad/Android)**: Used for digital scoresheets and stat tracking.

- **Streaming Cameras (Rink Installations)**: Integrates via RTSP/RTMP feeds.

- **Point-of-Sale (POS) Hardware (optional)**: For rink/merchandise sales.

### **4.3 Software Interfaces**

- **Payment Gateways**: Stripe, PayPal, Authorize.net (PCI DSS compliant).

- **Accounting**: QuickBooks integration for AR and payroll.

- **Merchandise**: Shopify integration for team stores.

- **Streaming**: Video APIs (e.g., LiveBarn, AWS IVS, YouTube Live).

- **Messaging**: SMS/Email providers (e.g., Twilio, SendGrid).

### **4.4 Communication Interfaces**

- **Email/SMS**: Notifications, invoices, reminders.

- **Push Notifications**: Real-time alerts for mobile apps.

- **In-App Chat/Announcements**: Team communication channels.

- **APIs**: REST/GraphQL endpoints for 3rd-party integration.

# **5\. System Architecture Overview**

### **5.1 Architectural Style**

- **Architecture Pattern:** Modular, microservices-based with API-first design.

- **Deployment Model:** Cloud-native (AWS/Azure/GCP).

- **Client Applications:** Responsive Web App + Native Mobile Apps (iOS, Android).

- **Integration:** REST/GraphQL APIs for external services (payments, accounting, video, messaging).

### **5.2 High-Level Components**

#### **A. Presentation Layer (UI/UX)**

- **Web Frontend:** React/Angular-based responsive interface.

- **Mobile Apps:** Native iOS (Swift) and Android (Kotlin), offline-capable.

- **Admin Dashboard:** Role-based dashboards for League Admins, Org Admins, Captains, Players.

- **Scorekeeping App:** Simplified UI optimized for tablets (iPad/Android).

#### **B. Application Layer (Business Logic Services)**

- **Registration & Compliance Service  
   **
  - Player registration, waivers, parental consent, eligibility validation.

- **Roster Management Service  
   **
  - Team creation, player assignment, free agent pool, captain approvals.

- **Scheduling Service  
   **
  - Auto-scheduling, manual overrides, blackout dates, playoff seeding, rink allocation.

- **Stats & Game Operations Service  
   **
  - Digital scoresheets, live stats updates, discipline queue, suspension management.

- **Finance & Payments Service  
   **
  - Invoices, AR dashboard, payment plans, refunds, QuickBooks sync.

- **Wallet & Credit Service  
   **
  - Player wallets, gift cards, credit transfers.

- **Communication Service  
   **
  - Email, SMS, push notifications, team chat.

- **Video Service  
   **
  - Live streaming, highlights, uploads, pay-per-view support.

- **Merchandise Service  
   **
  - Shopify integration, team stores auto-generated from rosters.

- **Survey & Feedback Service  
   **
  - Waivers, evaluations, polls, custom forms.

#### **C. Data Layer (Persistence & Storage)**

- **Relational Database (PostgreSQL/MySQL):** Core system data (users, teams, schedules, payments).

- **NoSQL Database (MongoDB/DynamoDB):** Logs, analytics, unstructured content.

- **Media Storage (S3/Azure Blob):** Videos, highlights, practice plans.

- **Caching (Redis/Memcached):** Low-latency for schedules, rosters, stats.

#### **D. Integration Layer (APIs & External Systems)**

- **Payments:** Stripe/PayPal/Authorize.net.

- **Accounting:** QuickBooks.

- **Streaming:** LiveBarn/AWS IVS/YouTube Live.

- **Merchandising:** Shopify.

- **Messaging:** Twilio (SMS), SendGrid (Email), Firebase/APNS (push notifications).

### **5.3 Security Architecture**

- **Authentication:** OAuth2.0 / OpenID Connect (SSO possible for larger orgs).

- **Authorization:** Role-Based Access Control (RBAC) aligned with roles  
   User Roles, Data, Comparison

- **Encryption:** TLS 1.3 for all in-transit data; AES-256 for at-rest data.

- **Audit Logs:** Immutable logging of key actions (registrations, payments, roster changes).

- **Data Privacy:** GDPR/CCPA compliance; youth data stored with parental linkage.

### **5.4 Scalability & Performance**

- **Horizontal Scaling:** Microservices can scale independently (Kubernetes/Docker).

- **Load Balancing:** API Gateway with autoscaling clusters.

- **Content Delivery Network (CDN):** For media and static assets.

- **Database Replication:** Read replicas for high-traffic queries (e.g., stats).

### **5.5 Reliability & Availability**

- **Uptime Target:** 99.9% SLA.

- **Disaster Recovery:** Automated daily backups, RTO ≤ 4 hours, RPO ≤ 15 minutes.

- **Failover:** Multi-region deployment for mission-critical services.

### **5.6 High-Level System Diagram (Textual Representation)**

+--------------------------------------------------------------+

| Presentation Layer |

| - Web UI - Mobile Apps - Admin Dashboard - Ref App |

+--------------------------------------------------------------+

| | |

v v v

+--------------------------------------------------------------+

| Application Layer (Microservices) |

| Registration | Rostering | Scheduling | Stats | Finance |

| Wallet | Communication | Video | Merchandising | Surveys |

+--------------------------------------------------------------+

| | |

v v v

+--------------------------------------------------------------+

| Data & Storage Layer |

| Relational DB | NoSQL Logs | Media Storage | Cache |

+--------------------------------------------------------------+

| | |

v v v

+--------------------------------------------------------------+

| External Integrations & APIs |

| Payments | QuickBooks | Shopify | Streaming | Messaging |

+--------------------------------------------------------------+

# **6\. Non-Functional Requirements (NFRs)**

### **6.1 Performance**

- **NFR-6.1.1:** Average system response time for user-facing actions (login, roster lookup, schedule query) shall be ≤ 2 seconds.

- **NFR-6.1.2:** Bulk schedule generation (200+ games) shall complete in ≤ 60 seconds.

- **NFR-6.1.3:** Financial reports (10,000+ records) shall generate in ≤ 5 seconds.

- **NFR-6.1.4:** Real-time stats update latency shall be ≤ 5 seconds from entry to public display.

### **6.2 Scalability**

- **NFR-6.2.1:** The system shall support **10,000 concurrent users** with no degradation.

- **NFR-6.2.2:** The system shall scale horizontally by microservice, allowing independent scaling of stats, scheduling, video, etc.

- **NFR-6.2.3:** The system shall support **multi-league, multi-sport organizations** from the same core platform.

### **6.3 Security**

- **NFR-6.3.1:** All user data in transit shall be encrypted with TLS 1.3 or higher.

- **NFR-6.3.2:** All sensitive data at rest shall be encrypted with AES-256.

- **NFR-6.3.3:** Authentication shall be handled via OAuth 2.0 / OpenID Connect.

- **NFR-6.3.4:** Authorization shall use **Role-Based Access Control (RBAC)** based on roles defined in the system  
   User Roles, Data, Comparison  
   .

- **NFR-6.3.5:** Payment processing shall comply with **PCI DSS v4.0**.

- **NFR-6.3.6:** Personal data shall be stored and managed in compliance with **GDPR** and **CCPA**.

- **NFR-6.3.7:** The system shall maintain immutable audit logs for key actions (registrations, roster changes, financial overrides).

### **6.4 Reliability & Availability**

- **NFR-6.4.1:** The platform shall guarantee **99.9% uptime SLA**.

- **NFR-6.4.2:** Disaster recovery objectives: RTO ≤ 4 hours, RPO ≤ 15 minutes.

- **NFR-6.4.3:** Critical services (registration, payments, scheduling) shall have failover across multiple availability zones.

- **NFR-6.4.4:** Automated daily backups with retention of 30 days.

### **6.5 Usability**

- **NFR-6.5.1:** Web and mobile UIs shall comply with **WCAG 2.1 AA accessibility standards**.

- **NFR-6.5.2:** Average learning curve for new users (Players, Captains, Parents) should not exceed **30 minutes**.

- **NFR-6.5.3:** Mobile app workflows (check schedules, register, make payments) should require ≤ 5 clicks/taps.

- **NFR-6.5.4:** System navigation must support breadcrumb trails and search for quick access.

### **6.6 Maintainability & Extensibility**

- **NFR-6.6.1:** The system shall use modular microservices to allow future feature expansion without rewriting core modules.

- **NFR-6.6.2:** All services shall expose APIs documented with **OpenAPI (Swagger)**.

- **NFR-6.6.3:** Codebase shall follow clean architecture principles with separation of concerns.

- **NFR-6.6.4:** Each release shall include automated regression test suites.

### **6.7 Compliance**

- **NFR-6.7.1:** Youth leagues must support parental/guardian consent flows.

- **NFR-6.7.2:** Waivers and code of conduct documents must be version-controlled with digital signature tracking.

- **NFR-6.7.3:** Player eligibility must respect governing body rules (e.g., USA Hockey ID verification).

- **NFR-6.7.4:** Medical info stored shall be limited to emergency contacts and allergy notes only (no diagnoses).

# **7\. Appendices**

## **7.1 Permission Matrix (abridged, traceable to roles doc)**

Below is a concise permission matrix showing which role types can perform typical actions. This is an abridged, high-level view - the production RBAC should be implemented as a permission table in the system (ability to toggle per league/org).

| **Action / Permission**           | **Guest** | **Player** | **Parent/Guardian** | **Captain / Coach** | **Scorekeeper / Ref** | **League Admin** | **Org Admin** | **Content Moderator** | **Support**               |
| --------------------------------- | --------- | ---------- | ------------------- | ------------------- | --------------------- | ---------------- | ------------- | --------------------- | ------------------------- |
| View public schedules & standings | ✓         | ✓          | ✓                   | ✓                   | ✓                     | ✓                | ✓             | ✓                     | ✓                         |
| ---                               | ---       | ---        | ---                 | ---                 | ---                   | ---              | ---           | ---                   | ---                       |
| Register / complete waiver        | ✗         | ✓          | ✓                   | ✗                   | ✗                     | ✓ (override)     | ✓ (override)  | ✗                     | ✗                         |
| ---                               | ---       | ---        | ---                 | ---                 | ---                   | ---              | ---           | ---                   | ---                       |
| Create team                       | ✗         | ✗          | ✗                   | ✓ (captain/coach)   | ✗                     | ✓                | ✓             | ✗                     | ✗                         |
| ---                               | ---       | ---        | ---                 | ---                 | ---                   | ---              | ---           | ---                   | ---                       |
| Invite/remove players             | ✗         | ✗          | ✗                   | ✓ (their team)      | ✗                     | ✓                | ✓             | ✗                     | ✗                         |
| ---                               | ---       | ---        | ---                 | ---                 | ---                   | ---              | ---           | ---                   | ---                       |
| Submit/Finalize scoresheet        | ✗         | ✗          | ✗                   | ✓ (if enabled)      | ✓                     | ✓ (override)     | ✓             | ✗                     | ✗                         |
| ---                               | ---       | ---        | ---                 | ---                 | ---                   | ---              | ---           | ---                   | ---                       |
| Approve roster / eligibility      | ✗         | ✗          | ✗                   | ✗                   | ✗                     | ✓                | ✓             | ✗                     | ✗                         |
| ---                               | ---       | ---        | ---                 | ---                 | ---                   | ---              | ---           | ---                   | ---                       |
| Create season/division/schedule   | ✗         | ✗          | ✗                   | ✗                   | ✗                     | ✓                | ✓             | ✗                     | ✗                         |
| ---                               | ---       | ---        | ---                 | ---                 | ---                   | ---              | ---           | ---                   | ---                       |
| Manage payments / refunds         | ✗         | ✓ (own)    | ✓ (child)           | ✓ (team fees)       | ✗                     | ✓                | ✓             | ✗                     | ✓ (issue credits/refunds) |
| ---                               | ---       | ---        | ---                 | ---                 | ---                   | ---              | ---           | ---                   | ---                       |
| Assign refs / view ref dashboard  | ✗         | ✗          | ✗                   | ✗                   | ✗                     | ✓                | ✓             | ✗                     | ✗                         |
| ---                               | ---       | ---        | ---                 | ---                 | ---                   | ---              | ---           | ---                   | ---                       |
| Edit site content / news          | ✗         | ✗          | ✗                   | ✗                   | ✗                     | ✓                | ✓             | ✓                     | ✗                         |
| ---                               | ---       | ---        | ---                 | ---                 | ---                   | ---              | ---           | ---                   | ---                       |
| View audit logs                   | ✗         | ✗          | ✗                   | ✗                   | ✗                     | ✓ (scoped)       | ✓             | ✗                     | ✗                         |
| ---                               | ---       | ---        | ---                 | ---                 | ---                   | ---              | ---           | ---                   | ---                       |

_Notes:_

- Captains can manage their own team(s); League Admins can manage all teams within a league; Org Admins can manage all leagues and configure global policies.

- Support has scoped refund/credit ability; full financial overrides are limited to League/Org Admins.

- Implementation should permit creating custom roles and role inheritance for large organizations.

## **7.2 Data Schema Outline (Core Entities)**

The following is a compact logical schema (entities, key attributes). This is intended as a starting point for the database design and API contracts. Use UUIDs as primary keys for cross-service safety.

(TBD)

## **7.3 Glossary (Selection)**

- **AR (Accounts Receivable):** Money owed to the league by players/teams.

- **RBAC:** Role-Based Access Control, permissions assigned by role and scope.

- **Free Agent:** Player not assigned to a team in the current season.

- **Scoresheet:** Structured game log of events used to generate stats and finalize results.

- **Waiver:** Legal agreement (digital) that a player signs to participate.

- **RTO / RPO:** Recovery Time Objective / Recovery Point Objective in DR planning.

- **SafeSport:** Governing training/compliance program required for youth sports personnel.

## **7.4 Acceptance Criteria (per major area)**

To help QA and Product mark features complete, these acceptance criteria link to the SRD requirements.

- **Registration:** Player can register, sign waiver, and be assigned to team; system prevents underaged registration without parent consent.

- **Payments:** Invoices created and paid through configured gateway; failed payments retry logic works and late fee applies per rule.

- **Scheduling:** Auto-scheduler generates non-conflicting schedules respecting blackout windows; admins can perform overrides and publish changes.

- **Stats:** Scorekeeper can enter game events; once finalized by ref/scorekeeper, stats and leaderboards update in ≤5 seconds and persist.

- **Ref Scheduling:** Auto-assignment selects eligible refs and notifies them; assigner UI allows manual override.

- **Video:** Live stream embed works on team page; highlight clips can be created and shared.

- **Compliance:** Waivers stored with version and timestamp; SafeSport/ID verification flag can be tracked.

## **7.5 Security & Privacy Appendix (short checklist)**

- (TBD)

## **7.6 Next Steps & Handoff Checklist (TBD)**

- **Stakeholder review:** TBD

- **Design:** UX flows for Captain, Player, Admin, and Scorekeeper (tablet-first for scores).

- **Proof-of-Concept:** TBD
- **Implementation plan:** Sprints/Milestones, acceptance criteria, environment setup (dev/staging/prod).