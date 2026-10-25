// Shared response shapes — keep in sync with API DTOs

export interface ApiError {
  error: { code: string; message: string };
}
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface Profile {
  id: string;
  email: string | null;
  legalFirstName: string | null;
  legalLastName: string | null;
  preferredName: string | null;
  displayName: string | null;
  countryCode: string | null;
  locale: string;
  timezone: string;
  status: "pending" | "active" | "suspended" | "deleted";
  isSuperAdmin: boolean;
  /** Region names reached through roles and rosters (list endpoint only). */
  regions?: string[];
  createdAt: string;
  updatedAt: string;
}

/** A team's instance in one division (division_team_entries), with names. */
export interface TeamEntry {
  id: string;
  teamId: string;
  divisionId: string;
  divisionName: string;
  seasonId: string;
  seasonName: string;
  leagueId: string;
  leagueName: string;
  entryStatus: string;
  movementKind: "rollover" | "division_shift" | "league_migration" | null;
  previousEntryId: string | null;
  carryStandings: boolean;
  complianceFlags: Record<string, unknown>;
  joinedAt: string;
  leftAt: string | null;
}

export type TeamMovementKind = "rollover" | "division_shift" | "league_migration" | "org_move";

/** One row of the team movement audit, with names resolved. */
export interface TeamMovement {
  id: string;
  teamId: string;
  kind: TeamMovementKind;
  fromEntryId: string | null;
  toEntryId: string | null;
  fromDivisionId: string | null;
  fromDivisionName: string | null;
  toDivisionId: string | null;
  toDivisionName: string | null;
  fromOrgId: string | null;
  fromOrgName: string | null;
  toOrgId: string | null;
  toOrgName: string | null;
  resetStandings: boolean | null;
  rosterCopied: number;
  complianceFlags: Record<string, unknown>;
  reason: string | null;
  movedByUserId: string | null;
  movedByName: string | null;
  createdAt: string;
}

export interface TeamMovementResult {
  movement: TeamMovement;
  entry: TeamEntry | null;
  /** What the admin still has to do after this move. */
  warnings: string[];
  replayed: boolean;
  standingsRecomputed?: boolean;
  standingsError?: string | null;
}

/** Region tier owned by an org and reused across seasons. */
export interface Region {
  id: string;
  orgId: string;
  name: string;
  status: "active" | "archived";
  sortOrder: number;
  divisionCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Person {
  id: string;
  userId: string | null;
  legalFirstName: string;
  legalLastName: string;
  preferredName: string | null;
  dobDate: string | null;
  countryCode: string | null;
  photoUrl: string | null;
  externalIds: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export type OrgType =
  | "governing_body"
  | "federation"
  | "league_operator"
  | "club"
  | "association"
  | "school"
  | "tournament_operator";

export interface Org {
  id: string;
  slug: string;
  legalName: string;
  displayName: string;
  orgType: OrgType;
  countryCode: string;
  defaultLocale: string;
  defaultCurrency: string;
  defaultTimezone: string;
  status: "active" | "suspended" | "archived";
  createdAt: string;
  updatedAt: string;
}

export interface GoverningBody {
  id: string;
  code: string;
  name: string;
  sportCode: string;
  countryCode: string | null;
  /** international | national | regional | state | local */
  scope: string;
  parentId: string | null;
}

export interface AgeGroup {
  id: string;
  governingBodyId: string;
  code: string;
  label: string;
  birthYearMin: number | null;
  birthYearMax: number | null;
  /** male | female | mixed | open */
  genderEligibility: string;
}

export type SeasonStatus =
  | "draft"
  | "registration_open"
  | "in_progress"
  | "playoffs"
  | "completed"
  | "archived";

export interface Season {
  id: string;
  /** Post-flip — seasons live under a league. */
  leagueId: string;
  /** Denormalised, matches league.orgId. */
  orgId: string;
  /**
   * Per-season admin toggles (migration 0016). Schema:
   * @sportspulse/kernel SeasonConfig.
   */
  config?: Record<string, unknown>;
  name: string;
  sportCode: string;
  startDate: string;
  endDate: string;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
  rosterLockAt: string | null;
  /** Playoff window, YYYY-MM-DD; both null when no playoffs. */
  playoffStartDate?: string | null;
  playoffEndDate?: string | null;
  timezone: string;
  status: SeasonStatus;
  createdAt: string;
  updatedAt: string;
}

export interface League {
  id: string;
  /** Post-flip — leagues live under an org. */
  orgId: string;
  sportCode: string;
  governingBodyId: string | null;
  ruleSetId: string | null;
  name: string;
  format: "regular" | "tournament" | "pickup" | "friendly";
  status: "draft" | "active" | "archived";
  /**
   * Free-form JSONB. Conventional keys written by /org-setup wizard:
   *   - slug: URL-safe identifier
   *   - branding: { logoUrl, primaryColor }
   *   - privacy: "public" | "unlisted" | "private"
   *   - timezone: IANA TZ string
   */
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Division {
  id: string;
  /** Post-flip — divisions live under a season. */
  seasonId: string;
  ageGroupId: string | null;
  /** Region tier (Season -> Region -> Division); null when unset. */
  regionId: string | null;
  /** Resolved by the API so screens never print a region id. */
  regionName?: string | null;
  name: string;
  tier: string | null;
  genderEligibility: "male" | "female" | "mixed" | "open";
  maxTeams: number | null;
  /**
   * JSONB — game rules + tiebreakers + ageRange written by /org-setup
   * Phase 3. Conventional shape:
   *   { gameRules: GameRules, tiebreakers: TiebreakerCode[], ageRange: { min, max, label } }
   */
  ruleSetOverrides?: Record<string, unknown>;
  /**
   * JSONB — playoff config written by /org-setup Phase 3:
   *   { enabled, playoffSpots, startDate, endDate, seriesFormat,
   *     bracketType, homeIceRule }
   */
  playoffConfig?: Record<string, unknown>;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
}

export interface Team {
  id: string;
  orgId: string;
  /** Display name of the owning org — denormalised by the API list/get
   * handlers so consumers don't have to client-join orgs.list(). Null
   * when the org row has been deleted. */
  ownerOrgName: string | null;
  name: string;
  shortName: string | null;
  sportCode: string;
  logoUrl: string | null;
  status: "active" | "dissolved";
  /** Workflow 7A — denormalised current captain. */
  captainUserId: string | null;
  /** Captain's display name or email (null when unknown). */
  captainName?: string | null;
  /** Workflow 7A — cents needed to auto-confirm a division entry. */
  confirmationThresholdCents: number;
  /** Stored under teams.externalIds.homeRink. */
  homeRink: string | null;
  /** { primary?, secondary? } hex strings. */
  colors: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Registration {
  id: string;
  idempotencyKey: string;
  orgId: string;
  formVersionId: string;
  submittedByUserId: string | null;
  subjectPersonId: string;
  status:
    | "draft"
    | "submitted"
    | "under_review"
    | "approved"
    | "rejected"
    | "waitlisted"
    | "withdrawn"
    // v2 states (migration 0014):
    | "pending_verification"
    | "pending_consent"
    | "pending_payment"
    | "pending_offline"
    | "pending_review"
    | "incomplete"
    | "cancelled";
  leagueId: string | null;
  divisionId: string | null;
  /**
   * Resolved season (from division.seasonId, falling back to the
   * form's seasonId). Surfaces on the self-registration endpoints
   * so the player-web "Find a team" flow can pass it straight
   * through to applyToTeam.
   */
  seasonId: string | null;
  teamId: string | null;
  submittedAt: string | null;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  decisionReason: string | null;
  createdAt: string;
  updatedAt: string;
  /** Subject person's name (null when unknown). */
  subjectName?: string | null;
  /** Team name when the registration names a team. */
  teamName?: string | null;
}

/**
 * Mirror of FormPurpose in @sportspulse/kernel. Re-declared here so the
 * SDK package stays runtime-zero-dep — the source of truth lives in
 * `packages/kernel/src/form-purposes.ts` (and the DB CHECK constraint).
 */
export type FormPurpose =
  | "season_registration"
  | "role_profile"
  | "team_application"
  | "custom";

export interface RegistrationForm {
  id: string;
  orgId: string;
  scope: "org" | "league" | "division" | "season";
  scopeId: string | null;
  /** Name of the scoped league/season/division (list endpoint only). */
  scopeName?: string | null;
  /** Season this form is the registration shell for. */
  seasonId: string | null;
  name: string;
  description: string | null;
  /**
   * What flow the form serves. Drives where the form-builder UI surfaces
   * it and which queries pick it up (funnel vs role-profile editor).
   */
  purpose: FormPurpose;
  /**
   * Role codes this form applies to. Empty = applies to every role in
   * scope. Form-builder UI surfaces a multi-select against
   * SYSTEM_ROLE_CODES from @sportspulse/kernel.
   */
  appliesToRoles: string[];
  activeVersionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type EligibilityStatus =
  | "pending"
  | "eligible"
  | "ineligible"
  | "expiring"
  | "expired"
  | "flagged"
  | "waived";

export interface EligibilityRecord {
  id: string;
  personId: string;
  seasonId: string | null;
  governingBodyId: string | null;
  status: EligibilityStatus;
  waiverReason: string | null;
  ruleEvaluation: Record<string, unknown>;
  effectiveFrom: string;
  effectiveTo: string | null;
  evaluatedAt: string;
}

export interface ConsentSignature {
  id: string;
  personId: string;
  documentVersionId: string;
  signedAt: string;
  ipAddr: string | null;
  userAgent: string | null;
  signedByUserId: string | null;
  signatureBlobUrl: string | null;
  revokedAt: string | null;
  revokedReason: string | null;
  /** Signed document's name and version (null when unknown). */
  documentName?: string | null;
  documentVersionNumber?: number | null;
}

/**
 * One document a registration must have signed before it can be
 * submitted (REG-5): the liability waiver or the code of conduct. Same
 * shape the funnel and the player /compliance page read.
 */
export interface RegistrationDocumentStatus {
  key: "liability_waiver" | "code_of_conduct";
  kind: "waiver" | "code_of_conduct";
  title: string;
  contentHtml: string;
  /** typed_name: scroll + type full legal name. acknowledge: one confirmation. */
  signMode: "typed_name" | "acknowledge";
  documentVersionId: string | null;
  signed: boolean;
  signedAt: string | null;
  signatureId: string | null;
}

/** A registration of the caller (or their linked minor) and its documents. */
export interface MyRegistrationDocuments {
  registrationId: string;
  seasonId: string;
  seasonName: string;
  orgName: string | null;
  status: string;
  subjectName: string;
  signingFor: "self" | "minor";
  /** Name the caller types to sign; null when none is on file. */
  signerName: string | null;
  documents: RegistrationDocumentStatus[];
}

// ----- Uploaded ID / eligibility documents (COMP-3, COMP-1 / UC-29) -----
// Enums and labels: @sportspulse/kernel compliance-documents.ts.

/** A season / registration the caller may upload a document for. */
export interface ComplianceUploadTarget {
  personId: string;
  personName: string;
  /** True when the person is a minor linked to the caller. */
  forMinor: boolean;
  orgId: string;
  orgName: string | null;
  seasonId: string | null;
  seasonName: string | null;
  registrationId: string | null;
  teamName: string | null;
}

export interface ComplianceDocumentDecisionEntry {
  decision: "approved" | "rejected" | "resubmit_requested";
  reason: string | null;
  decidedAt: string;
  decidedByName: string | null;
}

export interface ComplianceDocumentSubmission {
  id: string;
  personId: string;
  personName: string;
  orgId: string;
  orgName: string | null;
  seasonId: string | null;
  seasonName: string | null;
  registrationId: string | null;
  documentVersionId: string | null;
  kind: "birth_certificate" | "governing_body_card" | "government_id" | "signed_waiver" | "other";
  contentType: string;
  sizeBytes: number;
  status: "pending" | "approved" | "rejected" | "resubmit_requested" | "withdrawn";
  submittedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  latestDecision: ComplianceDocumentDecisionEntry | null;
}

/** Review-queue row: the submission plus what the reviewer checks it against. */
export interface AdminComplianceDocument extends ComplianceDocumentSubmission {
  dobDate: string | null;
  submittedByName: string | null;
  /** True when someone other than the person uploaded it (a guardian). */
  submittedByOther: boolean;
  divisionName: string | null;
  divisionGender: string | null;
  ageGroupLabel: string | null;
  birthYearMin: number | null;
  birthYearMax: number | null;
  sha256: string;
  decisions: ComplianceDocumentDecisionEntry[];
}

export interface ComplianceDocumentQueuePage {
  items: AdminComplianceDocument[];
  nextCursor: string | null;
  counts: Record<ComplianceDocumentSubmission["status"], number>;
}

export interface ComplianceFileLink {
  url: string;
  expiresAt: string;
  contentType: string;
}

export interface IdentityVerification {
  id: string;
  personId: string;
  governingBodyId: string;
  externalId: string;
  /** pending | verified | mismatch | expired */
  status: string;
  /** api | document_upload | self_attest */
  source: string;
  createdAt: string;
  updatedAt: string;
}

// ----- Finance extensions (Payment & Invoicing tabs) -----

export interface TeamInvoiceSplit {
  id: string;
  invoiceId: string;
  teamId: string;
  playerPersonId: string;
  allocatedCents: number;
  collectedCents: number;
  /** pending | partial | paid | overdue */
  status: string;
  lastReminderAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TeamInvoiceSplitWithPerson extends TeamInvoiceSplit {
  player: {
    id: string;
    legalFirstName: string;
    legalLastName: string;
    preferredName: string | null;
  };
  isCaptain: boolean;
}

export type RefundType =
  | "full_original"
  | "partial_original"
  | "wallet_credit"
  | "adjustment";

export interface Refund {
  id: string;
  orgId: string;
  invoiceId: string;
  paymentId: string | null;
  refundType: RefundType;
  amountCents: number;
  currency: string;
  reason: string;
  issuedByUserId: string | null;
  processorRefundId: string | null;
  /** pending | succeeded | failed | cancelled */
  status: string;
  processedAt: string | null;
  lastErrorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WalletAccount {
  id: string;
  personId: string;
  orgId: string;
  currency: string;
  balanceCents: number;
  expiresAt: string | null;
  frozen: boolean;
  createdAt: string;
  updatedAt: string;
}

export type WalletLedgerEntryType =
  | "credit_issued"
  | "credit_applied"
  | "credit_expired"
  | "adjustment";

/** Refund limits for one invoice, computed by the API (MON-9). */
export interface InvoiceRefundable {
  /** Most that can be refunded now, card and wallet together. */
  totalCents: number;
  /** Most that can go back to a card (card payments minus card refunds). */
  cardCents: number;
  /** Every refund already recorded on the invoice. */
  refundedCents: number;
}

export interface WalletLedgerEntry {
  id: string;
  walletId: string;
  entryType: WalletLedgerEntryType;
  amountCents: number;
  relatedInvoiceId: string | null;
  /** Invoice number of relatedInvoiceId, for display. */
  relatedInvoiceNumber: string | null;
  relatedRefundId: string | null;
  reason: string;
  issuedByUserId: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface InvoiceEscalation {
  id: string;
  invoiceId: string;
  level: 1 | 2 | 3;
  remindersSent: number;
  lastReminderAt: string | null;
  nextReminderAt: string | null;
  lockSuspended: boolean;
  flagWaivedAt: string | null;
  flagWaivedByUserId: string | null;
  extendedDueAt: string | null;
  lastActionAt: string | null;
  lastActionByUserId: string | null;
  /** mark_paid | message | extend | suppress | waive_flag */
  lastActionKind: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceEscalationWithInvoice extends InvoiceEscalation {
  invoice: {
    id: string;
    invoiceNumber: string;
    totalCents: number;
    paidCents: number;
    currency: string;
    dueAt: string | null;
    recipientPersonId: string | null;
  };
}

export interface QuickbooksSyncLog {
  id: string;
  orgId: string;
  /** invoice | payment | refund | credit_memo */
  entityType: string;
  entityId: string;
  qbId: string | null;
  /** create | update | delete */
  action: string;
  /** queued | syncing | succeeded | failed */
  status: string;
  summary: string | null;
  errorMessage: string | null;
  attemptedAt: string;
  createdAt: string;
}

export interface QuickbooksSyncStatus {
  connected: boolean;
  lastSyncAt: string | null;
  errorCount24h: number;
  recentEvents: QuickbooksSyncLog[];
}

export interface RosterMove {
  id: string;
  teamId: string;
  personId: string;
  seasonId: string;
  moveType:
    | "add"
    | "drop"
    | "trade_in"
    | "trade_out"
    | "call_up"
    | "send_down"
    | "release"
    | "reinstate";
  membershipType: "primary" | "play_up" | "affiliate" | "call_up";
  effectiveAt: string;
  jerseyNumber: number | null;
  positionCode: string | null;
  reason: string | null;
  createdAt: string;
}

export interface TeamMembership {
  id: string;
  teamId: string;
  personId: string;
  seasonId: string;
  membershipType: "primary" | "play_up" | "affiliate" | "call_up";
  effectiveFrom: string;
  effectiveTo: string | null;
  jerseyNumber: number | null;
  positionCode: string | null;
  currentStatus: "active" | "released" | "suspended" | "ineligible";
}

// ----- Game Operations -----

export type GameStatus =
  | "scheduled"
  | "in_play"
  | "completed"
  | "postponed"
  | "cancelled"
  | "forfeited";

export interface Game {
  id: string;
  leagueId: string;
  /**
   * Season the game belongs to: games.season_id, or the division's
   * season when the row has none. Null only for ad-hoc games with
   * neither (the lineup editor then resolves the roster by game date).
   */
  seasonId: string | null;
  divisionId: string | null;
  homeTeamId: string;
  awayTeamId: string;
  sportCode: string;
  scheduledStartTsUtc: string;
  tz: string;
  durationMin: number;
  venueName: string | null;
  surfaceLabel: string | null;
  status: GameStatus;
  homeScore: number;
  awayScore: number;
  period: number;
  finalizedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Team names (null when unknown). */
  homeTeamName?: string | null;
  awayTeamName?: string | null;
  /** Set = shown on team schedules. Null = draft only admins and officials see (SCH-7). */
  publishedAt: string | null;
  /** Null = hand-made game; set = placed by a schedule run (published with the run). */
  scheduleRunId: string | null;
  surfaceId: string | null;
  /** How the game ended, recorded at finalize. Null before, or for a tie left blank. */
  endedIn: GameEnding | null;
  /** Manual moves, oldest first (SCH-6). */
  reschedules: GameRescheduleRecord[];
  /**
   * GET /games/:id only: the game actions this viewer may take
   * ("game.start", "score.write", "game_event.write", "game.finalize",
   * "game.postpone", "game.cancel", "game.forfeit", "game.reschedule",
   * "game.publish", "game.assign_officials", "stats.recompute").
   */
  viewerPermissions?: string[];
}

export type GameEnding = "regulation" | "overtime" | "shootout";

export interface GameRescheduleRecord {
  at: string;
  byUserId: string;
  from: { startTsUtc: string; venueName: string | null; surfaceLabel: string | null; surfaceId: string | null };
  to: { startTsUtc: string; venueName: string | null; surfaceLabel: string | null; surfaceId: string | null };
  reason: string | null;
  overriddenConflicts: string[];
}

/** Where a game would land after a move, and what it would clash with. */
export interface GameReschedulePlan {
  startTsUtc: string;
  startLocal: string;
  tz: string;
  venueName: string | null;
  surfaceLabel: string | null;
  surfaceId: string | null;
  durationMin: number;
  conflicts: Array<{ kind: "rink" | "team"; gameId: string; message: string }>;
}

/** What one finalize command did (SCH-17). */
export interface GameFinalizeSummary {
  endedIn: GameEnding | null;
  statLinesWritten: number;
  standingsTeamsRanked: number;
  standingsGamesCounted: number;
  pointsRuleSource: "default" | "request";
  notificationRecipients: number;
  notificationsQueued: number;
  /** Game-count suspensions that counted this game (COMP-10). */
  suspensionsServed?: number;
  /** Of those, how many are now fully served. */
  suspensionsCompleted?: number;
  /** Suspensions the league's discipline rules issued from this game (COMP-11). */
  suspensionsIssued?: number;
}

/** Postal address stored on a venue (all optional; blanks are dropped). */
export interface RinkAddress {
  line1?: string;
  line2?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  countryCode?: string;
}

/**
 * What still uses a venue or surface, and what removing it would do
 * (SCH-3): blocked while a game there is not finished; archived (hidden,
 * history kept) when it has played games, past slots or integrations;
 * deleted otherwise. Open slots from today on go only after confirmation.
 */
export interface RinkUsage {
  name: string;
  unfinishedGames: Array<{ id: string; label: string }>;
  unfinishedGamesCount: number;
  finishedGamesCount: number;
  openSlotsCount: number;
  pastSlotsCount: number;
  rinkIntegrationsCount: number;
  outcome: "blocked" | "archive" | "delete";
  message: string;
}

/** Result of removing a venue or surface. */
export interface RinkRemoval {
  outcome: "deleted" | "archived";
  removedSlots: number;
}

export interface GameEvent {
  id: string;
  gameId: string;
  sportCode: string;
  eventType: string;
  tsUtc: string;
  period: number | null;
  clockRemainingSec: number | null;
  teamId: string | null;
  primaryPersonId: string | null;
  secondaryPersonIds: string[];
  attributes: Record<string, unknown>;
  source: string;
  idempotencyKey: string | null;
  correctionOfEventId: string | null;
  createdAt: string;
}

export type GameOfficialRole =
  | "referee"
  | "linesman"
  | "scorekeeper"
  | "timekeeper"
  | "video_review"
  | "commissioner"
  | "other";

export type GameOfficialStatus = "confirmed" | "tentative" | "declined";

export interface GameOfficial {
  id: string;
  gameId: string;
  personId: string;
  role: GameOfficialRole;
  slot: string | null;
  status: GameOfficialStatus;
  assignedByUserId: string | null;
  notes: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Mirrors `suspensions.kind` (rules: @sportspulse/kernel suspensions.ts). */
export type SuspensionKind = "n_games" | "time_bounded" | "indefinite" | "n_days";

/** Mirrors `suspensions.status`. */
export type SuspensionStatus = "active" | "served" | "lifted" | "appealed";

export interface Suspension {
  id: string;
  personId: string;
  personName?: string | null;
  /** The penalty (game event) it came from, when it did. */
  sourceEventId: string | null;
  sourceGameId?: string | null;
  kind: SuspensionKind;
  nGames: number | null;
  nDays: number | null;
  /** Finalized games counted so far (automatic at finalize). */
  servedCount: number;
  status: SuspensionStatus;
  /** Issue reason; a lift appends "| Lifted: <reason>". */
  reason: string | null;
  startAt: string;
  endAt: string | null;
  /** Server-computed: stands right now. */
  inForce: boolean;
  /** Game-count suspensions: games still to sit out. */
  gamesRemaining: number | null;
  /** Time-based suspensions: when the player may play again. */
  endsAt: string | null;
  /** "2 of 3 games left", "Until Nov 3, 2026", "Lifted". */
  label: string;
}

/** GET /suspensions page; viewerPermissions only with personId or gameId. */
export interface SuspensionPage {
  items: Suspension[];
  nextCursor: string | null;
  viewerPermissions?: string[];
}

/** A player barred from a game, or suspended now (captain views, COMP-12 / COMP-13). */
export interface SuspendedPlayer {
  suspensionId: string;
  personId: string;
  displayName: string;
  kind: SuspensionKind | string;
  gamesRemaining: number | null;
  endsAt: string | null;
  reason: string | null;
  label: string;
}

// ----- Stats -----

export interface StatLine {
  id: string;
  gameId: string;
  personId: string;
  teamId: string;
  sportCode: string;
  seasonId: string | null;
  leagueId: string | null;
  divisionId: string | null;
  gpIncrement: number;
  minutesPlayed: number | null;
  core: Record<string, number>;
  extended: Record<string, unknown>;
  derivedAt: string;
  /** Player's name (null when unknown). */
  personName?: string | null;
  teamName?: string | null;
  seasonName?: string | null;
}

export interface Standing {
  id: string;
  leagueId: string;
  divisionId: string | null;
  teamId: string;
  gp: number;
  w: number;
  l: number;
  t: number;
  otl: number;
  points: number;
  gf: number;
  ga: number;
  gd: number;
  rank: number | null;
  derivedAt: string;
  /** Team name (null when unknown). */
  teamName?: string | null;
}

export interface LeaderboardEntry {
  personId: string;
  teamId: string;
  value: number;
  rank: number;
  /** Player's name (null when unknown). */
  personName?: string | null;
  teamName?: string | null;
}

export interface Leaderboard {
  id: string;
  scopeType: string;
  scopeId: string | null;
  metric: string;
  windowKind: string;
  sportCode: string;
  entries: LeaderboardEntry[];
  rankedAt: string;
}

// ----- Org relations + cross-org grants -----

export interface OrgRelation {
  id: string;
  parentOrgId: string;
  childOrgId: string;
  relation: "sanctions" | "member_of" | "owns";
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface CrossOrgGrant {
  id: string;
  userId: string;
  fromOrgId: string;
  toOrgId: string;
  permissions: string[];
  effectiveFrom: string;
  effectiveTo: string | null;
  /** Grantee's display name or email (null when unknown). */
  userDisplayName?: string | null;
}

// ----- Roles + assignments -----

export type RoleScopeType =
  | "platform"
  | "org"
  | "league"
  | "season"
  | "division"
  | "team"
  | "game";

export interface Role {
  id: string;
  orgId: string | null;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  createdAt: string;
  updatedAt: string;
}

export interface RoleAssignment {
  id: string;
  userId: string;
  roleId: string;
  scopeType: RoleScopeType;
  scopeId: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  grantedByUserId: string | null;
  revokedAt: string | null;
  revokedByUserId: string | null;
  createdAt: string;
  role: Role | null;
  /** Resolved name of the scoped entity (null when unknown). */
  scopeName?: string | null;
  /** Holder's display name or email. */
  userDisplayName?: string | null;
}

// ----- Imports / Data Migration -----

export type ImportEntityKind =
  | "persons"
  | "teams"
  | "registrations"
  | "rosters"
  | "games";

export type ImportStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "partial"
  | "cancelled";

export interface ImportJob {
  id: string;
  orgId: string | null;
  entityKind: ImportEntityKind;
  sourceFilename: string | null;
  status: ImportStatus;
  totalRows: number;
  processedRows: number;
  successRows: number;
  failedRows: number;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ImportJobRowEntry {
  id: string;
  rowNumber: number;
  raw: Record<string, unknown>;
  status: "ok" | "failed" | "skipped";
  error: string | null;
  createdEntityId: string | null;
}

// ----- Audit -----

export interface AuditEvent {
  id: string;
  tsUtc: string;
  orgId: string | null;
  actorUserId: string | null;
  onBehalfOfUserId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ipAddr: string | null;
  userAgent: string | null;
  requestId: string | null;
  retentionClass: string;
  createdAt: string;
  /** Actor's display name or email (null when unknown). */
  actorName?: string | null;
  /** Name of the changed resource when it is a named entity. */
  resourceName?: string | null;
}

export interface AuditFacets {
  actions: string[];
  resourceTypes: string[];
}

// ----- Documents -----

export type DocumentKind =
  | "waiver"
  | "code_of_conduct"
  | "media_release"
  | "concussion_protocol"
  | "transfer_form"
  | "policy"
  | "other";

export interface Document {
  id: string;
  orgId: string | null;
  kind: DocumentKind;
  name: string;
  description: string | null;
  activeVersionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentVersion {
  id: string;
  documentId: string;
  versionNumber: number;
  contentHtml: string;
  contentHash: string;
  languageCode: string;
  jurisdictionCountryCode: string | null;
  effectiveFrom: string;
  supersededAt: string | null;
  createdAt: string;
}

// ----- Form versions -----

export interface FormVersion {
  id: string;
  formId: string;
  versionNumber: number;
  schema: Record<string, unknown>;
  publishedAt: string | null;
  locked: boolean;
  createdAt: string;
}

// ----- Admin -----

export interface SystemSetting {
  id: string;
  key: string;
  category: string;
  value: unknown;
  description: string | null;
  isEditable: boolean;
  updatedByUserId: string | null;
  updatedAt: string;
}

export interface FeatureFlag {
  id: string;
  key: string;
  description: string | null;
  isEnabled: boolean;
  rolloutPct: number;
  orgAllowlist: string[];
  variants: Array<{ name: string; weight?: number; payload?: unknown }>;
  updatedAt: string;
}

export interface Sport {
  code: string;
  name: string;
  teamSizeDefault: number | null;
  periodModel: string;
  scoringModel: Record<string, unknown>;
  active: boolean;
}

export interface PlatformHealth {
  status: "ok" | "degraded";
  dbOk: boolean;
  dbLatencyMs: number;
  modules: string[];
  timestamp: string;
}

// ----- Finance -----

export type InvoiceStatus =
  | "draft"
  | "sent"
  | "paid"
  | "partial"
  | "overdue"
  | "void";

export type PaymentMethod =
  | "cash"
  | "check"
  | "credit_card"
  | "etransfer"
  | "bank_transfer"
  | "manual"
  | "refund";

export type PaymentStatus = "pending" | "succeeded" | "failed" | "refunded";

export interface FeeSchedule {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  kind: string;
  code: string | null;
  currency: string;
  baseAmountCents: number;
  dueOffsetDays: number;
  lateFeeCents: number;
  seasonId: string | null;
  leagueId: string | null;
  divisionId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceItem {
  id: string;
  invoiceId: string;
  kind: string;
  description: string;
  quantity: number;
  unitAmountCents: number;
  amountCents: number;
  feeScheduleId: string | null;
}

/**
 * Captain dues tracker read model (GET /captain/dues/:teamId). One
 * sub-invoice per player; `splitMethod` is the persisted split mode
 * on the master invoice (null until the captain saves one).
 */
export interface CaptainDuesBreakdown {
  teamId: string;
  teamName: string;
  masterInvoiceId: string | null;
  masterInvoiceNumber: string | null;
  /** Master invoice total: the amount the sub-invoices must sum to. */
  masterTotalCents: number;
  /** Sum of the sub-invoice totals. */
  totalCents: number;
  collectedCents: number;
  thresholdCents: number;
  seasonName: string | null;
  divisionName: string | null;
  entryStatus: string | null;
  splitMethod: "even" | "custom" | null;
  /** Which team invoice this is (MON-23): from the division entry, or sent by an admin. */
  masterKind: "division_entry" | "team_invoice" | null;
  masterLabel: string | null;
  /** Every team invoice the captain can open; pass one's id to work on it. */
  masters: Array<{
    id: string;
    invoiceNumber: string;
    totalCents: number;
    kind: "division_entry" | "team_invoice";
    label: string;
    status: string;
  }>;
  /** When the open invoice has no shares yet: who a first split covers. */
  candidates: Array<{ personId: string; email: string | null; name: string; isCaptain: boolean }>;
  subInvoices: Array<{
    id: string;
    invoiceNumber: string;
    recipientPersonId: string | null;
    recipientEmail: string | null;
    totalCents: number;
    paidCents: number;
    status: string;
    currency: string;
    dueAt: string | null;
    isOverdue: boolean;
    isCaptain: boolean;
    playerName: string | null;
  }>;
}

export interface Invoice {
  id: string;
  orgId: string;
  invoiceNumber: string;
  registrationId: string | null;
  recipientPersonId: string | null;
  recipientEmail: string | null;
  currency: string;
  subtotalCents: number;
  taxCents: number;
  discountCents: number;
  totalCents: number;
  paidCents: number;
  status: InvoiceStatus;
  issuedAt: string | null;
  dueAt: string | null;
  paidAt: string | null;
  notes: string | null;
  items: InvoiceItem[];
  /**
   * Free-form JSONB. Conventional keys:
   *   - cardOnFile: { brand, last4, expMonth, expYear } (Stripe webhook)
   *   - upcoming: Array<{ label, dueAt, amountCents, status }>
   *     (materialised from installment_schedules by the worker)
   */
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: string;
  orgId: string;
  invoiceId: string;
  amountCents: number;
  currency: string;
  method: PaymentMethod;
  status: PaymentStatus;
  receivedAt: string;
  externalProviderId: string | null;
  recordedByUserId: string | null;
  notes: string | null;
  /** Stripe payment-intent payload, card details, etc. */
  metadata?: Record<string, unknown>;
  createdAt: string;
}

// ----- Notification templates -----

export interface NotificationTemplate {
  id: string;
  orgId: string | null;
  code: string;
  channel: string;
  locale: string;
  subject: string | null;
  bodyTemplate: string;
  variables: string[];
  isActive: boolean;
  updatedAt: string;
}

// ----- Communications -----

export type NotificationStatus =
  | "queued"
  | "sending"
  | "sent"
  | "failed"
  | "suppressed";

export type NotificationChannel = "email" | "sms" | "in_app";

export interface Notification {
  id: string;
  orgId: string | null;
  idempotencyKey: string;
  templateCode: string;
  channel: NotificationChannel;
  subject: string | null;
  body: string;
  recipientPersonId: string | null;
  recipientEmail: string | null;
  payload: Record<string, unknown>;
  status: NotificationStatus;
  attemptCount: number;
  lastError: string | null;
  sentAt: string | null;
  /** When the recipient marked it read in their app. NULL = unread. */
  readAt: string | null;
  sourceEvent: string | null;
  createdAt: string;
  updatedAt: string;
}

// ----- Free Agent Pool -----

export interface FreeAgentPoolEntry {
  /** Name of the entry's season (captain pool spans every live season). */
  seasonName?: string | null;
  id: string;
  playerPersonId: string;
  seasonId: string;
  positions: string[];
  availability: Record<string, unknown>;
  levelPrimary: string;
  levelFlexibility: string[] | null;
  note: string | null;
  noShowRate: string | null;
  status: "active" | "placed" | "withdrawn";
  placedTeamId: string | null;
  placedAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  /** Player's display / legal name, joined from persons. Nullable when
   *  the persons row is missing for any reason. */
  playerName: string | null;
  playerEmail: string | null;
  /** ISO date YYYY-MM-DD if present on the persons row. */
  playerDob: string | null;
  /** Captain pool (forTeamId): this team's latest offer to the player, any state. */
  teamOffer?: FreeAgentOffer | null;
  /** Admin pool: open offers from any team. */
  openOffers?: FreeAgentOffer[];
}

/**
 * A team's offer of a roster spot to a free agent (UC-03, CAP-9). Stored
 * as a personal team invite; the player accepts or declines on player-web.
 */
export interface FreeAgentOffer {
  /** team_invites id */
  id: string;
  entryId: string;
  teamId: string;
  teamName: string;
  seasonId: string;
  seasonName: string | null;
  playerPersonId: string | null;
  playerName: string | null;
  status: "pending" | "accepted" | "declined" | "expired" | "revoked";
  offeredBy: "captain" | "admin";
  createdAt: string;
  expiresAt: string | null;
  decidedAt: string | null;
}

/** A team that plays the free agent's season (admin "Assign to team" picker). */
export interface FreeAgentOfferTeam {
  teamId: string;
  teamName: string;
  orgId: string;
  divisionId: string;
  divisionName: string;
  entryStatus: string;
}

/** An open team invite or free-agent offer addressed to the signed-in player. */
export interface MyTeamInvite {
  id: string;
  token: string;
  kind: "free_agent_offer" | "team_invite";
  teamId: string;
  teamName: string;
  seasonId: string;
  seasonName: string | null;
  expiresAt: string | null;
  createdAt: string;
}

// ----- Team Store (Backlog #11) -----

/** A team store order (UC-26); payment state comes from its invoice. */
export interface StoreOrder {
  id: string;
  orgId: string;
  teamId: string;
  teamName: string;
  status: "placed" | "processing" | "shipped" | "cancelled";
  statusLabel: string;
  totalCents: number;
  currency: string;
  note: string | null;
  createdAt: string;
  statusChangedAt: string | null;
  buyer: { personId: string; name: string };
  invoice: { id: string; number: string; status: string; paidCents: number; totalCents: number } | null;
  paid: boolean;
  items: Array<{
    id: string;
    productId: string | null;
    productName: string;
    unitPriceCents: number;
    quantity: number;
    size: string | null;
    personalName: string | null;
    personalNumber: number | null;
    backorder: boolean;
    /** "Home jersey · L · #12 SMITH" */
    label: string;
  }>;
}

export interface StoreOrderLineInput {
  productId: string;
  quantity: number;
  size?: string | null;
  personalName?: string | null;
  personalNumber?: number | null;
}

export interface TeamStoreProduct {
  id: string;
  teamId: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  priceCents: number;
  currency: string;
  variantLabel: string | null;
  stockQty: number | null;
  isActive: boolean;
  metadata: Record<string, unknown>;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}
