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
  name: string;
  sportCode: string;
  startDate: string;
  endDate: string;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
  rosterLockAt: string | null;
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
  createdAt: string;
  updatedAt: string;
}

export interface Division {
  id: string;
  /** Post-flip — divisions live under a season. */
  seasonId: string;
  ageGroupId: string | null;
  name: string;
  tier: string | null;
  genderEligibility: "male" | "female" | "mixed" | "open";
  maxTeams: number | null;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
}

export interface Team {
  id: string;
  orgId: string;
  name: string;
  shortName: string | null;
  sportCode: string;
  logoUrl: string | null;
  status: "active" | "dissolved";
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
    | "withdrawn";
  leagueId: string | null;
  divisionId: string | null;
  teamId: string | null;
  submittedAt: string | null;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  decisionReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RegistrationForm {
  id: string;
  orgId: string;
  scope: "org" | "league" | "division";
  scopeId: string | null;
  name: string;
  description: string | null;
  activeVersionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type EligibilityStatus =
  | "pending"
  | "eligible"
  | "ineligible"
  | "expired"
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

export type SuspensionKind =
  | "match_misconduct"
  | "game_misconduct"
  | "discipline"
  | "automatic"
  | "manual";

export type SuspensionStatus =
  | "active"
  | "served"
  | "lifted"
  | "expired"
  | "completed";

export interface Suspension {
  id: string;
  personId: string;
  sourceEventId: string | null;
  kind: SuspensionKind;
  nGames: number | null;
  nDays: number | null;
  servedCount: number;
  status: SuspensionStatus;
  reason: string | null;
  startAt: string;
  endAt: string | null;
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
}

export interface LeaderboardEntry {
  personId: string;
  teamId: string;
  value: number;
  rank: number;
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
  sourceEvent: string | null;
  createdAt: string;
  updatedAt: string;
}
