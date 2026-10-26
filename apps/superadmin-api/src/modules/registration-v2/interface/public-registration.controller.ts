import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpException,
  Inject,
  Logger,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
  UnprocessableEntityException,
  UseGuards
} from "@nestjs/common";
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength
} from "class-validator";
import { and, desc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import { loadUserScope } from "../../../shared/auth/scope";
import type { AuthPrincipal } from "@sportspulse/auth";
import {
  assertValidTransition,
  canTransition,
  checkComplianceUpload,
  complianceFileExtension,
  guardianNameAcceptable,
  initialFunnelRegistrationState,
  isMinorOn,
  isRegistrationDocumentKey,
  isRegistrationState,
  isRegistrationSubmissionType,
  parentalConsentText,
  planInstallments,
  registrationInvoiceDueAt,
  PARENTAL_CONSENT_TITLE,
  REGISTRATION_ACCEPTING_SEASON_STATUSES,
  REGISTRATION_STATE_LABELS,
  submissionTypeCarriesTeam,
  submissionTypeRefusal,
  tierOffersDivision,
  tierIsFull,
  tierOffersPlan,
  tiersForDivision,
  type RegistrationDocumentKey,
  type RegistrationState,
  type RegistrationSubmissionType
} from "@sportspulse/kernel";
import { playerWebUrl } from "../../../shared/app-urls";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { SupabaseAdminService } from "../../../shared/auth/supabase-admin.service";
import { EmailDispatcherService } from "../../../shared/notifications/email-dispatcher.service";
import { RegistrationV2Service } from "../application/registration-v2.service";
import { RosterEntryService } from "../application/roster-entry.service";
import { loadSeasonTiers, type SeasonTier } from "../application/season-tiers";
import { reserveInvoiceNumbers } from "../../finance/application/services/invoice-number";
import { closeRegistrationMoney, takeSeat } from "../application/seats";
import { PAYMENT_PROCESSOR, PaymentProcessor } from "../../../shared/payments/payment-processor";
import {
  RegistrationRequirementsService,
  requestClientIp,
  requestUserAgent,
  seasonRegistrationFormMatch
} from "../application/registration-requirements.service";
import { teamNameVerdict } from "../application/team-names";

/** Statuses in which a funnel registration has not been submitted yet. */
const PRE_SUBMISSION_STATES = new Set<string>([
  "draft",
  "pending_verification",
  "pending_consent",
  "pending_payment"
]);
/**
 * Statuses in which the registrant may still change what they entered:
 * before submission, and `incomplete` (the admin sent it back for fixes,
 * kernel `incomplete → pending_review`). Anything else was submitted and
 * is the record the league reviews; the funnel must not rewrite it.
 */
const EDITABLE_STATES = new Set<string>([...PRE_SUBMISSION_STATES, "incomplete"]);
/**
 * Final states that end a registration without a place: the kernel has no
 * way back from them, and `registrations_active_uniq` ignores them, so the
 * same person may start a new registration for the season.
 */
const RESTARTABLE_STATES = new Set<string>(["rejected", "cancelled", "withdrawn"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Kernel transition guard as a 409 with a readable sentence (the kernel throws a plain Error, which Nest turns into a 500). */
function assertTransitionOr409(from: string, to: RegistrationState, message: string): void {
  if (!isRegistrationState(from) || !canTransition(from, to)) {
    throw new ConflictException({ error: "invalid_transition", message, currentStatus: from });
  }
  assertValidTransition(from, to);
}

function stateLabel(status: string): string {
  return isRegistrationState(status) ? REGISTRATION_STATE_LABELS[status] : status.replace(/_/g, " ");
}

/** 409 for a registration the league already has: points the player to My registrations. */
function alreadySubmitted(row: { id: string; status: string }): ConflictException {
  return new ConflictException({
    error: "registration_already_submitted",
    message: `You already submitted this registration (${stateLabel(row.status)}). Open My registrations at /registrations to see it; changes now go through the league.`,
    registrationId: row.id,
    status: row.status
  });
}

class RedeemParentalConsentBodyDto {
  @ApiProperty({ enum: ["confirm", "decline"] })
  @IsIn(["confirm", "decline"])
  action!: "confirm" | "decline";

  /** Confirm only: the guardian's full legal name, typed as their signature. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  guardianName?: string;

  /** Confirm only: the guardian ticked "I have read and agree". */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  acknowledged?: boolean;
}

/** Funnel signing handle → requirement key. Accepts the key itself or the legacy `form:<kind>[:vN]` ids. */
function documentKeyFrom(raw: string | undefined | null): RegistrationDocumentKey | null {
  if (!raw) return null;
  if (isRegistrationDocumentKey(raw)) return raw;
  const kind = raw.startsWith("form:") ? raw.split(":")[1] : null;
  if (kind === "liability") return "liability_waiver";
  if (kind === "code_of_conduct") return "code_of_conduct";
  return null;
}

class StartSubmissionBodyDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  /**
   * Password chosen at the Account step. Min 8 chars per spec §4.1.
   * Backend creates the Supabase auth user; mock-flow skips the
   * verification email roundtrip and marks email_confirm=true.
   */
  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  fullName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  /** ISO YYYY-MM-DD. Used for the minor-flag computation. */
  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dobDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  pricingTierId?: string;

  @ApiPropertyOptional({ enum: ["team", "individual", "free_agent", "captain_invite"] })
  @IsOptional()
  @IsString()
  submissionType?: "team" | "individual" | "free_agent" | "captain_invite";

  /**
   * Division the player is registering into. The funnel collects
   * this in its "Pick a division" step (P2-2). Optional — funnels
   * for seasons with zero divisions skip the step entirely; the
   * field stays NULL and downstream surfaces fall back to org-wide.
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  divisionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  answers?: Record<string, unknown>;

  /**
   * Team registration only — name + primary colour collected on the
   * Team information card of the Details step. Persisted into
   * metadata.team so the approve handler can create the teams row.
   * The captain still uses divisionId (above) to bind the team to a
   * division on approval.
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  teamName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  teamColor?: string;

  /**
   * The form version the funnel rendered (season context formVersionId).
   * The server binds the registration to the season's active version and
   * refuses a stale or foreign one (REG-8).
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  formVersionId?: string;

  /**
   * Register directly onto a team (FR-3.4.1): the funnel's
   * /register/<season>?team=<team> link. Stored on registrations.team_id;
   * the player joins that roster when the registration is approved.
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  teamId?: string;

  /** The captain invite the player followed (settled on approval). */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  inviteToken?: string;
}

/**
 * Public, anonymous endpoints for the player registration funnel.
 *
 * Spec: Workflow 1 v2.0. NO auth — the funnel runs before any user
 * account exists. The start endpoint creates a Supabase auth user
 * (email auto-confirmed for the mock flow) and binds the registration
 * to it. State transitions are guarded by the kernel state machine.
 *
 * Resource bound is the season — by ID for now; slug support comes when
 * we add `seasons.slug`.
 */
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** A declined card inside the pay transaction; rolls it back. */
class CardDeclined extends Error {}

@ApiTags("public/registration")
@Controller("public/registration")
export class PublicRegistrationController {
  private readonly log = new Logger(PublicRegistrationController.name);

  constructor(
    private readonly v2: RegistrationV2Service,
    private readonly requirements: RegistrationRequirementsService,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly supabase: SupabaseAdminService,
    private readonly email: EmailDispatcherService,
    private readonly config: ConfigService,
    @Inject(PAYMENT_PROCESSOR) private readonly processor: PaymentProcessor,
    private readonly rosterEntry: RosterEntryService
  ) {}

  @Get("open")
  @ApiOperation({
    summary:
      "One league's public registration page: the seasons of that organisation whose registration window is open and that have a published season_registration form. Anonymous. `org` (the organisation's slug or id, from the league's registration link) is required: there is no list across organisations, so no visitor can enumerate other leagues."
  })
  async listOpenRegistrations(@Query("org") orgKey?: string): Promise<{
    org: { id: string; slug: string; name: string };
    items: Array<{
      seasonId: string;
      seasonName: string;
      sportCode: string;
      leagueId: string;
      leagueName: string;
      orgId: string;
      orgName: string;
      formId: string;
      formName: string;
      registrationOpensAt: string | null;
      registrationClosesAt: string | null;
    }>;
  }> {
    const key = orgKey?.trim().toLowerCase() ?? "";
    if (!key) {
      throw new BadRequestException({
        error: "org_required",
        message: "Open your league's registration link; it names the league."
      });
    }
    const [org] = await this.db
      .select({ id: schema.orgs.id, slug: schema.orgs.slug, name: schema.orgs.displayName })
      .from(schema.orgs)
      .where(
        and(
          UUID_RE.test(key) ? eq(schema.orgs.id, key) : eq(schema.orgs.slug, key),
          eq(schema.orgs.status, "active")
        )
      )
      .limit(1);
    if (!org) throw new NotFoundException("No league found for that registration link.");

    const now = new Date();
    const rows = await this.db
      .select({
        seasonId: schema.seasons.id,
        seasonName: schema.seasons.name,
        sportCode: schema.seasons.sportCode,
        registrationOpensAt: schema.seasons.registrationOpensAt,
        registrationClosesAt: schema.seasons.registrationClosesAt,
        leagueId: schema.leagues.id,
        leagueName: schema.leagues.name,
        orgId: schema.orgs.id,
        orgName: schema.orgs.displayName,
        formId: schema.registrationForms.id,
        formName: schema.registrationForms.name
      })
      .from(schema.seasons)
      .innerJoin(
        schema.leagues,
        eq(schema.leagues.id, schema.seasons.leagueId)
      )
      .innerJoin(schema.orgs, eq(schema.orgs.id, schema.leagues.orgId))
      .innerJoin(
        schema.registrationForms,
        // Season-bound form, or a league-wide form of THIS league, same
        // org, published. One rule with the funnel (REG-25).
        seasonRegistrationFormMatch({
          id: schema.seasons.id,
          leagueId: schema.leagues.id,
          orgId: schema.seasons.orgId
        })
      )
      .where(
        and(
          eq(schema.leagues.orgId, org.id),
          lte(schema.seasons.registrationOpensAt, now),
          gte(schema.seasons.registrationClosesAt, now),
          // The registration window governs; an admin moving the season to
          // in_progress must not hide late registration (PPHL change #2).
          inArray(schema.seasons.status, [...REGISTRATION_ACCEPTING_SEASON_STATUSES])
        )
      )
      .orderBy(schema.seasons.registrationClosesAt);

    // Deduplicate by seasonId — if both a season-bound form and a
    // league-scope form match, the season-bound one wins (it appears
    // first in the join).
    const seen = new Set<string>();
    const items: Array<{
      seasonId: string;
      seasonName: string;
      sportCode: string;
      leagueId: string;
      leagueName: string;
      orgId: string;
      orgName: string;
      formId: string;
      formName: string;
      registrationOpensAt: string | null;
      registrationClosesAt: string | null;
    }> = [];
    for (const r of rows) {
      if (seen.has(r.seasonId)) continue;
      seen.add(r.seasonId);
      items.push({
        seasonId: r.seasonId,
        seasonName: r.seasonName,
        sportCode: r.sportCode,
        leagueId: r.leagueId,
        leagueName: r.leagueName,
        orgId: r.orgId,
        orgName: r.orgName,
        formId: r.formId,
        formName: r.formName,
        registrationOpensAt: r.registrationOpensAt?.toISOString() ?? null,
        registrationClosesAt: r.registrationClosesAt?.toISOString() ?? null
      });
    }
    this.log.log(`public registration page org=${org.slug} open=${items.length}`);
    return { org, items };
  }

  @Get("open-for-me")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      "Authenticated variant of /open — returns ONLY open registrations whose owning org appears in the caller's scope.orgIds. Super-admin / platform-scoped users (scope.orgIds === null) get the unrestricted view. A signed-in player with zero org reach gets an empty list — this is the canonical 'Find a team' surface for player-web and prevents the cross-tenant leak the public endpoint exposed when used by an authenticated client."
  })
  async listOpenForCurrentUser(@CurrentUser() user: AuthPrincipal): Promise<{
    items: Array<{
      seasonId: string;
      seasonName: string;
      sportCode: string;
      leagueId: string;
      leagueName: string;
      orgId: string;
      orgName: string;
      formId: string;
      formName: string;
      registrationOpensAt: string | null;
      registrationClosesAt: string | null;
    }>;
  }> {
    // Load scope inline rather than via @UserScope — that decorator
    // requires AuthorizedAccessGuard, which 403s a fresh player with
    // zero league/org/team reach. This endpoint must return an empty
    // list (not 403) for that persona.
    const scope = await loadUserScope(this.db, user.userId);
    if (scope.orgIds !== null && scope.orgIds.length === 0) {
      return { items: [] };
    }
    const now = new Date();
    const baseFilters = and(
      lte(schema.seasons.registrationOpensAt, now),
      gte(schema.seasons.registrationClosesAt, now),
      // The registration window governs; an admin moving the season to
      // in_progress must not hide late registration (PPHL change #2).
      inArray(schema.seasons.status, [...REGISTRATION_ACCEPTING_SEASON_STATUSES])
    );
    const whereClause =
      scope.orgIds === null
        ? baseFilters
        : and(baseFilters, inArray(schema.orgs.id, scope.orgIds));
    const rows = await this.db
      .select({
        seasonId: schema.seasons.id,
        seasonName: schema.seasons.name,
        sportCode: schema.seasons.sportCode,
        registrationOpensAt: schema.seasons.registrationOpensAt,
        registrationClosesAt: schema.seasons.registrationClosesAt,
        leagueId: schema.leagues.id,
        leagueName: schema.leagues.name,
        orgId: schema.orgs.id,
        orgName: schema.orgs.displayName,
        formId: schema.registrationForms.id,
        formName: schema.registrationForms.name
      })
      .from(schema.seasons)
      .innerJoin(
        schema.leagues,
        eq(schema.leagues.id, schema.seasons.leagueId)
      )
      .innerJoin(schema.orgs, eq(schema.orgs.id, schema.leagues.orgId))
      .innerJoin(
        schema.registrationForms,
        seasonRegistrationFormMatch({
          id: schema.seasons.id,
          leagueId: schema.leagues.id,
          orgId: schema.seasons.orgId
        })
      )
      .where(whereClause)
      .orderBy(schema.seasons.registrationClosesAt);

    const seen = new Set<string>();
    const items: Array<{
      seasonId: string;
      seasonName: string;
      sportCode: string;
      leagueId: string;
      leagueName: string;
      orgId: string;
      orgName: string;
      formId: string;
      formName: string;
      registrationOpensAt: string | null;
      registrationClosesAt: string | null;
    }> = [];
    for (const r of rows) {
      if (seen.has(r.seasonId)) continue;
      seen.add(r.seasonId);
      items.push({
        seasonId: r.seasonId,
        seasonName: r.seasonName,
        sportCode: r.sportCode,
        leagueId: r.leagueId,
        leagueName: r.leagueName,
        orgId: r.orgId,
        orgName: r.orgName,
        formId: r.formId,
        formName: r.formName,
        registrationOpensAt: r.registrationOpensAt?.toISOString() ?? null,
        registrationClosesAt: r.registrationClosesAt?.toISOString() ?? null
      });
    }
    return { items };
  }

  @Get("app-links")
  @ApiOperation({
    summary:
      "This environment's player app origin, from the API's PLAYER_WEB_URL (the same value the invite and consent emails use). Admin consoles build registration links from it, so a staging console never links to the production player app (REG-12, REG-13). `configured` is false when the API falls back to the production default."
  })
  appLinks(): { playerWebUrl: string; configured: boolean } {
    const raw = this.config.get<string>("PLAYER_WEB_URL");
    return { playerWebUrl: playerWebUrl(this.config), configured: !!raw && !!raw.trim() };
  }

  @Get("seasons/:id")
  @ApiOperation({
    summary:
      "Fetch a season's public registration context: season meta, active pricing tiers, active form definition."
  })
  async getSeasonContext(@Param("id") id: string, @Query("team") teamId?: string) {
    const [season] = await this.db
      .select()
      .from(schema.seasons)
      .where(eq(schema.seasons.id, id))
      .limit(1);
    if (!season) throw new NotFoundException("Season not found");
    // FR-3.4.1: /register/<season>?team=<team>. The funnel shows the team
    // and, before payment, whether it can take the player (full, locked).
    const joinTeam = teamId && UUID_RE.test(teamId) ? await this.joinTeamContext(teamId, id) : null;

    // Each tier carries the divisions it is offered to; the funnel shows
    // a player only their division's prices (REG-18).
    const tiers = await loadSeasonTiers(this.db, id);

    // Divisions list for the in-funnel "Pick a division" step
    // (P2-2 / audit §8.1). The funnel skips the step when there's
    // 0 or 1 divisions; with 1 it auto-picks; with 0 the field
    // stays NULL and the player applies via org-wide listing.
    const divisionsList = await this.db
      .select({
        id: schema.divisions.id,
        name: schema.divisions.name,
        tier: schema.divisions.tier
      })
      .from(schema.divisions)
      .where(eq(schema.divisions.seasonId, id))
      .orderBy(schema.divisions.tier);

    // The season's own published form, else its league's league-wide
    // form; never another league's or org's (REG-25). Registrations bind
    // to this same version (REG-8).
    const formVersion = await this.requirements.resolveActiveFormVersion(season);
    const window = this.requirements.windowOf(season);

    return {
      season: {
        id: season.id,
        name: season.name,
        sportCode: season.sportCode,
        startDate: season.startDate,
        endDate: season.endDate,
        registrationOpensAt: season.registrationOpensAt,
        registrationClosesAt: season.registrationClosesAt,
        rosterLockAt: season.rosterLockAt,
        status: season.status,
        timezone: season.timezone,
        // Per-season toggles from the wizard's Divisions & eligibility
        // step. Funnel reads these to skip the free-agent path when
        // disabled, skip parental consent when not required, etc.
        // Schema: @sportspulse/kernel SeasonConfig.
        config: (season.config ?? {}) as Record<string, unknown>
      },
      pricingTiers: tiers.filter((t) => t.isActive),
      divisions: divisionsList,
      // REG-16: the funnel shows `message` instead of the form whenever
      // state is not "open"; the API refuses create and pay the same way.
      registrationWindow: {
        state: window.state,
        message: window.message
      },
      formVersionId: formVersion?.versionId ?? null,
      formDefinition: formVersion?.schema ?? { schemaVersion: 1, questions: [] },
      joinTeam
    };
  }

  /**
   * The team a ?team= link joins, for the funnel: name, division, and
   * the refusal the player would hit (team not in the season, roster
   * full or locked). `available: false` with a message when it cannot.
   */
  private async joinTeamContext(teamId: string, seasonId: string) {
    const opening = await this.rosterEntry.opening(teamId, seasonId);
    if (!opening) {
      return {
        id: teamId,
        name: null as string | null,
        divisionId: null as string | null,
        divisionName: null as string | null,
        available: false,
        message: "This team is not playing this season. Check the link with your captain, or register without a team."
      };
    }
    return {
      id: opening.team.id,
      name: opening.team.name,
      divisionId: opening.division?.id ?? null,
      divisionName: opening.division?.name ?? null,
      available: !opening.refusal,
      message: opening.refusal?.message ?? null
    };
  }

  /**
   * Validate a ?team= (and invite token) on start / resume: a player path,
   * a team that plays the season with room on its roster, and an invite
   * for that same team. Returns what the registration stores.
   */
  private async resolveJoinTeam(
    seasonId: string,
    submissionType: RegistrationSubmissionType,
    teamId: string | undefined,
    inviteToken: string | undefined
  ): Promise<{ teamId: string; divisionId: string | null; inviteId: string | null } | null> {
    if (!teamId) return null;
    if (!submissionTypeCarriesTeam(submissionType)) {
      throw new UnprocessableEntityException(
        "A team registration creates its own team. To join an existing team, pick Register as a player or Captain invite."
      );
    }
    const opening = await this.rosterEntry.opening(teamId, seasonId);
    if (!opening) {
      throw new UnprocessableEntityException(
        "This team is not playing this season. Check the link with your captain, or register without a team."
      );
    }
    if (opening.refusal) {
      throw new ConflictException({ error: `roster_${opening.refusal.reason}`, message: opening.refusal.message });
    }
    let inviteId: string | null = null;
    if (inviteToken) {
      const [inv] = await this.db
        .select({ id: schema.teamInvites.id, teamId: schema.teamInvites.teamId, seasonId: schema.teamInvites.seasonId })
        .from(schema.teamInvites)
        .where(eq(schema.teamInvites.token, inviteToken))
        .limit(1);
      if (inv && inv.teamId === teamId && inv.seasonId === seasonId) inviteId = inv.id;
    }
    return { teamId, divisionId: opening.division?.id ?? null, inviteId };
  }

  @Post("seasons/:id/submissions")
  @ApiOperation({
    summary:
      "Phase 1: account creation + Phase 2 details. Creates Supabase auth user, persons row, and registration row in the right state per kernel state machine. Idempotent on (email, season, path)."
  })
  async startSubmission(
    @Param("id") seasonId: string,
    @Body() body: StartSubmissionBodyDto
  ) {
    const season = await this.requirements.loadSeason(seasonId);
    if (!season) throw new NotFoundException("Season not found");
    // Both checks run before anything is written, including the auth
    // user: REG-16 (window) and REG-8 (the season's published form).
    this.requirements.assertRegistrationOpen(season);
    const formVersion = await this.requirements.bindFormVersion(
      season,
      body.formVersionId ?? null
    );
    // REG-14: the season's registration type decides which paths exist.
    const submissionType = this.assertPathOffered(season, body.submissionType);
    // FR-3.4.1: a team to join, checked before anything is written.
    const join = await this.resolveJoinTeam(seasonId, submissionType, body.teamId, body.inviteToken);
    if (join?.divisionId) body.divisionId = join.divisionId;

    const email = body.email.trim().toLowerCase();
    const baseKey = `${email}|${seasonId}|${submissionType}`;

    // Phase 1.1 — find-or-create the Supabase auth user. Mock flow:
    // email_confirm=true so we don't depend on inbox roundtrip. Real
    // verification email comes when SUPABASE_REQUIRE_EMAIL_CONFIRM is
    // configured.
    const { userId, created: userCreated } =
      await this.supabase.inviteUserByEmail({
        email,
        displayName: body.fullName,
        password: body.password
      });
    // An existing account may only be used by its owner. Without this,
    // anyone could register (and overwrite details) as any email (REG-2).
    if (!userCreated) {
      const verified = await this.supabase.verifyPassword(email, body.password);
      if (verified !== userId) {
        throw new ConflictException(
          "An account already exists for this email. Use Sign in with your password."
        );
      }
    }
    await this.assertTeamNameFree(season.orgId, submissionType, body.teamName, userId);

    // Phase 1.3 — minor evaluation (kernel rule). The Account step
    // collects the DOB; an unknown DOB is treated as adult here and the
    // Details edit re-checks it (spec §6.2: the flag adapts when the DOB
    // is entered later).
    const isMinor = isMinorOn(body.dobDate ?? null);

    // Find-or-create the persons row.
    //
    // Lookup priority:
    //   1. By auth user_id — strongest link, set on every previous
    //      registration this user has done.
    //   2. By legal name — a fallback for the very first registration.
    //
    // Whichever path we take, ensure the row ends up with userId set,
    // otherwise iam.meScope returns null personId and the player
    // dashboard renders "Finish onboarding first".
    let personId: string | undefined;
    const [byUser] = await this.db
      .select({ id: schema.persons.id })
      .from(schema.persons)
      .where(eq(schema.persons.userId, userId))
      .limit(1);
    if (byUser) {
      personId = byUser.id;
    } else {
      const existingPersonRow = await this.db
        .select({ id: schema.persons.id, userId: schema.persons.userId })
        .from(schema.persons)
        .where(
          and(
            eq(schema.persons.legalFirstName, firstName(body.fullName)),
            eq(schema.persons.legalLastName, lastName(body.fullName))
          )
        )
        .limit(1);
      if (existingPersonRow[0]) {
        personId = existingPersonRow[0].id;
        // Adopt this name-matched row only when it isn't already
        // claimed by a different auth user — otherwise we'd silently
        // hijack someone else's profile.
        if (!existingPersonRow[0].userId) {
          await this.db
            .update(schema.persons)
            .set({ userId, updatedAt: new Date() })
            .where(eq(schema.persons.id, personId));
        }
      } else {
        const [person] = await this.db
          .insert(schema.persons)
          .values({
            userId,
            legalFirstName: firstName(body.fullName),
            legalLastName: lastName(body.fullName),
            dobDate: body.dobDate ?? null,
            externalIds: { email, supabaseUserId: userId }
          })
          .returning({ id: schema.persons.id });
        personId = person!.id;
      }
    }

    // Resume support, per (email, season, path), latest registration:
    //   - not submitted yet, or sent back as `incomplete`: resume it and
    //     patch in only the fields this request supplied;
    //   - submitted (pending_review, pending_offline, approved): 409. The
    //     league reviews that record; the funnel must not rewrite it.
    //   - rejected / cancelled / withdrawn: final in the kernel, so this
    //     is a new registration (new row, chained idempotency key).
    const existing = await this.findLatestRegistration(baseKey);
    if (existing && !RESTARTABLE_STATES.has(existing.status)) {
      if (!EDITABLE_STATES.has(existing.status)) {
        this.log.log(
          `refused start over submitted registration=${existing.id} status=${existing.status}`
        );
        throw alreadySubmitted(existing);
      }
      const existingMeta = (existing.metadata as Record<string, unknown>) ?? {};
      const dob =
        body.dobDate ?? ((existingMeta.dobDate as string | null | undefined) ?? null);
      const minor = isMinorOn(dob);
      const patch: Record<string, unknown> = {
        submissionType,
        email,
        fullName: body.fullName,
        isMinor: minor
      };
      if (body.pricingTierId !== undefined) patch.pricingTierId = body.pricingTierId;
      if (body.phone !== undefined) patch.phone = body.phone;
      if (body.dobDate !== undefined) patch.dobDate = body.dobDate;
      if (body.answers) {
        patch.answers = {
          ...((existingMeta.answers as Record<string, unknown> | undefined) ?? {}),
          ...body.answers
        };
      }
      if (body.teamName || body.teamColor) {
        patch.team = { name: body.teamName ?? null, color: body.teamColor ?? null };
      }
      if (join) {
        if (existing.teamId && existing.teamId !== join.teamId) {
          throw new ConflictException({
            error: "registration_has_team",
            message:
              "Your registration for this season is already for another team. Ask the league to move it before joining a different team."
          });
        }
        patch.joinTeam = { teamId: join.teamId, inviteId: join.inviteId, source: "registration_link" };
      }
      const rebind = this.rebindFormVersion(existing, formVersion.versionId);
      const toConsent = this.needsGuardianConsentNow(existing, dob);
      if (toConsent) {
        assertTransitionOr409(
          existing.status,
          "pending_consent",
          "This registration needs a parent or guardian's consent, but it can no longer wait for it. Contact the league."
        );
      }
      const [updated] = await this.db
        .update(schema.registrations)
        .set({
          submittedByUserId: userId,
          metadata: mergeMetadata(existing.metadata, patch),
          ...rebind,
          ...(toConsent ? { status: "pending_consent" } : {}),
          ...(join ? { teamId: join.teamId, ...(join.divisionId ? { divisionId: join.divisionId } : {}) } : {}),
          updatedAt: new Date()
        })
        .where(
          and(
            eq(schema.registrations.id, existing.id),
            eq(schema.registrations.status, existing.status)
          )
        )
        .returning({ id: schema.registrations.id, status: schema.registrations.status });
      if (!updated) {
        throw new ConflictException(
          "This registration changed while you were saving. Reload the page and sign in again."
        );
      }
      if (toConsent) {
        this.log.log(
          `registration=${existing.id} pending_payment -> pending_consent (start: DOB is a minor's, no guardian consent on file)`
        );
      }
      await this.v2.ensurePlayerRoleForRegistration({
        userId,
        divisionId: body.divisionId ?? existing.divisionId ?? null,
        orgId: season.orgId
      });
      return {
        id: updated.id,
        status: updated.status,
        resumed: true,
        userId,
        userCreated: false,
        isMinor: minor
      };
    }
    // A new registration. After a rejected / cancelled one the key chains
    // to it, so a retry of this same request finds this row again.
    const idempotencyKey = existing ? `${baseKey}#${existing.id}` : baseKey;

    // Initial state (kernel rule): pending_consent for a minor,
    // pending_payment for an adult. The funnel confirms the account email
    // itself, so there is no pending_verification step.
    const initialState: RegistrationState = initialFunnelRegistrationState(
      body.dobDate ?? null
    );
    assertValidTransition("draft", initialState);

    let reg: typeof schema.registrations.$inferSelect | undefined;
    try {
      [reg] = await this.db
        .insert(schema.registrations)
        .values({
          idempotencyKey,
          orgId: season.orgId,
          formVersionId: formVersion.versionId,
          submittedByUserId: userId,
          subjectPersonId: personId!,
          seasonId,
          divisionId: body.divisionId ?? null,
          teamId: join?.teamId ?? null,
          status: initialState,
          metadata: {
            submissionType,
            pricingTierId: body.pricingTierId ?? null,
            email,
            fullName: body.fullName,
            phone: body.phone ?? null,
            dobDate: body.dobDate ?? null,
            answers: body.answers ?? {},
            isMinor,
            team:
              body.teamName || body.teamColor
                ? {
                    name: body.teamName ?? null,
                    color: body.teamColor ?? null
                  }
                : undefined,
            joinTeam: join
              ? { teamId: join.teamId, inviteId: join.inviteId, source: "registration_link" }
              : undefined
          }
        })
        .returning();
    } catch (e) {
      const conflict = await this.handleActiveDuplicate(
        e,
        personId!,
        seasonId
      );
      if (conflict) throw conflict;
      throw e;
    }

    // Grant the player role immediately so the player can sign into the
    // player app while their registration is pending. Approval re-runs
    // the same helper (idempotent) and additionally creates the
    // free-agent pool entry for the captain pool view.
    await this.v2.ensurePlayerRoleForRegistration({
      userId,
      divisionId: body.divisionId ?? null,
      orgId: season.orgId
    });

    return {
      id: reg!.id,
      status: reg!.status,
      resumed: false,
      userId,
      userCreated,
      isMinor
    };
  }

  @Post("seasons/:id/resume")
  @ApiOperation({
    summary:
      "Phase 1 alt-path — resume an existing account. Looks up the Supabase user by email, find-or-creates the persons + registrations rows, and returns the same shape as POST /seasons/:id/submissions. Used by the funnel's 'Already have an account?' Sign-in card so returning visitors don't have to re-enter first/last name."
  })
  async resumeSubmission(
    @Param("id") seasonId: string,
    @Body()
    body: {
      email: string;
      password: string;
      submissionType?:
        | "team"
        | "individual"
        | "free_agent"
        | "captain_invite";
      /** Form version the funnel rendered; see StartSubmissionBodyDto. */
      formVersionId?: string;
      /** FR-3.4.1 team to join and the invite followed; see StartSubmissionBodyDto. */
      teamId?: string;
      inviteToken?: string;
    }
  ) {
    const season = await this.requirements.loadSeason(seasonId);
    if (!season) throw new NotFoundException("Season not found");
    this.requirements.assertRegistrationOpen(season);
    if (body.formVersionId && !UUID_RE.test(body.formVersionId)) {
      throw new BadRequestException("formVersionId must be a UUID");
    }
    if (body.teamId && !UUID_RE.test(body.teamId)) {
      throw new BadRequestException("teamId must be a UUID");
    }
    const formVersion = await this.requirements.bindFormVersion(
      season,
      body.formVersionId ?? null
    );
    const submissionType = this.assertPathOffered(season, body.submissionType);
    const join = await this.resolveJoinTeam(
      seasonId,
      submissionType,
      body.teamId,
      typeof body.inviteToken === "string" ? body.inviteToken.slice(0, 200) : undefined
    );

    const email = (body.email ?? "").trim().toLowerCase();
    if (!email) throw new NotFoundException("email required");

    const detail = await this.supabase.findUserDetailByEmail(email);
    if (!detail) {
      throw new NotFoundException(
        "No account found for that email. Use the form above to create one."
      );
    }
    // Resume returns stored DOB, phone and answers, so the caller must
    // prove they own the account (REG-1: email alone used to suffice).
    const verified = await this.supabase.verifyPassword(email, body.password ?? "");
    if (verified !== detail.userId) {
      throw new UnauthorizedException("Email or password is incorrect.");
    }
    const userId = detail.userId;
    const fullName = detail.displayName?.trim() || email.split("@")[0]!;

    const baseKey = `${email}|${seasonId}|${submissionType}`;

    // Find-or-create person row — same priority as startSubmission:
    // by userId first, then by name (and back-fill userId if missing).
    let personId: string | undefined;
    const [byUser] = await this.db
      .select({ id: schema.persons.id })
      .from(schema.persons)
      .where(eq(schema.persons.userId, userId))
      .limit(1);
    if (byUser) {
      personId = byUser.id;
    } else {
      const existingPersonRow = await this.db
        .select({ id: schema.persons.id, userId: schema.persons.userId })
        .from(schema.persons)
        .where(
          and(
            eq(schema.persons.legalFirstName, firstName(fullName)),
            eq(schema.persons.legalLastName, lastName(fullName))
          )
        )
        .limit(1);
      if (existingPersonRow[0]) {
        personId = existingPersonRow[0].id;
        if (!existingPersonRow[0].userId) {
          await this.db
            .update(schema.persons)
            .set({ userId, updatedAt: new Date() })
            .where(eq(schema.persons.id, personId));
        }
      } else {
        const [person] = await this.db
          .insert(schema.persons)
          .values({
            userId,
            legalFirstName: firstName(fullName),
            legalLastName: lastName(fullName),
            externalIds: { email, supabaseUserId: userId }
          })
          .returning({ id: schema.persons.id });
        personId = person!.id;
      }
    }

    // Same rule as startSubmission: resume the latest registration unless
    // it ended (rejected / cancelled / withdrawn), in which case this is a
    // new one. A submitted registration is returned read-only.
    const existing = await this.findLatestRegistration(baseKey);
    if (existing && !RESTARTABLE_STATES.has(existing.status)) {
      // Return the full prior state so the funnel can hydrate the
      // Details step on resume. Pull dob + answers from metadata and
      // recompute isMinor from the stored DOB.
      const existingMeta =
        (existing.metadata as Record<string, unknown> | undefined) ?? {};
      const storedDob = (existingMeta.dobDate as string | null) ?? null;
      const rebind = this.rebindFormVersion(existing, formVersion.versionId);
      // A minor's registration that reached pending_payment without the
      // guardian (rows created by the old resume, which ignored the DOB)
      // goes back to wait for consent before the minor can pay.
      const toConsent = this.needsGuardianConsentNow(existing, storedDob);
      if (toConsent) {
        assertTransitionOr409(
          existing.status,
          "pending_consent",
          "This registration needs a parent or guardian's consent, but it can no longer wait for it. Contact the league."
        );
      }
      let status = existing.status;
      if (join && existing.teamId && existing.teamId !== join.teamId) {
        throw new ConflictException({
          error: "registration_has_team",
          message:
            "Your registration for this season is already for another team. Ask the league to move it before joining a different team."
        });
      }
      // Record the team only on a registration the player can still edit;
      // a submitted one goes through the invite accept (team recorded there).
      const recordJoin = !!join && EDITABLE_STATES.has(existing.status) && existing.teamId !== join.teamId;
      if (rebind.formVersionId || toConsent || recordJoin) {
        const joinMeta = recordJoin
          ? { joinTeam: { teamId: join!.teamId, inviteId: join!.inviteId, source: "registration_link" } }
          : {};
        const [updated] = await this.db
          .update(schema.registrations)
          .set({
            ...rebind,
            ...(toConsent || recordJoin
              ? {
                  ...(toConsent ? { status: "pending_consent" } : {}),
                  metadata: mergeMetadata(existing.metadata, {
                    ...(toConsent ? { isMinor: true } : {}),
                    ...joinMeta
                  })
                }
              : {}),
            ...(recordJoin
              ? { teamId: join!.teamId, ...(join!.divisionId ? { divisionId: join!.divisionId } : {}) }
              : {}),
            updatedAt: new Date()
          })
          .where(
            and(
              eq(schema.registrations.id, existing.id),
              eq(schema.registrations.status, existing.status)
            )
          )
          .returning({ status: schema.registrations.status });
        if (!updated) {
          throw new ConflictException(
            "This registration changed while you were signing in. Reload the page and sign in again."
          );
        }
        status = updated.status;
        if (toConsent) {
          this.log.log(
            `registration=${existing.id} pending_payment -> pending_consent (resume: stored DOB is a minor's, no guardian consent on file)`
          );
        }
      }
      return {
        id: existing.id,
        status,
        resumed: true,
        userId,
        userCreated: false,
        isMinor: isMinorOn(storedDob),
        fullName: (existingMeta.fullName as string | undefined) ?? fullName,
        dobDate: storedDob,
        phone: (existingMeta.phone as string | null) ?? null,
        answers:
          (existingMeta.answers as Record<string, unknown> | undefined) ?? {},
        pricingTierId:
          (existingMeta.pricingTierId as string | null) ?? null,
        divisionId: existing.divisionId ?? null
      };
    }

    // Hydrate dobDate + phone from the user's profile so a returning
    // user who set those at first sign-up sees them pre-filled on the
    // Details step instead of "—". Falls back to nulls if no profile
    // row exists (defensive — sign-up writes one).
    const [profileRow] = await this.db
      .select({
        dobDate: schema.profiles.dobDate,
        phoneE164: schema.profiles.phoneE164
      })
      .from(schema.profiles)
      .where(eq(schema.profiles.id, userId))
      .limit(1);
    // The DOB the account already holds: the profile's, else the person
    // row's (a minor who registered before has it on persons, not on the
    // profile, and used to resume here as an adult).
    const [personRow] = await this.db
      .select({ dobDate: schema.persons.dobDate })
      .from(schema.persons)
      .where(eq(schema.persons.id, personId!))
      .limit(1);
    const profileDob = profileRow?.dobDate ?? personRow?.dobDate ?? null;
    const profilePhone = profileRow?.phoneE164 ?? null;
    // The consent bypass: this used to insert every resumed account as
    // pending_payment, so a minor signing in with an existing account
    // skipped the guardian. Same kernel rule as startSubmission.
    const initialState: RegistrationState = initialFunnelRegistrationState(profileDob);
    assertValidTransition("draft", initialState);
    const idempotencyKey = existing ? `${baseKey}#${existing.id}` : baseKey;

    let reg: typeof schema.registrations.$inferSelect | undefined;
    try {
      [reg] = await this.db
        .insert(schema.registrations)
        .values({
          idempotencyKey,
          orgId: season.orgId,
          formVersionId: formVersion.versionId,
          submittedByUserId: userId,
          subjectPersonId: personId!,
          seasonId,
          divisionId: join?.divisionId ?? null,
          teamId: join?.teamId ?? null,
          status: initialState,
          metadata: {
            submissionType,
            pricingTierId: null,
            email,
            fullName,
            phone: profilePhone,
            dobDate: profileDob,
            answers: {},
            isMinor: isMinorOn(profileDob),
            ...(join
              ? { joinTeam: { teamId: join.teamId, inviteId: join.inviteId, source: "registration_link" } }
              : {})
          }
        })
        .returning();
    } catch (e) {
      const conflict = await this.handleActiveDuplicate(
        e,
        personId!,
        seasonId
      );
      if (conflict) throw conflict;
      throw e;
    }

    return {
      id: reg!.id,
      status: reg!.status,
      resumed: false,
      userId,
      userCreated: false,
      isMinor: isMinorOn(profileDob),
      fullName,
      dobDate: profileDob,
      phone: profilePhone,
      answers: {} as Record<string, unknown>,
      pricingTierId: null as string | null,
      divisionId: (join?.divisionId ?? null) as string | null
    };
  }

  @Get("submissions/:id")
  @ApiOperation({
    summary:
      "Resume a submission. Caller must pass ?email= matching the row's stored email — there's no JWT here, this is the public funnel. Returns sanitised state for the funnel to repopulate from."
  })
  async getSubmission(
    @Param("id") id: string,
    @Query("email") email: string
  ) {
    if (!email) throw new NotFoundException("email query param required");
    const [row] = await this.db
      .select()
      .from(schema.registrations)
      .where(eq(schema.registrations.id, id))
      .limit(1);
    if (!row) throw new NotFoundException("Submission not found");
    const meta = (row.metadata as Record<string, unknown>) ?? {};
    if ((meta.email as string)?.toLowerCase() !== email.trim().toLowerCase()) {
      // Don't leak whether the row exists — return 404 either way.
      throw new NotFoundException("Submission not found");
    }
    return {
      id: row.id,
      status: row.status,
      submissionType: meta.submissionType ?? "individual",
      pricingTierId: meta.pricingTierId ?? null,
      email: meta.email,
      fullName: meta.fullName ?? null,
      phone: meta.phone ?? null,
      dobDate: meta.dobDate ?? null,
      isMinor: meta.isMinor ?? false,
      answers: meta.answers ?? {},
      // Team-only: the real team_id stamped by createTeamFromRegistration
      // on approve. The funnel's confirmation page uses this for the
      // split-pay share link (which previously rendered against a fake
      // registration-id prefix and 404'd).
      teamId: row.teamId ?? null,
      divisionId: row.divisionId ?? null
    };
  }

  @Get("seasons/:id/waivers")
  @ApiOperation({
    summary:
      "Phase 3.1 preview: the documents a registrant of this season must sign (liability waiver, code of conduct), resolved from the season setup, then the season's published form, then the SportsPulse default text. No signature state; see GET /submissions/:id/waivers."
  })
  async listWaivers(@Param("id") seasonId: string) {
    const season = await this.requirements.loadSeason(seasonId);
    if (!season) throw new NotFoundException("Season not found");
    const required = await this.requirements.previewDocuments(season);
    return {
      requiredKinds: required.map((r) => r.documentKind),
      documents: required.map((r) => ({
        documentId: `form:${r.key}`,
        key: r.key,
        kind: r.documentKind,
        name: r.title,
        description: null,
        versionId: `form:${r.key}`,
        contentHtml: r.content,
        languageCode: "en",
        signMode: r.signMode
      }))
    };
  }

  @Get("submissions/:id/waivers")
  @ApiOperation({
    summary:
      "Phase 3.1: the documents this registration must have signed before it can be submitted, each with signed/unsigned state for the registrant (REG-5). Same email check as GET /submissions/:id. The pay endpoint refuses while any is unsigned."
  })
  async listSubmissionWaivers(
    @Param("id") submissionId: string,
    @Query("email") email: string
  ) {
    const row = await this.loadAndAuthorize(submissionId, email);
    const { documents } = await this.requirements.listDocuments(row);
    return {
      signerName: await this.funnelSignerName(row),
      requiredKinds: documents.map((d) => d.kind),
      documents: documents.map((d) => ({
        documentId: `form:${d.key}`,
        key: d.key,
        kind: d.kind,
        name: d.title,
        description: null,
        versionId: d.documentVersionId ?? `form:${d.key}`,
        contentHtml: d.contentHtml,
        languageCode: "en",
        signMode: d.signMode,
        signed: d.signed,
        signedAt: d.signedAt
      }))
    };
  }

  @Post("submissions/:id/sign-waiver")
  @ApiOperation({
    summary:
      "Phase 3.1: record a signature on a required document (key liability_waiver | code_of_conduct; legacy form:<kind> ids accepted). The typed name must match the registrant's name. Stores the signature with timestamp, IP and user agent on consent_signatures, idempotent per document text. Returns how many required documents are still unsigned."
  })
  async signWaiver(
    @Param("id") submissionId: string,
    @Body()
    body: {
      email: string;
      key?: string;
      documentVersionId?: string;
      signatureName: string;
    },
    @Req() req: { ip?: string; headers?: Record<string, string | string[] | undefined> }
  ) {
    const row = await this.loadAndAuthorize(submissionId, body.email);
    const signatureName = (body.signatureName ?? "").trim();
    if (!signatureName) {
      throw new UnprocessableEntityException("Type your full legal name to sign.");
    }
    let key = documentKeyFrom(body.key ?? body.documentVersionId);
    if (!key && body.documentVersionId && UUID_RE.test(body.documentVersionId)) {
      // A stored version id: accept it only when it is one of this
      // registration's required documents.
      const { documents } = await this.requirements.listDocuments(row);
      key = documents.find((d) => d.documentVersionId === body.documentVersionId)?.key ?? null;
    }
    if (!key) {
      throw new UnprocessableEntityException(
        "That document is not one this registration asks you to sign."
      );
    }
    const result = await this.requirements.signRequirement({
      registration: row,
      key,
      signatureName,
      // The funnel's Sign button compares against the account name the
      // registrant entered; the server holds the same rule.
      expectedSignerName: await this.funnelSignerName(row),
      signedByUserId: row.submittedByUserId,
      ipAddr: requestClientIp(req),
      userAgent: requestUserAgent(req)
    });
    const outstanding = result.documents.filter((d) => !d.signed);
    return {
      signatureId: result.signatureId,
      documentVersionId: result.documentVersionId,
      signedAt: result.signedAt,
      alreadySigned: !result.created,
      outstandingRequired: outstanding.length,
      outstanding: outstanding.map((d) => ({ key: d.key, name: d.title }))
    };
  }

  @Post("submissions/:id/parental-consent/start")
  @ApiOperation({
    summary:
      "Phase 3.2 — kick off the parental consent flow for a minor. Stores parent email on the submission metadata and returns a mock consent token (real email delivery wires up with Resend in a follow-up slice)."
  })
  async startParentalConsent(
    @Param("id") submissionId: string,
    @Body() body: { email: string; parentEmail: string }
  ) {
    const row = await this.loadAndAuthorize(submissionId, body.email);
    const rowMeta = (row.metadata as Record<string, unknown>) ?? {};
    if (row.status !== "pending_consent") {
      // Was a plain Error (500). Already-consented is the common case.
      throw new ConflictException({
        error: "not_pending_consent",
        message: rowMeta.parentConsentConfirmedAt
          ? "Your parent or guardian already confirmed. Continue to the next step."
          : `This registration is ${stateLabel(row.status)}. A consent request can only be sent while it waits for a parent or guardian.`,
        currentStatus: row.status
      });
    }
    const parentEmail = (body.parentEmail ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parentEmail)) {
      throw new UnprocessableEntityException("Enter your parent or guardian's email address.");
    }
    if (parentEmail === String(rowMeta.email ?? "").toLowerCase()) {
      // The link is the guardian's credential (REG-6); it must not go to
      // the registrant's own inbox.
      throw new UnprocessableEntityException(
        "Use your parent or guardian's own email address, not the one you registered with."
      );
    }

    // Signed token (see signConsentToken). Only the guardian receives it;
    // the redeem endpoint verifies the signature and the 24h expiry.
    const token = this.signConsentToken(submissionId, Date.now());
    const meta = mergeMetadata(row.metadata, {
      parentEmail,
      parentConsentTokenIssuedAt: new Date().toISOString()
    });
    await this.db
      .update(schema.registrations)
      .set({ metadata: meta, updatedAt: new Date() })
      .where(eq(schema.registrations.id, submissionId));

    // One per-environment origin for every emailed link (shared/app-urls).
    const portalUrl = `${playerWebUrl(this.config)}/parental-consent/${token}`;
    const subject = "Action required: please confirm your child's registration";
    const messageBody = [
      `A child registration on SportsPulse needs your consent before it can proceed.`,
      ``,
      `Click here to review and confirm:`,
      portalUrl,
      ``,
      `This link expires in 24 hours. If you weren't expecting this email, ignore it.`
    ].join("\n");

    // Real Resend dispatch (or log-only fallback if RESEND_API_KEY
    // unset). The mockConsentMessage comes back regardless so the
    // funnel can offer a copy/paste fallback.
    const dispatch = await this.email.send({
      to: parentEmail,
      subject,
      body: messageBody,
      channel: "registration.parental_consent"
    });

    // The link is the guardian's credential, so it only goes back to the
    // (minor's) browser when email delivery is not configured, as a
    // copy/paste fallback for dev and staging (REG-6).
    return {
      consentToken: dispatch.delivered ? null : token,
      emailDelivered: dispatch.delivered,
      emailDeliveryReason: dispatch.reason ?? null,
      mockConsentMessage: dispatch.delivered
        ? null
        : { to: parentEmail, subject, body: messageBody }
    };
  }

  @Post("submissions/:id/parental-consent/confirm")
  @ApiOperation({
    summary:
      "Player-side consent check. Consent is given only by the guardian through the emailed link (POST /parental-consent/:token/redeem); this returns the current status once they have, and 409 while still waiting."
  })
  async confirmParentalConsent(
    @Param("id") submissionId: string,
    @Body() body: { email: string; consentToken?: string }
  ) {
    const row = await this.loadAndAuthorize(submissionId, body.email);
    // REG-7: this used to advance the state itself. After the guardian
    // had already advanced it, the second transition threw and surfaced
    // as a 500, so no minor could get past this step. It also let the
    // minor consent on their own behalf with the token they were shown.
    if (row.status === "pending_consent") {
      throw new ConflictException({
        error: "awaiting_guardian",
        message:
          "Waiting for your parent or guardian to confirm from the link we emailed them."
      });
    }
    return { id: submissionId, status: row.status };
  }

  /**
   * Parent-portal pre-fetch: a parent clicks the URL we emailed them
   * (https://player.sportspulse.us/parental-consent/:token) and
   * the page calls this to look up context — child name, season name,
   * organisation name — so the parent has enough information to
   * decide whether to consent.
   *
   * Anonymous: the token IS the auth. No Supabase session required.
   * Backlog #8 / Parent portal.
   */
  @Get("parental-consent/:token")
  @ApiOperation({
    summary:
      "Anonymous lookup: decode a parental-consent token and return display context (child name, season, org). Used by the parent portal."
  })
  async getParentalConsentContext(@Param("token") token: string): Promise<{
    submissionId: string;
    status: string;
    childDisplayName: string;
    seasonName: string | null;
    orgName: string | null;
    expired: boolean;
    confirmedAt: string | null;
    /** REG-15: the exact words the guardian signs (stored with the signature). */
    consentTitle: string;
    consentText: string;
    guardianEmail: string | null;
    signedBy: string | null;
  }> {
    const decoded = this.decodeConsentToken(token);
    if (!decoded) {
      throw new NotFoundException("Invalid or expired consent token");
    }
    const [row] = await this.db
      .select({
        r: schema.registrations,
        orgName: schema.orgs.displayName,
        seasonName: schema.seasons.name
      })
      .from(schema.registrations)
      .leftJoin(schema.orgs, eq(schema.orgs.id, schema.registrations.orgId))
      .leftJoin(
        schema.seasons,
        eq(schema.seasons.id, schema.registrations.seasonId)
      )
      .where(eq(schema.registrations.id, decoded.submissionId))
      .limit(1);
    if (!row) {
      throw new NotFoundException("Submission not found");
    }
    const meta = (row.r.metadata as Record<string, unknown>) ?? {};
    return {
      submissionId: row.r.id,
      status: row.r.status,
      childDisplayName: (meta.fullName as string) ?? "your child",
      seasonName: row.seasonName ?? null,
      orgName: row.orgName ?? null,
      expired: decoded.expired,
      confirmedAt: (meta.parentConsentConfirmedAt as string) ?? null,
      consentTitle: PARENTAL_CONSENT_TITLE,
      consentText: parentalConsentText({
        seasonName: row.seasonName ?? null,
        orgName: row.orgName ?? null
      }),
      guardianEmail: (meta.parentEmail as string | undefined) ?? null,
      signedBy: (meta.parentConsentSignerName as string | undefined) ?? null
    };
  }

  /**
   * Parent-portal action: confirm or decline the registration. No
   * Supabase auth — token-only. On confirm, advances state
   * pending_consent → pending_payment. On decline, status → cancelled.
   * Backlog #8 / Parent portal.
   */
  @Post("parental-consent/:token/redeem")
  @ApiOperation({
    summary:
      "Anonymous redeem: the guardian confirms (typed full legal name + acknowledgement, stored as a consent record with the consent text, IP and user agent; status pending_consent -> pending_payment) or declines (-> cancelled). One transaction. 409 when the link expired (>24h) or the registration is no longer waiting; a repeated confirm returns the stored consent."
  })
  async redeemParentalConsent(
    @Param("token") token: string,
    @Body() body: RedeemParentalConsentBodyDto,
    @Req() req: { ip?: string; headers?: Record<string, string | string[] | undefined> }
  ): Promise<{
    submissionId: string;
    status: string;
    alreadyConfirmed?: boolean;
    signatureId?: string | null;
    signedBy?: string | null;
  }> {
    const decoded = this.decodeConsentToken(token);
    if (!decoded) {
      throw new NotFoundException("Invalid consent token");
    }
    if (decoded.expired) {
      throw new ConflictException({
        error: "consent_token_expired",
        message:
          "This consent link has expired. Ask the player to resend the consent email."
      });
    }
    const guardianName = (body.guardianName ?? "").trim().replace(/\s+/g, " ");
    if (body.action === "confirm") {
      // REG-15: consent is a signature, not a button press.
      if (!guardianNameAcceptable(guardianName)) {
        throw new UnprocessableEntityException(
          "Type your full legal name (first and last) to sign the consent."
        );
      }
      if (body.acknowledged !== true) {
        throw new UnprocessableEntityException(
          "Tick the box to confirm you have read the consent and agree to it."
        );
      }
    }
    const ipAddr = requestClientIp(req);
    const userAgent = requestUserAgent(req);

    const result = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(schema.registrations)
        .where(eq(schema.registrations.id, decoded.submissionId))
        .limit(1)
        .for("update");
      if (!row) throw new NotFoundException("Submission not found");
      const meta = (row.metadata as Record<string, unknown>) ?? {};

      if (row.status !== "pending_consent") {
        if (body.action === "confirm" && meta.parentConsentConfirmedAt) {
          return {
            submissionId: row.id,
            status: row.status,
            alreadyConfirmed: true,
            signatureId: (meta.parentConsentSignatureId as string | undefined) ?? null,
            signedBy: (meta.parentConsentSignerName as string | undefined) ?? null
          };
        }
        throw new ConflictException({
          error: "not_pending_consent",
          message: `This registration is ${stateLabel(row.status)} and is no longer waiting for a parent or guardian. Contact the league if that is not what you expected.`,
          currentStatus: row.status
        });
      }

      const now = new Date();
      if (body.action === "decline") {
        assertTransitionOr409(
          row.status,
          "cancelled",
          "This registration can no longer be declined. Contact the league."
        );
        const [updated] = await tx
          .update(schema.registrations)
          .set({
            status: "cancelled",
            metadata: mergeMetadata(row.metadata, {
              parentConsentDeclinedAt: now.toISOString(),
              ...(guardianName ? { parentConsentDeclinedBy: guardianName } : {})
            }),
            updatedAt: now
          })
          .where(
            and(
              eq(schema.registrations.id, row.id),
              eq(schema.registrations.status, "pending_consent")
            )
          )
          .returning({ status: schema.registrations.status });
        if (!updated) throw new Error(`decline readback empty registration=${row.id}`);
        return { submissionId: row.id, status: updated.status };
      }

      assertTransitionOr409(
        row.status,
        "pending_payment",
        "This registration can no longer be confirmed. Contact the league."
      );
      const [names] = await tx
        .select({ seasonName: schema.seasons.name, orgName: schema.orgs.displayName })
        .from(schema.registrations)
        .leftJoin(schema.seasons, eq(schema.seasons.id, schema.registrations.seasonId))
        .leftJoin(schema.orgs, eq(schema.orgs.id, schema.registrations.orgId))
        .where(eq(schema.registrations.id, row.id))
        .limit(1);
      const signature = await this.requirements.recordGuardianConsent(tx, {
        orgId: row.orgId,
        subjectPersonId: row.subjectPersonId,
        registrationId: row.id,
        consentText: parentalConsentText({
          seasonName: names?.seasonName ?? null,
          orgName: names?.orgName ?? null
        }),
        guardianName,
        guardianEmail: (meta.parentEmail as string | undefined) ?? null,
        ipAddr,
        userAgent
      });
      const [updated] = await tx
        .update(schema.registrations)
        .set({
          status: "pending_payment",
          metadata: mergeMetadata(row.metadata, {
            parentConsentConfirmedAt: now.toISOString(),
            parentConsentSignerName: guardianName,
            parentConsentSignatureId: signature.signatureId,
            parentConsentDocumentVersionId: signature.documentVersionId
          }),
          updatedAt: now
        })
        .where(
          and(
            eq(schema.registrations.id, row.id),
            eq(schema.registrations.status, "pending_consent")
          )
        )
        .returning({ status: schema.registrations.status });
      if (!updated) throw new Error(`consent readback empty registration=${row.id}`);
      return {
        submissionId: row.id,
        status: updated.status,
        signatureId: signature.signatureId,
        signedBy: guardianName
      };
    });
    this.log.log(
      `parental consent ${body.action} registration=${result.submissionId} status=${result.status}${result.alreadyConfirmed ? " (already confirmed)" : ""}`
    );
    return result;
  }

  /**
   * Decode a base64url(`${submissionId}:${issuedAtMs}`) consent token.
   * Returns null on parse failure; marks `expired` when the timestamp
   * is older than 24h so callers can render a "this link expired"
   * state instead of a generic "invalid token" message.
   */
  private consentSecret(): string {
    return (
      this.config.get<string>("PARENTAL_CONSENT_SECRET") ??
      this.config.get<string>("SUPABASE_JWT_SECRET") ??
      this.config.getOrThrow<string>("SUPABASE_SERVICE_ROLE_KEY")
    );
  }

  /** `base64url(submissionId:issuedAtMs).hmac` — unforgeable without the secret (REG-6). */
  private signConsentToken(submissionId: string, issuedAtMs: number): string {
    const payload = Buffer.from(`${submissionId}:${issuedAtMs}`).toString("base64url");
    const mac = createHmac("sha256", this.consentSecret()).update(payload).digest("base64url");
    return `${payload}.${mac}`;
  }

  private decodeConsentToken(
    token: string
  ): { submissionId: string; issuedAt: Date; expired: boolean } | null {
    const [payload, mac] = (token ?? "").split(".");
    if (!payload || !mac) return null;
    const expected = createHmac("sha256", this.consentSecret()).update(payload).digest();
    const given = Buffer.from(mac, "base64url");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      return null;
    }
    let decoded = "";
    try {
      decoded = Buffer.from(payload, "base64url").toString("utf-8");
    } catch {
      return null;
    }
    const sep = decoded.indexOf(":");
    if (sep <= 0) return null;
    const submissionId = decoded.slice(0, sep);
    const issuedAtMs = Number(decoded.slice(sep + 1));
    if (
      !submissionId ||
      Number.isNaN(issuedAtMs) ||
      submissionId.length < 32
    ) {
      return null;
    }
    const issuedAt = new Date(issuedAtMs);
    const ageMs = Date.now() - issuedAtMs;
    return {
      submissionId,
      issuedAt,
      expired: ageMs > 24 * 60 * 60 * 1000
    };
  }

  @Post("submissions/:id/eligibility-check")
  @ApiOperation({
    summary:
      "Phase 3.3 — run automated eligibility checks (age fit, duplicate detection, USA Hockey ID format). Returns flags. Does NOT block the funnel; flags surface in the admin review queue (spec §6.3 — payment proceeds in parallel)."
  })
  async eligibilityCheck(
    @Param("id") submissionId: string,
    @Body() body: { email: string }
  ) {
    const row = await this.loadAndAuthorize(submissionId, body.email);
    const meta = (row.metadata as Record<string, unknown>) ?? {};
    const flags: string[] = [];

    // Age vs season — coarse sanity check first (catches typos like
    // dob=2999-…). Then a division-level check that compares the
    // registrant's birth year against the division's bound age_group
    // (BUG-058). Two distinct flags: `age_out_of_range:<n>` for the
    // sanity bucket; `age_division_mismatch` for the structural fit.
    const dob = meta.dobDate as string | null;
    if (dob) {
      const age = ageFromDob(dob);
      if (age !== null && (age < 5 || age > 80)) {
        flags.push(`age_out_of_range:${age}`);
      }
    } else {
      flags.push("dob_missing");
    }

    // Age / division fit. Skipped when:
    //   - the registration isn't bound to a division (rare, but the
    //     funnel allows season-only path-= signals like free_agent);
    //   - the division has no ageGroupId (the admin hasn't picked an
    //     age window — there's nothing to compare against);
    //   - the ageGroup has neither birthYearMin nor birthYearMax (the
    //     window is open-ended, so every birth year fits).
    // Otherwise: compare the registrant's birth year against the
    // configured min/max and flag if outside.
    if (row.divisionId && dob) {
      const [ageWindow] = await this.db
        .select({
          birthYearMin: schema.ageGroups.birthYearMin,
          birthYearMax: schema.ageGroups.birthYearMax
        })
        .from(schema.divisions)
        .innerJoin(
          schema.ageGroups,
          eq(schema.ageGroups.id, schema.divisions.ageGroupId)
        )
        .where(eq(schema.divisions.id, row.divisionId))
        .limit(1);
      if (
        ageWindow &&
        (ageWindow.birthYearMin !== null || ageWindow.birthYearMax !== null)
      ) {
        const birthYear = Number(dob.slice(0, 4));
        if (Number.isFinite(birthYear)) {
          const tooYoung =
            ageWindow.birthYearMax !== null && birthYear > ageWindow.birthYearMax;
          const tooOld =
            ageWindow.birthYearMin !== null && birthYear < ageWindow.birthYearMin;
          if (tooYoung || tooOld) flags.push("age_division_mismatch");
        }
      }
    }

    // Duplicate detection — same email + season already has another
    // registration that's not this one. Idempotency key prevents the
    // exact-same path from creating two; a different path is still
    // worth flagging to admin.
    const dupes = await this.db
      .select({ id: schema.registrations.id })
      .from(schema.registrations)
      .where(eq(schema.registrations.subjectPersonId, row.subjectPersonId));
    if (dupes.length > 1) flags.push("duplicate_subject");

    // USA Hockey ID — hockey-only. Missing raises `usa_hockey_id_missing`
    // (the funnel collects it as a built-in field, so blank means the
    // player navigated around or the season is non-hockey). When present,
    // validate the 6–12 alphanumeric format the governing body uses.
    const answers = (meta.answers as Record<string, unknown>) ?? {};
    const seasonRow = row.seasonId
      ? (
          await this.db
            .select({ sportCode: schema.seasons.sportCode })
            .from(schema.seasons)
            .where(eq(schema.seasons.id, row.seasonId))
            .limit(1)
        )[0]
      : null;
    const isHockey = seasonRow?.sportCode === "HOCKEY_ICE";
    const usaHockeyId = answers["usa_hockey_id"];
    const usaHockeyIdStr =
      typeof usaHockeyId === "string" ? usaHockeyId.trim() : "";
    if (isHockey) {
      if (!usaHockeyIdStr) {
        flags.push("usa_hockey_id_missing");
      } else if (!/^[A-Z0-9]{6,12}$/i.test(usaHockeyIdStr)) {
        flags.push("usa_hockey_id_format_invalid");
      }
    }

    // Persist flags on the submission so admin review can see them.
    const merged = mergeMetadata(meta, {
      eligibilityChecks: {
        ranAt: new Date().toISOString(),
        flags
      }
    });
    await this.db
      .update(schema.registrations)
      .set({ metadata: merged, updatedAt: new Date() })
      .where(eq(schema.registrations.id, submissionId));

    return { passed: flags.length === 0, flags };
  }

  /**
   * A team registration may not take a name another captain's team holds
   * in this organization (refused here, before payment). The same
   * captain's own team of that name is a returning team and passes.
   */
  private async assertTeamNameFree(
    orgId: string,
    submissionType: string,
    teamName: string | null | undefined,
    userId: string
  ): Promise<void> {
    if (submissionType !== "team" || !teamName?.trim()) return;
    const verdict = await teamNameVerdict(this.db, orgId, teamName, userId);
    if (verdict.kind === "taken") {
      this.log.log(`refused team name "${teamName.trim()}" org=${orgId} user=${userId}`);
      throw new ConflictException(verdict.message);
    }
  }

  @Patch("submissions/:id")
  @ApiOperation({
    summary:
      "Persist later-stage funnel input back onto the registration row. The funnel calls this at Details → Compliance (with answers) and at the Pay step (with pricingTierId) so the row reflects what the player actually entered. Without it, every Details-step field lives in client state only and the pay/approve handlers see {} for answers."
  })
  async updateSubmission(
    @Param("id") submissionId: string,
    @Body()
    body: {
      email: string;
      answers?: Record<string, unknown>;
      pricingTierId?: string | null;
      teamName?: string | null;
      teamColor?: string | null;
      divisionId?: string | null;
      dobDate?: string | null;
    }
  ) {
    const row = await this.loadAndAuthorize(submissionId, body.email);
    // A submitted registration is the league's record; the funnel used to
    // overwrite its answers, tier and division after review had started.
    if (!EDITABLE_STATES.has(row.status)) {
      this.log.log(`refused edit of submitted registration=${row.id} status=${row.status}`);
      throw alreadySubmitted(row);
    }
    const meta = (row.metadata as Record<string, unknown>) ?? {};
    const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k);

    const patch: Record<string, unknown> = {};
    if (body.answers && typeof body.answers === "object") {
      // Merge — don't replace — so a re-submit of Details doesn't wipe
      // partial answers from an earlier visit.
      const existingAnswers =
        (meta.answers as Record<string, unknown> | undefined) ?? {};
      patch.answers = { ...existingAnswers, ...body.answers };
    }
    if (has("pricingTierId")) {
      patch.pricingTierId = body.pricingTierId ?? null;
    }
    let dob = (meta.dobDate as string | null | undefined) ?? null;
    if (has("dobDate")) {
      const next = body.dobDate ?? null;
      if (next !== null && !/^\d{4}-\d{2}-\d{2}$/.test(next)) {
        throw new UnprocessableEntityException("Date of birth must be a date (YYYY-MM-DD).");
      }
      if (next !== dob && !PRE_SUBMISSION_STATES.has(row.status)) {
        throw new ConflictException(
          "The date of birth cannot be changed after the registration was submitted. Contact the league to correct it."
        );
      }
      // Editable inline on Details — write DOB onto metadata and
      // recompute isMinor (kernel rule).
      dob = next;
      patch.dobDate = next;
      patch.isMinor = isMinorOn(next);
    }
    if (has("teamName") && row.submittedByUserId) {
      await this.assertTeamNameFree(row.orgId, String(meta.submissionType ?? ""), body.teamName, row.submittedByUserId);
    }
    if (has("teamName") || has("teamColor")) {
      const existingTeam =
        (meta.team as Record<string, unknown> | undefined) ?? {};
      patch.team = {
        ...existingTeam,
        ...(has("teamName") ? { name: body.teamName ?? null } : {}),
        ...(has("teamColor") ? { color: body.teamColor ?? null } : {})
      };
    }

    // divisionId is a real column, not metadata.
    const dbPatch: Record<string, unknown> = {};
    if (has("divisionId")) {
      dbPatch.divisionId = body.divisionId ?? null;
    }

    // REG-18: the division is one of this season's, and the price is one
    // the season offers for that division. A division change that leaves
    // the old price invalid clears it, so the player picks again.
    const nextDivisionId = has("divisionId") ? (body.divisionId ?? null) : (row.divisionId ?? null);
    if (has("divisionId") && nextDivisionId && row.seasonId) {
      const [div] = await this.db
        .select({ id: schema.divisions.id })
        .from(schema.divisions)
        .where(and(eq(schema.divisions.id, nextDivisionId), eq(schema.divisions.seasonId, row.seasonId)))
        .limit(1);
      if (!div) throw new UnprocessableEntityException("That division is not part of this season.");
    }
    const nextTierId = has("pricingTierId")
      ? (body.pricingTierId ?? null)
      : ((meta.pricingTierId as string | null | undefined) ?? null);
    if (nextTierId && row.seasonId && (has("pricingTierId") || has("divisionId"))) {
      const tier = (await loadSeasonTiers(this.db, row.seasonId)).find((t) => t.id === nextTierId);
      const offered = !!tier && tier.isActive && tierOffersDivision(tier.divisionIds, nextDivisionId);
      if (!offered) {
        if (has("pricingTierId")) {
          this.log.log(`refused tier=${nextTierId} registration=${row.id} division=${nextDivisionId}`);
          throw new UnprocessableEntityException(
            "That price is not offered for your division. Pick one of the prices shown."
          );
        }
        patch.pricingTierId = null;
        this.log.log(`registration=${row.id} division=${nextDivisionId}: tier ${nextTierId} not offered there, cleared`);
      } else if (has("pricingTierId") && tierIsFull(tier!)) {
        this.log.log(`refused tier=${nextTierId} registration=${row.id}: full ${tier!.usageCount}/${tier!.usageLimit}`);
        throw new UnprocessableEntityException(
          `That price is full: ${tier!.usageCount} of ${tier!.usageLimit} taken. Pick another price.`
        );
      }
    }

    // A DOB that shows a minor sends an unpaid registration back to wait
    // for the guardian (kernel pending_payment -> pending_consent). It
    // never goes the other way: only the guardian's consent leaves
    // pending_consent.
    const toConsent = this.needsGuardianConsentNow(row, dob);
    if (toConsent) {
      assertTransitionOr409(
        row.status,
        "pending_consent",
        "This registration needs a parent or guardian's consent, but it can no longer wait for it. Contact the league."
      );
    }

    if (Object.keys(patch).length === 0 && Object.keys(dbPatch).length === 0 && !toConsent) {
      return { id: submissionId, updated: false, status: row.status, isMinor: isMinorOn(dob) };
    }

    const [updated] = await this.db
      .update(schema.registrations)
      .set({
        ...(Object.keys(patch).length > 0
          ? { metadata: mergeMetadata(meta, patch) }
          : {}),
        ...dbPatch,
        ...(toConsent ? { status: "pending_consent" } : {}),
        updatedAt: new Date()
      })
      .where(
        and(
          eq(schema.registrations.id, submissionId),
          eq(schema.registrations.status, row.status)
        )
      )
      .returning({ status: schema.registrations.status });
    if (!updated) {
      throw new ConflictException(
        "This registration changed while you were saving. Reload the page and sign in again."
      );
    }
    if (toConsent) {
      this.log.log(
        `registration=${submissionId} pending_payment -> pending_consent (Details: DOB is a minor's, no guardian consent on file)`
      );
    }
    return { id: submissionId, updated: true, status: updated.status, isMinor: isMinorOn(dob) };
  }

  @Get("submissions/:id/wallet")
  @ApiOperation({ summary: "The registrant's wallet credit in this registration's org, for the payment step (FR-3.6.2)." })
  async wallet(@Param("id") submissionId: string, @Query("email") email: string) {
    const row = await this.loadAndAuthorize(submissionId, email);
    if (!row.subjectPersonId) return { balanceCents: 0, currency: "USD", frozen: false };
    const accts = await this.db
      .select({ balanceCents: schema.walletAccounts.balanceCents, currency: schema.walletAccounts.currency, frozen: schema.walletAccounts.frozen })
      .from(schema.walletAccounts)
      .where(and(eq(schema.walletAccounts.personId, row.subjectPersonId), eq(schema.walletAccounts.orgId, row.orgId)));
    const a = accts.find((x) => x.balanceCents > 0) ?? accts[0];
    return { balanceCents: a && !a.frozen ? a.balanceCents : 0, currency: a?.currency ?? "USD", frozen: a?.frozen ?? false };
  }

  @Post("submissions/:id/pay")
  @ApiOperation({
    summary:
      "Phase 4 (mock) — simulate Stripe charge. Creates an invoice + invoice_items row, marks invoice paid, transitions submission pending_payment → pending_review. Real Stripe integration replaces the mock branch when STRIPE_SECRET_KEY is configured."
  })
  async pay(
    @Param("id") submissionId: string,
    @Body()
    body: {
      email: string;
      mockOutcome?: "succeeded" | "failed" | "offline";
      /** "plan": deposit today, the rest in installments (UC-15). */
      paymentOption?: "full" | "plan";
      /** Spend the registrant's wallet credit in this org first (FR-3.6.2). */
      useWallet?: boolean;
    }
  ) {
    try {
      return await this.payInner(submissionId, body);
    } catch (e) {
      // NestJS's default filter swallows plain Errors as 500 "An
      // unexpected error occurred." Re-raise with the real message so
      // the funnel can surface a useful banner.
      if (e instanceof HttpException) throw e;
      const msg = (e as Error).message ?? "Payment submission failed";
      throw new BadRequestException(msg);
    }
  }

  private async payInner(
    submissionId: string,
    body: {
      email: string;
      mockOutcome?: "succeeded" | "failed" | "offline";
      /** "plan": deposit today, the rest in installments (UC-15). */
      paymentOption?: "full" | "plan";
      useWallet?: boolean;
    }
  ) {
    const row = await this.loadAndAuthorize(submissionId, body.email);
    if (!isRegistrationState(row.status)) {
      throw new BadRequestException(`Invalid submission state: ${row.status}`);
    }
    if (row.status !== "pending_payment") {
      throw new BadRequestException(
        `Cannot pay from state=${row.status}; expected pending_payment. Re-open the funnel from the start so the state advances.`
      );
    }
    // Guardian gate: a minor pays only after the guardian's consent is on
    // file, whatever path put the row in pending_payment (older rows from
    // the resume bypass, a DOB fixed later).
    const payMeta = (row.metadata as Record<string, unknown>) ?? {};
    if (
      isMinorOn((payMeta.dobDate as string | null | undefined) ?? null) &&
      !payMeta.parentConsentConfirmedAt
    ) {
      this.log.log(`refused pay: registration=${row.id} minor without guardian consent`);
      throw new ConflictException({
        error: "guardian_consent_required",
        message:
          "A parent or guardian must confirm this registration before payment. Sign in to the registration again to send them the consent link."
      });
    }
    // Submission gate, before any invoice or state write: the window is
    // open (REG-16) and every required document is signed by the
    // registrant (REG-5). Both 409 with a sentence naming what is missing.
    // Payment processing itself is unchanged (mock by founder decision).
    await this.requirements.assertSubmittable(row);
    const meta = (row.metadata as Record<string, unknown>) ?? {};
    // FR-3.4.1: a registration onto a team that filled up or locked since
    // the player started says so before anything is charged.
    if (row.teamId && row.seasonId && submissionTypeCarriesTeam((meta.submissionType as string) ?? "individual")) {
      const opening = await this.rosterEntry.opening(row.teamId, row.seasonId);
      const refusal = !opening
        ? "This team is not playing this season any more. Contact the league before you pay."
        : opening.refusal?.message ?? null;
      if (refusal) {
        this.log.log(`refused pay: registration=${row.id} team=${row.teamId}: ${refusal}`);
        throw new ConflictException({ error: "team_unavailable", message: refusal });
      }
    }
    const outcome = body.mockOutcome ?? "succeeded";

    // The amount comes from a tier this season offers for the
    // registration's division, re-checked here (REG-18). With prices on
    // offer one must be picked; only a season with no price for the
    // division registers at no charge.
    let amountCents = 0;
    let currency = "USD";
    let tierName = "Registration fee";
    let pickedTier: SeasonTier | null = null;
    const seasonTiers = row.seasonId ? await loadSeasonTiers(this.db, row.seasonId) : [];
    const offeredTiers = tiersForDivision(seasonTiers, row.divisionId ?? null);
    const tierId = (meta.pricingTierId as string | null | undefined) ?? null;
    if (tierId) {
      const tier = offeredTiers.find((t) => t.id === tierId);
      if (!tier) {
        this.log.log(`refused pay: registration=${row.id} tier=${tierId} not offered for division=${row.divisionId}`);
        throw new ConflictException({
          error: "tier_not_offered",
          message: "Your price is not offered for your division. Go back to the price step and pick again."
        });
      }
      amountCents = tier.fullPriceCents;
      currency = tier.currency;
      tierName = tier.name;
      pickedTier = tier;
    } else if (offeredTiers.length > 0) {
      this.log.log(`refused pay: registration=${row.id} no tier picked, ${offeredTiers.length} offered`);
      throw new ConflictException({ error: "tier_required", message: "Pick a price before paying." });
    }

    // The invoice, its line, any payment and the registration state are
    // written in one transaction. The number comes from the org sequence
    // (INV-YYYY-NNNNN, MON-25); the idempotency check runs after the
    // per-org lock, so a double click reuses the first invoice instead of
    // failing on its key.
    const idempotencyKey = `submission:${submissionId}`;
    const findInvoice = (tx: Tx) =>
      tx
        .select({
          id: schema.invoices.id,
          totalCents: schema.invoices.totalCents,
          paidCents: schema.invoices.paidCents
        })
        .from(schema.invoices)
        .where(eq(schema.invoices.idempotencyKey, idempotencyKey))
        .limit(1)
        .then((r) => r[0] ?? null);
    // Every registration invoice has a due date (registration close, at
    // least 14 days out; a plan's last installment at the latest), so an
    // unpaid offline fee goes overdue and the daily sweep reminds the
    // player. Before this the column stayed empty and the sweep, which
    // only reads invoices with a due date, never saw these invoices.
    const [seasonTerms] = row.seasonId
      ? await this.db
          .select({ registrationClosesAt: schema.seasons.registrationClosesAt })
          .from(schema.seasons)
          .where(eq(schema.seasons.id, row.seasonId))
          .limit(1)
      : [];
    const dueAtFor = (planDueInDays?: number[]) =>
      registrationInvoiceDueAt({
        issuedAt: new Date(),
        registrationClosesAt: seasonTerms?.registrationClosesAt ?? null,
        planDueInDays
      });
    const createInvoice = async (tx: Tx, invoiceNumber: string, metadata: Record<string, unknown>, dueAt: Date) => {
      const [inv] = await tx
        .insert(schema.invoices)
        .values({
          orgId: row.orgId,
          invoiceNumber,
          registrationId: submissionId,
          recipientPersonId: row.subjectPersonId,
          recipientEmail: meta.email as string,
          currency,
          subtotalCents: amountCents,
          totalCents: amountCents,
          paidCents: 0,
          status: "sent",
          issuedAt: new Date(),
          dueAt,
          // The price's late fee, added by the overdue sweep (0060).
          lateFeeCents: pickedTier?.lateFeeCents ?? 0,
          idempotencyKey,
          metadata
        })
        .returning({ id: schema.invoices.id });
      await tx.insert(schema.invoiceItems).values({
        invoiceId: inv!.id,
        kind: "registration_fee",
        description: tierName,
        quantity: 1,
        unitAmountCents: amountCents,
        amountCents
      });
      return { id: inv!.id, totalCents: amountCents, paidCents: 0 };
    };

    // Offline: no card charge; the admin marks it paid later. The invoice
    // stays `sent` so Finance tracks who owes what.
    if (outcome === "offline" && body.useWallet) {
      throw new ConflictException({
        error: "wallet_with_offline",
        message: "Credit is used with card payment. Choose full payment or the plan to use your credit."
      });
    }
    if (outcome === "offline") {
      assertValidTransition(row.status, "pending_offline");
      const offlineInvoiceId = await this.db.transaction(async (tx) => {
        const [invoiceNumber] = await reserveInvoiceNumbers(tx, row.orgId, 1);
        const existing = await findInvoice(tx);
        // A seat on a limited price is taken with the first invoice.
        if (!existing && tierId) await takeSeat(tx, tierId, submissionId);
        const invoice =
          existing ??
          (await createInvoice(tx, invoiceNumber!, { paymentMethod: "offline", tierId }, dueAtFor()));
        await tx
          .update(schema.registrations)
          .set({
            status: "pending_offline",
            metadata: mergeMetadata(meta, {
              payment: { outcome: "offline", amountCents, currency, invoiceId: invoice.id },
              ...(!existing && tierId ? { seat: { tierId } } : {})
            }),
            updatedAt: new Date()
          })
          .where(eq(schema.registrations.id, submissionId));
        return invoice.id;
      });
      this.log.log(`pay offline: registration=${submissionId} invoice=${offlineInvoiceId} amount=${amountCents}`);
      return {
        id: submissionId,
        status: "pending_offline" as const,
        invoiceId: offlineInvoiceId,
        amountCents,
        currency,
        mock: true
      };
    }

    // Card: charged through the shared PaymentProcessor seam (mock until
    // Stripe is wired, by founder decision) and recorded as a credit_card
    // payment, so refunds to card and payment reports see it. Before this
    // the invoice was marked paid with no payment row, and a refund to the
    // card was refused ("has no card payment to refund"). A decline rolls
    // the whole transaction back and leaves the registration in
    // pending_payment.
    assertValidTransition(row.status, "pending_review");
    // A payment plan charges the deposit today and schedules the rest
    // (UC-15); the daily installment job charges each one when it falls
    // due. Before this the funnel said "Pay $50 deposit" and the server
    // charged the full price.
    const plan =
      body.paymentOption === "plan" && pickedTier && tierOffersPlan(pickedTier)
        ? planInstallments(amountCents, pickedTier.depositCents, pickedTier.installmentCount, pickedTier.installmentIntervalDays)
        : null;
    if (body.paymentOption === "plan" && !plan) {
      this.log.log(`refused pay: registration=${row.id} plan asked, tier=${tierId} has none`);
      throw new ConflictException({
        error: "plan_not_offered",
        message: "This price has no payment plan. Choose full payment."
      });
    }
    let invoiceId: string;
    try {
      invoiceId = await this.db.transaction(async (tx) => {
        const [invoiceNumber] = await reserveInvoiceNumbers(tx, row.orgId, 1);
        const existing = await findInvoice(tx);
        // A seat on a limited price is taken before any charge.
        if (!existing && tierId) await takeSeat(tx, tierId, submissionId);
        const invoice =
          existing ??
          (await createInvoice(
            tx,
            invoiceNumber!,
            { mockStripe: true, tierId, ...(plan ? { paymentPlan: true } : {}) },
            dueAtFor(plan?.map((p) => p.dueInDays))
          ));
        // A second click finds the first click's invoice. If it is on a
        // plan, the deposit is paid and the job owns the rest; otherwise
        // whatever is still owed (an offline invoice paid by card) is due.
        const scheduled = existing
          ? (await tx
              .select({ id: schema.installmentSchedules.id })
              .from(schema.installmentSchedules)
              .where(eq(schema.installmentSchedules.invoiceId, existing.id))
              .limit(1)).length > 0
          : false;
        const due = existing
          ? scheduled ? 0 : invoice.totalCents - invoice.paidCents
          : plan ? plan[0]!.amountCents : invoice.totalCents;
        let intentId: string | null = null;
        // Wallet credit first (FR-3.6.2): checked and taken under a row
        // lock in this transaction, written to the wallet ledger and as a
        // payment, so a decline below rolls it back with everything else.
        let walletApplied = 0;
        if (body.useWallet && due > 0 && row.subjectPersonId) {
          const [acct] = await tx
            .select()
            .from(schema.walletAccounts)
            .where(
              and(
                eq(schema.walletAccounts.personId, row.subjectPersonId),
                eq(schema.walletAccounts.orgId, row.orgId),
                eq(schema.walletAccounts.currency, currency)
              )
            )
            .for("update")
            .limit(1);
          if (!acct || acct.frozen || acct.balanceCents <= 0) {
            throw new ConflictException({
              error: "no_wallet_credit",
              message: acct?.frozen
                ? "Your credit is on hold. Contact your league, or pay by card."
                : "You have no credit to use in this league. Pay by card."
            });
          }
          walletApplied = Math.min(acct.balanceCents, due);
          await tx
            .update(schema.walletAccounts)
            .set({ balanceCents: acct.balanceCents - walletApplied, updatedAt: new Date() })
            .where(eq(schema.walletAccounts.id, acct.id));
          await tx.insert(schema.walletLedger).values({
            walletId: acct.id,
            entryType: "credit_applied",
            amountCents: -walletApplied,
            relatedInvoiceId: invoice.id,
            reason: "Registration payment",
            metadata: { invoiceId: invoice.id, registrationId: submissionId }
          });
          await tx.insert(schema.payments).values({
            orgId: row.orgId,
            invoiceId: invoice.id,
            method: "manual",
            status: "succeeded",
            amountCents: walletApplied,
            currency,
            externalProviderId: `wallet:${acct.id}:${invoice.id}:${invoice.paidCents}`,
            metadata: { source: "wallet", registrationId: submissionId }
          });
        }
        const cardDue = due - walletApplied;
        if (cardDue > 0) {
          const charge = await this.processor.charge({
            amountCents: cardDue,
            currency,
            description: `Registration ${tierName}`,
            mockOutcome: outcome
          });
          if (charge.status !== "succeeded") {
            throw new CardDeclined(charge.failureMessage ?? "Your card was declined. Update your card and try again.");
          }
          intentId = charge.intentId;
          await tx.insert(schema.payments).values({
            orgId: row.orgId,
            invoiceId: invoice.id,
            method: "credit_card",
            status: "succeeded",
            amountCents: cardDue,
            currency,
            externalProviderId: charge.intentId,
            metadata: { source: "card", registrationId: submissionId }
          });
        }
        if (plan && !existing) {
          const now = Date.now();
          await tx.insert(schema.installmentSchedules).values(
            plan
              .filter((p) => p.installmentNumber > 0 || p.amountCents > 0)
              .map((p) =>
                // The player chose this plan with a card, so the daily job
                // charges each installment when due (autoCharge, 0057).
                p.installmentNumber === 0
                  ? { invoiceId: invoice.id, installmentNumber: 0, dueDate: new Date(now), amountCents: p.amountCents, status: "succeeded", chargedAt: new Date(now), paidAt: new Date(now), stripePaymentIntentId: intentId, metadata: { source: "registration_plan" } }
                  : { invoiceId: invoice.id, installmentNumber: p.installmentNumber, dueDate: new Date(now + p.dueInDays * 86400000), amountCents: p.amountCents, status: "scheduled", metadata: { source: "registration_plan", autoCharge: true } }
              )
          );
        }
        const paidCents = invoice.paidCents + due;
        const settled = paidCents >= invoice.totalCents;
        await tx
          .update(schema.invoices)
          .set({ paidCents, status: settled ? "paid" : paidCents > 0 ? "partial" : "sent", paidAt: settled ? new Date() : null, updatedAt: new Date() })
          .where(eq(schema.invoices.id, invoice.id));
        await tx
          .update(schema.registrations)
          .set({
            status: "pending_review",
            submittedAt: new Date(),
            metadata: mergeMetadata(meta, {
              payment: {
                outcome: "succeeded",
                paidAt: new Date().toISOString(),
                amountCents,
                paidTodayCents: due,
                walletAppliedCents: walletApplied,
                option: plan ? "plan" : "full",
                currency,
                invoiceId: invoice.id,
                mockStripe: true
              },
              ...(!existing && tierId ? { seat: { tierId } } : {})
            }),
            updatedAt: new Date()
          })
          .where(eq(schema.registrations.id, submissionId));
        return invoice.id;
      });
    } catch (e) {
      if (!(e instanceof CardDeclined)) throw e;
      // Spec 7.2: stay in pending_payment and show the decline.
      await this.db
        .update(schema.registrations)
        .set({
          metadata: mergeMetadata(meta, {
            payment: { outcome: "failed", attemptedAt: new Date().toISOString(), reason: e.message }
          }),
          updatedAt: new Date()
        })
        .where(eq(schema.registrations.id, submissionId));
      this.log.log(`pay declined: registration=${submissionId} amount=${amountCents}`);
      return {
        id: submissionId,
        status: "pending_payment" as const,
        invoiceId: null,
        mock: true,
        declineReason: e.message
      };
    }
    this.log.log(`pay card: registration=${submissionId} invoice=${invoiceId} amount=${amountCents} plan=${plan ? plan.length - 1 : 0}`);
    return {
      id: submissionId,
      status: "pending_review" as const,
      invoiceId,
      amountCents,
      currency,
      mock: true
    };
  }

  @Post("submissions/:id/files")
  @ApiOperation({
    summary:
      "Upload the file for one file-upload question of the registration form (FR-3.4.5: ID / proof uploads). Base64 PDF/PNG/JPG/WebP, 3 MB max, type checked by its bytes; stored in the private compliance-documents bucket. Records metadata.files[questionKey] and the answer; admins open it through GET /registration-v2/admin/submissions/:id/files/:key. Only while the registration can still be edited."
  })
  async uploadFormFile(
    @Param("id") id: string,
    @Body() body: { email: string; questionKey: string; fileName?: string; dataBase64: string }
  ) {
    const row = await this.loadAndAuthorize(id, body?.email ?? "");
    if (!EDITABLE_STATES.has(row.status)) throw alreadySubmitted(row);
    const key = typeof body.questionKey === "string" ? body.questionKey.trim() : "";
    if (!/^[A-Za-z0-9_.-]{1,80}$/.test(key)) throw new BadRequestException("questionKey is not a question of this form.");
    // The question must be a file upload on the form version this registration is bound to.
    const [version] = row.formVersionId
      ? await this.db
          .select({ schema: schema.registrationFormVersions.schema })
          .from(schema.registrationFormVersions)
          .where(eq(schema.registrationFormVersions.id, row.formVersionId))
          .limit(1)
      : [];
    const questions = (((version?.schema as Record<string, unknown> | undefined)?.questions ?? []) as Array<{
      key?: string;
      type?: string;
    }>);
    if (!questions.some((q) => q.key === key && q.type === "file_upload")) {
      throw new BadRequestException("This registration form has no file question with that key.");
    }
    const bytes = Buffer.from(typeof body.dataBase64 === "string" ? body.dataBase64 : "", "base64");
    const checked = checkComplianceUpload(bytes);
    if (!checked.ok) throw new BadRequestException(checked.reason);
    const fileName = (typeof body.fileName === "string" && body.fileName.trim() ? body.fileName.trim() : `upload.${complianceFileExtension(checked.contentType)}`)
      .replace(/[\\/\r\n]/g, "_")
      .slice(0, 120);
    let stored: { bucket: string; path: string };
    try {
      stored = await this.supabase.uploadComplianceDocument({
        personId: row.subjectPersonId,
        contentType: checked.contentType,
        extension: complianceFileExtension(checked.contentType),
        bytes
      });
    } catch (err) {
      this.log.error(`registration file store failed registration=${id} key=${key}: ${(err as Error).message}`);
      throw new ServiceUnavailableException(
        "We could not store the file. This is a problem on our side, not your file. Try again in a few minutes."
      );
    }
    const meta = (row.metadata as Record<string, unknown>) ?? {};
    const previous = ((meta.files ?? {}) as Record<string, { bucket: string; path: string }>)[key];
    const value = `registration-file:${fileName}`;
    const entry = {
      bucket: stored.bucket,
      path: stored.path,
      fileName,
      contentType: checked.contentType,
      sizeBytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      uploadedAt: new Date().toISOString()
    };
    const updated = await this.db
      .update(schema.registrations)
      .set({
        metadata: sql`jsonb_set(jsonb_set(${schema.registrations.metadata}, '{files}', coalesce(${schema.registrations.metadata}->'files', '{}'::jsonb) || ${JSON.stringify({ [key]: entry })}::jsonb), '{answers}', coalesce(${schema.registrations.metadata}->'answers', '{}'::jsonb) || ${JSON.stringify({ [key]: value })}::jsonb)`,
        updatedAt: new Date()
      })
      .where(and(eq(schema.registrations.id, id), eq(schema.registrations.status, row.status)))
      .returning({ id: schema.registrations.id });
    if (updated.length !== 1) {
      await this.supabase.removeComplianceDocument(stored.bucket, stored.path).catch(() => {});
      throw new ConflictException("This registration changed while the file was uploading. Reload the page and try again.");
    }
    if (previous?.path && previous.path !== stored.path) {
      await this.supabase.removeComplianceDocument(previous.bucket, previous.path).catch((e) =>
        this.log.warn(`old registration file not removed ${previous.path}: ${(e as Error).message}`)
      );
    }
    this.log.log(`registration file stored registration=${id} key=${key} bytes=${bytes.length} type=${checked.contentType}`);
    return { value, fileName, contentType: checked.contentType, sizeBytes: bytes.length };
  }

  @Post("submissions/:id/cancel")
  @ApiOperation({
    summary:
      "Player-initiated cancellation. Validated by the kernel state machine — terminal/paid states block this and require admin intervention."
  })
  async cancelSubmission(
    @Param("id") id: string,
    @Body() body: { email: string }
  ) {
    const row = await this.loadAndAuthorize(id, body.email);
    if (!isRegistrationState(row.status)) {
      throw new NotFoundException("Submission has invalid state");
    }
    assertValidTransition(row.status, "cancelled");
    await this.db.transaction(async (tx) => {
      await tx
        .update(schema.registrations)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(schema.registrations.id, id));
      await closeRegistrationMoney(tx, row, "Registration cancelled by the player");
    });
    return { id, status: "cancelled" as const };
  }

  // ---------- internals ----------

  /**
   * REG-14: the path must be one this season offers (kernel
   * allowedSubmissionTypes: the season's registration type, plus the
   * free-agent toggle). 422 naming the paths it does take. Runs before
   * any account or row is written.
   */
  private assertPathOffered(
    season: { id: string; config: unknown },
    requested: string | null | undefined
  ): RegistrationSubmissionType {
    const type = requested ?? "individual";
    if (!isRegistrationSubmissionType(type)) {
      throw new UnprocessableEntityException(`Unknown registration path "${type}".`);
    }
    const refusal = submissionTypeRefusal(
      (season.config ?? {}) as Record<string, unknown>,
      type
    );
    if (refusal) {
      this.log.log(`refused path=${type} season=${season.id}`);
      throw new UnprocessableEntityException(refusal);
    }
    return type;
  }

  /**
   * Latest registration for (email, season, path). A restart after a
   * rejected / cancelled registration stores `<key>#<previous id>`, so the
   * chain is followed by prefix (starts_with, not LIKE: emails contain
   * `_`).
   */
  private async findLatestRegistration(baseKey: string) {
    const [row] = await this.db
      .select()
      .from(schema.registrations)
      .where(
        or(
          eq(schema.registrations.idempotencyKey, baseKey),
          sql`starts_with(${schema.registrations.idempotencyKey}, ${`${baseKey}#`})`
        )
      )
      .orderBy(desc(schema.registrations.createdAt))
      .limit(1);
    return row ?? null;
  }

  /** An unpaid registration whose DOB is a minor's and has no guardian consent on file. */
  private needsGuardianConsentNow(
    row: { status: string; metadata: unknown },
    dob: string | null
  ): boolean {
    const meta = (row.metadata as Record<string, unknown>) ?? {};
    return row.status === "pending_payment" && isMinorOn(dob) && !meta.parentConsentConfirmedAt;
  }

  /**
   * REG-8: a not-yet-submitted registration bound to another form's
   * version (rows created before the fix) is moved to the season's
   * active version when the player comes back. Submitted rows keep their
   * binding; that is the version the admin reviews.
   */
  private rebindFormVersion(
    existing: { id: string; status: string; formVersionId: string },
    activeVersionId: string
  ): { formVersionId?: string } {
    if (existing.formVersionId === activeVersionId) return {};
    if (!PRE_SUBMISSION_STATES.has(existing.status)) return {};
    this.log.log(
      `rebind registration=${existing.id} form_version ${existing.formVersionId} -> ${activeVersionId}`
    );
    return { formVersionId: activeVersionId };
  }

  /** The name a funnel registrant types to sign: the account name they entered. */
  private async funnelSignerName(row: {
    metadata: unknown;
    subjectPersonId: string;
  }): Promise<string> {
    const meta = (row.metadata as Record<string, unknown>) ?? {};
    const fromMeta = typeof meta.fullName === "string" ? meta.fullName.trim() : "";
    if (fromMeta) return fromMeta;
    const [p] = await this.db
      .select({ first: schema.persons.legalFirstName, last: schema.persons.legalLastName })
      .from(schema.persons)
      .where(eq(schema.persons.id, row.subjectPersonId))
      .limit(1);
    return p ? `${p.first} ${p.last}`.trim() : "";
  }

  /**
   * Turn a Postgres unique-violation on `registrations_active_uniq`
   * into a `409 Conflict` with the id of the existing active row.
   * Returns null for any other error so the caller can re-throw it.
   * Plan P2-3 / audit §4.1 + §8.2.
   */
  private async handleActiveDuplicate(
    err: unknown,
    subjectPersonId: string,
    seasonId: string
  ): Promise<ConflictException | null> {
    // Drizzle wraps the underlying pg error; the code might be on
    // the original or the wrapper. Check both.
    const e = err as { code?: string; cause?: { code?: string } };
    const code = e.code ?? e.cause?.code;
    if (code !== "23505") return null;
    const [existing] = await this.db
      .select({
        id: schema.registrations.id,
        status: schema.registrations.status
      })
      .from(schema.registrations)
      .where(
        and(
          eq(schema.registrations.subjectPersonId, subjectPersonId),
          eq(schema.registrations.seasonId, seasonId),
          sql`${schema.registrations.status} NOT IN ('rejected','withdrawn','cancelled')`
        )
      )
      .limit(1);
    if (!existing) return null;
    return new ConflictException({
      error: "active_registration_exists",
      message:
        "You already have an active registration for this season. Resume it instead of starting over.",
      registrationId: existing.id,
      status: existing.status
    });
  }

  private async loadAndAuthorize(id: string, email: string) {
    if (!email) throw new NotFoundException("email required");
    const [row] = await this.db
      .select()
      .from(schema.registrations)
      .where(eq(schema.registrations.id, id))
      .limit(1);
    if (!row) throw new NotFoundException("Submission not found");
    const meta = (row.metadata as Record<string, unknown>) ?? {};
    if ((meta.email as string)?.toLowerCase() !== email.trim().toLowerCase()) {
      throw new NotFoundException("Submission not found");
    }
    return row;
  }
}

// ---------- helpers ----------

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] ?? "Pending";
}
function lastName(full: string): string {
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return "Registrant";
  return parts.slice(1).join(" ");
}

function mergeMetadata(
  prev: unknown,
  next: Record<string, unknown>
): Record<string, unknown> {
  const base = (prev as Record<string, unknown>) ?? {};
  return { ...base, ...next };
}

function ageFromDob(dob: string): number | null {
  const d = new Date(dob + "T00:00:00Z");
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age--;
  return age;
}
