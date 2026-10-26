import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException
} from "@nestjs/common";
import { and, desc, eq, inArray, isNull, ne, notInArray, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import {
  FREE_AGENT_OFFER_SOURCE,
  REGISTRATION_ENDED_STATUSES,
  jerseyNumberClash,
  jerseyNumberRefusal,
  assignJerseyNumber,
  requestedJerseyNumber,
  resolveDivisionRules,
  rosterEntryReadiness,
  rosterOpeningRefusal,
  submissionTypeCarriesTeam,
  type RosterEntryReadiness
} from "@sportspulse/kernel";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { NotificationService } from "../../communications/application/notification.service";
import { notifyAudience } from "../../../shared/audience/notify-audience";
import { FreeAgentOffersService } from "./free-agent-offers.service";
import { jerseyNumbersInUse, lockTeamRoster } from "./jersey-numbers";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Exec = Database | Tx;

/** Division entry statuses in which a team plays the season. */
const LIVE_ENTRY_STATUSES = ["applied", "accepted", "confirmed"];
const OPEN_INVITE_STATUSES = ["pending", "extended"];

export interface SeasonRegistrationRef {
  id: string;
  status: string;
  teamId: string | null;
  divisionId: string | null;
  submissionType: string | null;
  readiness: RosterEntryReadiness;
}

export interface TeamOpening {
  team: { id: string; name: string; orgId: string };
  season: { id: string; name: string; rosterLockAt: Date | null };
  division: { id: string; name: string } | null;
  maxRosterSize: number;
  current: number;
  refusal: { reason: "locked" | "full"; message: string } | null;
}

export interface RosterAddInput {
  teamId: string;
  seasonId: string;
  personId: string;
  maxRosterSize: number;
  actorUserId: string | null;
  /**
   * The number asked for. Null: the lowest free number from 1 to 99 is
   * assigned (FR-3.4.2). A number someone wears is refused, unless
   * `jerseyFallback` is set, when the lowest free number is used instead.
   */
  jerseyNumber: number | null;
  jerseyFallback?: boolean;
  positionCode: string | null;
  /** roster_moves.reason: why the player joined (registration approved, invite...). */
  reason?: string | null;
  /** roster_moves.source_event_id: makes a retried add a no-op duplicate refusal. */
  sourceEventId?: string | null;
  /** Extra writes that must commit or roll back with the add. */
  inTx?: (tx: Tx) => Promise<void>;
}

/**
 * The one way onto a team roster (UC-01, UC-03, UC-04, FR-3.4.1).
 *
 * Every path (captain Add player, invite and free-agent offer accept,
 * join-request approval, registration approval with a team) checks the
 * player's season registration with `rosterEntryReadiness` and then adds
 * through `addToRoster`: roster lock, cap (row lock on the active count),
 * duplicate, jersey clash, a `roster_moves` row first and the
 * `team_memberships` projection second, in one transaction.
 *
 * Before this, invites, captain adds, free-agent offers and join
 * requests each put players on the roster with no registration, waivers
 * or payment, and the join-request approval skipped the lock, the cap
 * and the move log.
 */
@Injectable()
export class RosterEntryService {
  private readonly log = new Logger(RosterEntryService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly notify: NotificationService,
    private readonly faOffers: FreeAgentOffersService
  ) {}

  async loadSeason(seasonId: string, exec: Exec = this.db) {
    const [s] = await exec
      .select()
      .from(schema.seasons)
      .where(eq(schema.seasons.id, seasonId))
      .limit(1);
    return s ?? null;
  }

  /** The division the team plays the season in (a live entry), with its roster rules. */
  async teamDivision(teamId: string, seasonId: string, exec: Exec = this.db) {
    const [row] = await exec
      .select({
        id: schema.divisions.id,
        name: schema.divisions.name,
        tier: schema.divisions.tier,
        ruleSetOverrides: schema.divisions.ruleSetOverrides,
        entryStatus: schema.divisionTeamEntries.entryStatus
      })
      .from(schema.divisionTeamEntries)
      .innerJoin(
        schema.divisions,
        eq(schema.divisions.id, schema.divisionTeamEntries.divisionId)
      )
      .where(
        and(
          eq(schema.divisionTeamEntries.teamId, teamId),
          eq(schema.divisions.seasonId, seasonId)
        )
      )
      .limit(1);
    return row ?? null;
  }

  async activeCount(teamId: string, seasonId: string, exec: Exec = this.db): Promise<number> {
    const [row] = await exec
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(schema.teamMemberships)
      .where(
        and(
          eq(schema.teamMemberships.teamId, teamId),
          eq(schema.teamMemberships.seasonId, seasonId),
          eq(schema.teamMemberships.currentStatus, "active")
        )
      );
    return row?.count ?? 0;
  }

  /**
   * Can this team take another player for the season right now? Used by
   * the funnel before payment and by every roster add. Null when the
   * team does not play the season.
   */
  async opening(teamId: string, seasonId: string): Promise<TeamOpening | null> {
    const [team] = await this.db
      .select({ id: schema.teams.id, name: schema.teams.name, orgId: schema.teams.orgId })
      .from(schema.teams)
      .where(and(eq(schema.teams.id, teamId), isNull(schema.teams.deletedAt)))
      .limit(1);
    const season = await this.loadSeason(seasonId);
    if (!team || !season) return null;
    const division = await this.teamDivision(teamId, seasonId);
    if (!division || !LIVE_ENTRY_STATUSES.includes(division.entryStatus)) return null;
    const rules = resolveDivisionRules(
      (division.ruleSetOverrides as Record<string, unknown>) ?? null
    );
    const current = await this.activeCount(teamId, seasonId);
    return {
      team,
      season: { id: season.id, name: season.name, rosterLockAt: season.rosterLockAt },
      division: { id: division.id, name: division.name },
      maxRosterSize: rules.maxRosterSize,
      current,
      refusal: rosterOpeningRefusal({
        teamName: team.name,
        seasonName: season.name,
        current,
        maxRosterSize: rules.maxRosterSize,
        rosterLockAt: season.rosterLockAt
      })
    };
  }

  /**
   * The player's registration that holds their place for the season
   * (latest one not rejected / cancelled / withdrawn), with its gate.
   */
  async seasonRegistration(
    personId: string,
    seasonId: string,
    exec: Exec = this.db
  ): Promise<SeasonRegistrationRef | null> {
    const [row] = await exec
      .select({
        id: schema.registrations.id,
        status: schema.registrations.status,
        teamId: schema.registrations.teamId,
        divisionId: schema.registrations.divisionId,
        metadata: schema.registrations.metadata
      })
      .from(schema.registrations)
      .where(
        and(
          eq(schema.registrations.subjectPersonId, personId),
          eq(schema.registrations.seasonId, seasonId),
          notInArray(schema.registrations.status, [...REGISTRATION_ENDED_STATUSES])
        )
      )
      .orderBy(desc(schema.registrations.createdAt))
      .limit(1);
    if (!row) return null;
    const meta = (row.metadata as Record<string, unknown> | null) ?? {};
    return {
      id: row.id,
      status: row.status,
      teamId: row.teamId,
      divisionId: row.divisionId,
      submissionType: (meta.submissionType as string | undefined) ?? null,
      readiness: rosterEntryReadiness(row.status)
    };
  }

  /**
   * Record the team a submitted (not yet approved) registration joins on
   * approval. Refuses a registration already bound to another team, and a
   * team registration (it creates its own team). Idempotent for the same
   * team.
   */
  async recordTeamOnRegistration(
    reg: SeasonRegistrationRef,
    teamId: string,
    opts: { inviteId?: string | null; source: string; exec?: Exec }
  ): Promise<void> {
    if (!submissionTypeCarriesTeam(reg.submissionType ?? "individual")) {
      throw new ConflictException({
        error: "team_registration",
        message:
          "This account registered a team for the season, so it cannot join another team's roster through a player registration."
      });
    }
    if (reg.teamId && reg.teamId !== teamId) {
      const [other] = await (opts.exec ?? this.db)
        .select({ name: schema.teams.name })
        .from(schema.teams)
        .where(eq(schema.teams.id, reg.teamId))
        .limit(1);
      throw new ConflictException({
        error: "registration_has_team",
        message: `This registration is already for ${other?.name ?? "another team"}. Ask the league to move it before joining a different team.`
      });
    }
    const patch: Record<string, unknown> = {
      joinTeam: {
        teamId,
        source: opts.source,
        inviteId: opts.inviteId ?? null,
        recordedAt: new Date().toISOString()
      }
    };
    const updated = await (opts.exec ?? this.db)
      .update(schema.registrations)
      .set({
        teamId,
        metadata: sql`${schema.registrations.metadata} || ${JSON.stringify(patch)}::jsonb`,
        updatedAt: new Date()
      })
      .where(eq(schema.registrations.id, reg.id))
      .returning({ id: schema.registrations.id });
    if (updated.length !== 1) {
      throw new Error(`recordTeamOnRegistration touched ${updated.length} rows registration=${reg.id}`);
    }
    this.log.log(
      `registration=${reg.id} status=${reg.status} joins team=${teamId} on approval (source=${opts.source} invite=${opts.inviteId ?? "-"})`
    );
  }

  assertUnlocked(season: { rosterLockAt: Date | null }) {
    if (season.rosterLockAt && new Date() > season.rosterLockAt) {
      throw new ConflictException({
        error: "Roster locked",
        message: "Roster is locked for this season.",
        rosterLockAt: season.rosterLockAt.toISOString()
      });
    }
  }

  /**
   * One active membership per player per team across the team's live
   * seasons (CAP-24). The per-season duplicate guard inside addToRoster
   * cannot see a membership in another season of the same team.
   */
  async assertNotActiveInOtherSeason(
    teamId: string,
    personId: string,
    seasonId: string
  ): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    const [elsewhere] = await this.db
      .select({ seasonName: schema.seasons.name })
      .from(schema.teamMemberships)
      .innerJoin(
        schema.seasons,
        eq(schema.seasons.id, schema.teamMemberships.seasonId)
      )
      .where(
        and(
          eq(schema.teamMemberships.teamId, teamId),
          eq(schema.teamMemberships.personId, personId),
          eq(schema.teamMemberships.currentStatus, "active"),
          ne(schema.teamMemberships.seasonId, seasonId),
          sql`${schema.seasons.status} NOT IN ('completed','archived')`,
          sql`${schema.seasons.endDate} >= ${today}`
        )
      )
      .limit(1);
    if (elsewhere) {
      throw new ConflictException({
        error: "Already on roster",
        message: `This player is already on this team's active roster for ${elsewhere.seasonName}. Switch the season to ${elsewhere.seasonName} to manage them, or drop them there first.`,
        seasonName: elsewhere.seasonName
      });
    }
  }

  /** Refuse a jersey number another active player on the team wears this season. */
  async assertJerseyFree(
    exec: Exec,
    input: { teamId: string; seasonId: string; jerseyNumber: number | null; exceptPersonId?: string }
  ): Promise<void> {
    if (input.jerseyNumber === null) return;
    const bad = jerseyNumberRefusal(input.jerseyNumber);
    if (bad) throw new ConflictException({ error: "jersey_number_invalid", message: bad });
    const [holder] = await exec
      .select({
        personId: schema.teamMemberships.personId,
        first: schema.persons.legalFirstName,
        last: schema.persons.legalLastName,
        preferred: schema.persons.preferredName
      })
      .from(schema.teamMemberships)
      .innerJoin(schema.persons, eq(schema.persons.id, schema.teamMemberships.personId))
      .where(
        and(
          eq(schema.teamMemberships.teamId, input.teamId),
          eq(schema.teamMemberships.seasonId, input.seasonId),
          eq(schema.teamMemberships.jerseyNumber, input.jerseyNumber),
          isNull(schema.teamMemberships.effectiveTo),
          input.exceptPersonId ? ne(schema.teamMemberships.personId, input.exceptPersonId) : undefined
        )
      )
      .limit(1);
    if (holder) {
      const name =
        (holder.preferred && holder.preferred.trim()) ||
        [holder.first, holder.last].filter(Boolean).join(" ").trim() ||
        null;
      throw new ConflictException({
        error: "jersey_number_taken",
        message: jerseyNumberClash(input.jerseyNumber, name)
      });
    }
  }

  /**
   * Add a player to the active roster. Locks the active count for the
   * team and season so two adds at cap-1 resolve to one success and one
   * 409, then writes the move and the membership.
   */
  async addToRoster(input: RosterAddInput) {
    const { teamId, seasonId, personId } = input;
    const result = await this.db.transaction(async (tx) => {
      // One roster change per team and season at a time, so the cap count
      // and the free numbers read below cannot go stale (also on an empty
      // roster, which has no membership row to lock).
      await lockTeamRoster(tx, teamId, seasonId);
      await tx.execute(sql`
        SELECT id FROM team_memberships
        WHERE team_id = ${teamId}
          AND season_id = ${seasonId}
          AND current_status = 'active'
        FOR UPDATE
      `);
      const current = await this.activeCount(teamId, seasonId, tx);
      // A player already on the roster takes no new slot, so that answer
      // comes first; then the cap (counted under the lock above).
      const [existing] = await tx
        .select({ id: schema.teamMemberships.id })
        .from(schema.teamMemberships)
        .where(
          and(
            eq(schema.teamMemberships.teamId, teamId),
            eq(schema.teamMemberships.seasonId, seasonId),
            eq(schema.teamMemberships.personId, personId),
            eq(schema.teamMemberships.currentStatus, "active")
          )
        )
        .limit(1);
      if (existing) {
        throw new ConflictException({
          error: "Already on roster",
          message: "This player is already on the active roster."
        });
      }
      if (current >= input.maxRosterSize) {
        throw new ConflictException({
          error: "Roster is full",
          message: `The roster is full: ${current} of ${input.maxRosterSize} players. Drop a player before adding another.`,
          maxRosterSize: input.maxRosterSize,
          currentCount: current
        });
      }
      if (input.jerseyNumber !== null && !input.jerseyFallback) {
        await this.assertJerseyFree(tx, { teamId, seasonId, jerseyNumber: input.jerseyNumber });
      }
      const jerseyNumber = assignJerseyNumber(input.jerseyNumber, await jerseyNumbersInUse(tx, teamId, seasonId));

      const [move] = await tx
        .insert(schema.rosterMoves)
        .values({
          teamId,
          personId,
          seasonId,
          moveType: "add",
          membershipType: "primary",
          effectiveAt: new Date(),
          jerseyNumber,
          positionCode: input.positionCode,
          reason: input.reason ?? null,
          sourceEventId: input.sourceEventId ?? null,
          createdByUserId: input.actorUserId
        })
        .returning();
      const [membership] = await tx
        .insert(schema.teamMemberships)
        .values({
          teamId,
          personId,
          seasonId,
          membershipType: "primary",
          effectiveFrom: new Date(),
          jerseyNumber,
          positionCode: input.positionCode,
          currentStatus: "active",
          lastMoveId: move!.id
        })
        .returning();
      if (input.inTx) await input.inTx(tx);
      return { move: move!, membership: membership! };
    });
    this.log.log(
      `roster add team=${teamId} season=${seasonId} person=${personId} move=${result.move.id} membership=${result.membership.id} jersey=${result.membership.jerseyNumber ?? "none"} asked=${input.jerseyNumber ?? "-"} reason=${input.reason ?? "-"}`
    );
    return result;
  }

  /**
   * Registration approved with a team on it (FR-3.4.1, UC-04 after the
   * player registered from an invite): put the player on that roster and
   * settle the invite. Lock and cap still apply: when the team filled up
   * or locked in the meantime the approval stands, the player is not
   * rostered, and the registration records why (`rosterPlacement`) for the
   * league to resolve. Idempotent: an existing active membership counts as
   * placed.
   */
  async rosterFromApprovedRegistration(
    row: typeof schema.registrations.$inferSelect,
    actorUserId: string | null
  ): Promise<{ status: "rostered" | "already" | "not_placed" | "skipped"; reason?: string }> {
    const meta = (row.metadata as Record<string, unknown>) ?? {};
    const submissionType = (meta.submissionType as string | undefined) ?? "individual";
    if (!row.teamId || !row.seasonId || !row.subjectPersonId) return { status: "skipped" };
    if (!submissionTypeCarriesTeam(submissionType)) return { status: "skipped" };
    const teamId = row.teamId;
    const seasonId = row.seasonId;
    const personId = row.subjectPersonId;
    const join = (meta.joinTeam as { inviteId?: string | null } | undefined) ?? {};
    const answers = (meta.answers as Record<string, unknown> | undefined) ?? {};
    // The number the captain set on the invite wins over the one the
    // player typed on the form.
    let inviteJersey: unknown = null;
    let invite: { id: string; teamId: string; metadata: unknown } | null = null;
    if (join.inviteId) {
      const [inv] = await this.db
        .select({ id: schema.teamInvites.id, teamId: schema.teamInvites.teamId, metadata: schema.teamInvites.metadata })
        .from(schema.teamInvites)
        .where(eq(schema.teamInvites.id, join.inviteId))
        .limit(1);
      invite = inv && inv.teamId === teamId ? inv : null;
      inviteJersey = ((inv?.metadata as Record<string, unknown> | null) ?? {}).jerseyNumber ?? null;
    }
    const wanted = requestedJerseyNumber(inviteJersey ?? answers.jersey_number);
    const positions = Array.isArray(answers.positions) ? (answers.positions as string[]) : [];

    const record = async (placement: Record<string, unknown>) => {
      await this.db
        .update(schema.registrations)
        .set({
          metadata: sql`${schema.registrations.metadata} || ${JSON.stringify({
            rosterPlacement: { ...placement, at: new Date().toISOString() }
          })}::jsonb`,
          updatedAt: new Date()
        })
        .where(eq(schema.registrations.id, row.id));
    };

    const [already] = await this.db
      .select({ id: schema.teamMemberships.id })
      .from(schema.teamMemberships)
      .where(
        and(
          eq(schema.teamMemberships.teamId, teamId),
          eq(schema.teamMemberships.seasonId, seasonId),
          eq(schema.teamMemberships.personId, personId),
          eq(schema.teamMemberships.currentStatus, "active")
        )
      )
      .limit(1);
    if (already) {
      await record({ status: "rostered", teamId, membershipId: already.id });
      return { status: "already" };
    }

    const opening = await this.opening(teamId, seasonId);
    if (!opening) {
      const reason = "The team does not play this season any more.";
      await record({ status: "not_placed", teamId, reason });
      this.log.warn(`registration=${row.id} approved, not rostered: team ${teamId} not live in season ${seasonId}`);
      return { status: "not_placed", reason };
    }
    if (opening.refusal) {
      await record({ status: "not_placed", teamId, reason: opening.refusal.message });
      this.log.warn(`registration=${row.id} approved, not rostered on ${teamId}: ${opening.refusal.reason}`);
      void this.notifyCaptainNotPlaced(opening, personId, opening.refusal.message);
      return { status: "not_placed", reason: opening.refusal.message };
    }
    // A number someone already wears is never a reason to refuse: the
    // player gets the lowest free number instead (FR-3.4.2), picked under
    // the team lock inside the add.
    try {
      const res = await this.addToRoster({
        teamId,
        seasonId,
        personId,
        maxRosterSize: opening.maxRosterSize,
        actorUserId,
        jerseyNumber: wanted,
        jerseyFallback: true,
        positionCode: positions[0] ?? null,
        reason: "Registration approved",
        sourceEventId: `registration-${row.id}`,
        inTx: async (tx) => {
          if (join.inviteId) {
            await tx
              .update(schema.teamInvites)
              .set({
                status: "accepted",
                acceptedByUserId: row.submittedByUserId,
                acceptedAt: new Date(),
                updatedAt: new Date()
              })
              .where(
                and(
                  eq(schema.teamInvites.id, join.inviteId),
                  inArray(schema.teamInvites.status, OPEN_INVITE_STATUSES)
                )
              );
          }
          // A free-agent offer the player registered from: the pool entry
          // is placed and other teams' offers withdrawn, as on accept (CAP-9).
          // Only when the entry is this player's and still in the pool, so the
          // check cannot fail inside the transaction.
          const meta = (invite?.metadata as Record<string, unknown> | null) ?? {};
          if (invite && meta.source === FREE_AGENT_OFFER_SOURCE) {
            const [entry] = await tx
              .select({ status: schema.freeAgentPoolEntries.status, person: schema.freeAgentPoolEntries.playerPersonId })
              .from(schema.freeAgentPoolEntries)
              .where(eq(schema.freeAgentPoolEntries.id, String(meta.freeAgentPoolEntryId ?? "")))
              .limit(1);
            if (entry && entry.person === personId && entry.status === "active") {
              await this.faOffers.placeOnAccept(tx, invite, personId);
            }
          }
        }
      });
      await record({ status: "rostered", teamId, membershipId: res.membership.id });
      void this.notifyJoined(opening, personId);
      return { status: "rostered" };
    } catch (e) {
      const reason =
        e instanceof ConflictException
          ? String((e.getResponse() as { message?: string }).message ?? e.message)
          : (e as Error).message;
      await record({ status: "not_placed", teamId, reason });
      this.log.error(`registration=${row.id} approved, roster add failed: ${reason}`);
      return { status: "not_placed", reason };
    }
  }

  async personName(personId: string): Promise<string> {
    const [p] = await this.db
      .select({
        first: schema.persons.legalFirstName,
        last: schema.persons.legalLastName,
        preferred: schema.persons.preferredName
      })
      .from(schema.persons)
      .where(eq(schema.persons.id, personId))
      .limit(1);
    return (
      (p?.preferred && p.preferred.trim()) ||
      [p?.first, p?.last].filter(Boolean).join(" ").trim() ||
      "A player"
    );
  }

  private async notifyJoined(opening: TeamOpening, personId: string) {
    try {
      const playerName = await this.personName(personId);
      const payload = {
        personName: playerName,
        playerName,
        teamName: opening.team.name,
        seasonName: opening.season.name,
        jerseyClause: ""
      };
      void this.notify.queue({
        orgId: opening.team.orgId,
        templateCode: "roster.added",
        idempotencyKey: `roster-added-${opening.team.id}-${opening.season.id}-${personId}`,
        recipientPersonId: personId,
        payload
      });
      await notifyAudience(this.db, this.notify, {
        orgId: opening.team.orgId,
        target: { teamIds: [opening.team.id] },
        audiences: ["captains"],
        templateCode: "roster.added.captain",
        key: `roster-added-captain-${opening.team.id}-${opening.season.id}-${personId}`,
        excludePersonIds: [personId],
        payload
      });
    } catch (e) {
      this.log.error(`roster joined notification failed: ${(e as Error).message}`);
    }
  }

  private async notifyCaptainNotPlaced(opening: TeamOpening, personId: string, reason: string) {
    const playerName = await this.personName(personId);
    await notifyAudience(this.db, this.notify, {
      orgId: opening.team.orgId,
      target: { teamIds: [opening.team.id] },
      audiences: ["captains"],
      templateCode: "roster.not_placed.captain",
      key: `roster-not-placed-${opening.team.id}-${opening.season.id}-${personId}`,
      excludePersonIds: [personId],
      payload: { playerName, teamName: opening.team.name, seasonName: opening.season.name, reason }
    });
  }

  /** NotFound when the team does not play the season. */
  async requireOpening(teamId: string, seasonId: string): Promise<TeamOpening> {
    const o = await this.opening(teamId, seasonId);
    if (!o) throw new NotFoundException("This team is not playing that season.");
    return o;
  }
}
