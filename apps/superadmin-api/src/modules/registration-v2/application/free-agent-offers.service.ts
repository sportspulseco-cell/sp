import { randomBytes } from "node:crypto";
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import {
  FREE_AGENT_OFFER_SOURCE,
  freeAgentOfferExpiry,
  freeAgentOfferStatus,
  type FreeAgentOfferStatus
} from "@sportspulse/kernel";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { playerWebUrl } from "../../../shared/app-urls";
import { NotificationService } from "../../communications/application/notification.service";
import {
  formatInviteExpiry,
  teamInviteUrl
} from "../../communications/domain/templates/team-invite-payload";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Exec = Database | Tx;

/** Division entry statuses in which a team plays the season. */
const LIVE_ENTRY_STATUSES = ["applied", "accepted", "confirmed"];
const OPEN_INVITE_STATUSES = ["pending", "extended"];

export interface FreeAgentOfferView {
  /** The team_invites row. */
  id: string;
  entryId: string;
  teamId: string;
  teamName: string;
  seasonId: string;
  seasonName: string | null;
  playerPersonId: string | null;
  playerName: string | null;
  status: FreeAgentOfferStatus;
  offeredBy: "captain" | "admin";
  createdAt: string;
  expiresAt: string | null;
  decidedAt: string | null;
}

export interface LiveTeam {
  teamId: string;
  teamName: string;
  orgId: string;
  divisionId: string;
  divisionName: string;
  entryStatus: string;
}

/** SQL: the invite is a free-agent offer for this pool entry. */
function offerForEntry(entryId: string) {
  return sql`${schema.teamInvites.metadata}->>'source' = ${FREE_AGENT_OFFER_SOURCE} AND ${schema.teamInvites.metadata}->>'freeAgentPoolEntryId' = ${entryId}`;
}

function personName(p: {
  first: string | null;
  last: string | null;
  preferred: string | null;
}): string | null {
  return (
    (p.preferred && p.preferred.trim()) ||
    [p.first, p.last].filter(Boolean).join(" ").trim() ||
    null
  );
}

/**
 * Free-agent offers (UC-03, CAP-9). Claiming a free agent used to put the
 * player straight on the roster and tell nobody. Now:
 *
 *   captain or admin offers  -> personal team_invites row (source
 *                               free_agent_pool), player notified (email +
 *                               in-app), pool entry stays `active`
 *   player accepts           -> the captain roster add path (lock, cap,
 *                               duplicate and other-season checks) adds the
 *                               membership, and `placeOnAccept` marks the
 *                               entry `placed` and withdraws the other
 *                               teams' open offers, in that one transaction
 *   player declines          -> invite `declined`, entry stays in the pool,
 *                               the offering side is notified
 *
 * The invite row carries the offer state, so no new pool status (and no
 * migration) is needed; several teams may pitch the same player.
 */
@Injectable()
export class FreeAgentOffersService {
  private readonly log = new Logger(FreeAgentOffersService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly notify: NotificationService,
    private readonly config: ConfigService
  ) {}

  /** Teams that play the season (a live division entry). The only teams that can offer a spot in it. */
  async liveTeamsInSeason(
    seasonId: string,
    opts: { teamId?: string; exec?: Exec } = {}
  ): Promise<LiveTeam[]> {
    const exec = opts.exec ?? this.db;
    const rows = await exec
      .select({
        teamId: schema.teams.id,
        teamName: schema.teams.name,
        orgId: schema.teams.orgId,
        divisionId: schema.divisions.id,
        divisionName: schema.divisions.name,
        entryStatus: schema.divisionTeamEntries.entryStatus
      })
      .from(schema.divisionTeamEntries)
      .innerJoin(
        schema.divisions,
        eq(schema.divisions.id, schema.divisionTeamEntries.divisionId)
      )
      .innerJoin(schema.teams, eq(schema.teams.id, schema.divisionTeamEntries.teamId))
      .where(
        and(
          eq(schema.divisions.seasonId, seasonId),
          inArray(schema.divisionTeamEntries.entryStatus, LIVE_ENTRY_STATUSES),
          isNull(schema.teams.deletedAt),
          opts.teamId ? eq(schema.teams.id, opts.teamId) : undefined
        )
      );
    const seen = new Set<string>();
    return rows
      .filter((r) => (seen.has(r.teamId) ? false : (seen.add(r.teamId), true)))
      .sort((a, b) => a.teamName.localeCompare(b.teamName));
  }

  /**
   * Offer a free agent a spot. One transaction: lock the pool entry,
   * check it is still in the pool, the team plays the entry's season, the
   * roster is not locked, the player has an account email and is not on
   * this team already; reuse an open offer from the same team, else insert
   * the invite. Notifications go out after commit.
   */
  async createOffer(input: {
    entryId: string;
    teamId: string;
    actorUserId: string;
    offeredBy: "captain" | "admin";
  }): Promise<{ offer: FreeAgentOfferView; created: boolean }> {
    const now = new Date();
    const result = await this.db.transaction(async (tx) => {
      const [entry] = await tx
        .select()
        .from(schema.freeAgentPoolEntries)
        .where(eq(schema.freeAgentPoolEntries.id, input.entryId))
        .limit(1)
        .for("update");
      if (!entry) throw new NotFoundException("Free agent not found");
      if (entry.status !== "active") {
        throw new ConflictException({
          error: "not_in_pool",
          message:
            entry.status === "placed"
              ? "This player already joined a team for this season."
              : "This player left the free-agent pool for this season."
        });
      }
      const [season] = await tx
        .select({
          id: schema.seasons.id,
          name: schema.seasons.name,
          rosterLockAt: schema.seasons.rosterLockAt
        })
        .from(schema.seasons)
        .where(eq(schema.seasons.id, entry.seasonId))
        .limit(1);
      if (!season) throw new NotFoundException("Season not found");
      const [team] = await tx
        .select({ id: schema.teams.id, name: schema.teams.name, orgId: schema.teams.orgId })
        .from(schema.teams)
        .where(and(eq(schema.teams.id, input.teamId), isNull(schema.teams.deletedAt)))
        .limit(1);
      if (!team) throw new NotFoundException("Team not found");
      const live = await this.liveTeamsInSeason(entry.seasonId, { teamId: team.id, exec: tx });
      if (live.length === 0) {
        throw new ConflictException({
          error: "team_not_in_season",
          message: `${team.name} is not entered in ${season.name}. A team can only offer a spot in a season it plays in; apply to a division for ${season.name} first.`
        });
      }
      if (season.rosterLockAt && now > season.rosterLockAt) {
        throw new ConflictException({
          error: "roster_locked",
          message: `Rosters for ${season.name} are locked, so no new players can join.`
        });
      }
      const [player] = await tx
        .select({
          first: schema.persons.legalFirstName,
          last: schema.persons.legalLastName,
          preferred: schema.persons.preferredName,
          email: schema.profiles.email
        })
        .from(schema.persons)
        .leftJoin(schema.profiles, eq(schema.profiles.id, schema.persons.userId))
        .where(eq(schema.persons.id, entry.playerPersonId))
        .limit(1);
      const email = player?.email?.trim().toLowerCase() ?? "";
      if (!email) {
        throw new ConflictException({
          error: "player_has_no_account",
          message:
            "This player has no account email, so they cannot accept an offer. Ask them to finish their player profile."
        });
      }
      const [onRoster] = await tx
        .select({ id: schema.teamMemberships.id })
        .from(schema.teamMemberships)
        .where(
          and(
            eq(schema.teamMemberships.teamId, team.id),
            eq(schema.teamMemberships.personId, entry.playerPersonId),
            eq(schema.teamMemberships.seasonId, entry.seasonId),
            eq(schema.teamMemberships.currentStatus, "active")
          )
        )
        .limit(1);
      if (onRoster) {
        throw new ConflictException({
          error: "already_on_roster",
          message: `This player is already on the ${team.name} roster for ${season.name}.`
        });
      }
      const [open] = await tx
        .select({
          id: schema.teamInvites.id,
          status: schema.teamInvites.status,
          expiresAt: schema.teamInvites.expiresAt
        })
        .from(schema.teamInvites)
        .where(
          and(
            eq(schema.teamInvites.teamId, team.id),
            inArray(schema.teamInvites.status, OPEN_INVITE_STATUSES),
            offerForEntry(entry.id)
          )
        )
        .orderBy(desc(schema.teamInvites.createdAt))
        .limit(1);
      if (open && freeAgentOfferStatus(open.status, open.expiresAt, now) === "pending") {
        return { inviteId: open.id, created: false as const };
      }

      const token = randomBytes(32).toString("base64url");
      const expiresAt = freeAgentOfferExpiry(now, season.rosterLockAt);
      const [inv] = await tx
        .insert(schema.teamInvites)
        .values({
          teamId: team.id,
          seasonId: entry.seasonId,
          issuedByUserId: input.actorUserId,
          inviteeEmail: email,
          token,
          kind: "personal",
          status: "pending",
          expiresAt,
          lastSentAt: now,
          sendCount: 1,
          metadata: {
            source: FREE_AGENT_OFFER_SOURCE,
            freeAgentPoolEntryId: entry.id,
            playerPersonId: entry.playerPersonId,
            offeredBy: input.offeredBy
          }
        })
        .returning({ id: schema.teamInvites.id });
      if (!inv) throw new Error(`offer insert returned no row entry=${entry.id} team=${team.id}`);
      return {
        inviteId: inv.id,
        created: true as const,
        mail: {
          orgId: team.orgId,
          token,
          expiresAt,
          email,
          personId: entry.playerPersonId,
          teamName: team.name,
          seasonId: season.id,
          seasonName: season.name
        }
      };
    });

    const offer = await this.getOffer(result.inviteId);
    if (!offer) throw new Error(`offer readback empty invite=${result.inviteId}`);
    if (result.created) {
      this.log.log(
        `free-agent offer created invite=${offer.id} entry=${offer.entryId} team=${offer.teamId} by=${input.offeredBy}:${input.actorUserId}`
      );
      const m = result.mail;
      const expiresOn = formatInviteExpiry(m.expiresAt);
      const payload = {
        teamName: m.teamName,
        seasonName: m.seasonName,
        seasonId: m.seasonId,
        offerUrl: teamInviteUrl(playerWebUrl(this.config), m.token),
        expiryClause: `This offer expires on ${expiresOn}.`
      };
      void this.notify.queue({
        orgId: m.orgId,
        templateCode: "FREE_AGENT_OFFER",
        channel: "email",
        idempotencyKey: `fa-offer-${offer.id}-email`,
        recipientEmail: m.email,
        recipientPersonId: m.personId,
        payload
      });
      void this.notify.queue({
        orgId: m.orgId,
        templateCode: "FREE_AGENT_OFFER",
        channel: "in_app",
        idempotencyKey: `fa-offer-${offer.id}-inapp`,
        recipientPersonId: m.personId,
        payload
      });
    } else {
      this.log.log(`free-agent offer already open invite=${offer.id} entry=${offer.entryId} team=${offer.teamId}`);
    }
    return { offer, created: result.created };
  }

  /** One offer by invite id, or null when the invite is not a free-agent offer. */
  async getOffer(inviteId: string): Promise<FreeAgentOfferView | null> {
    const rows = await this.offerRows(sql`${schema.teamInvites.id} = ${inviteId}`);
    return rows[0] ?? null;
  }

  /** A team's offers, newest first (the captain's "Your offers" list). */
  async listTeamOffers(teamId: string): Promise<FreeAgentOfferView[]> {
    return this.offerRows(sql`${schema.teamInvites.teamId} = ${teamId}`);
  }

  /** Open (pending, unexpired) offers per pool entry, for the pool lists. */
  async openOffersByEntry(entryIds: string[]): Promise<Map<string, FreeAgentOfferView[]>> {
    const out = new Map<string, FreeAgentOfferView[]>();
    if (entryIds.length === 0) return out;
    const rows = await this.offerRows(
      sql`${schema.teamInvites.status} IN ('pending','extended') AND ${schema.teamInvites.metadata}->>'freeAgentPoolEntryId' IN (${sql.join(
        entryIds.map((id) => sql`${id}`),
        sql`, `
      )})`
    );
    for (const r of rows) {
      if (r.status !== "pending") continue;
      const list = out.get(r.entryId) ?? [];
      list.push(r);
      out.set(r.entryId, list);
    }
    return out;
  }

  private async offerRows(where: ReturnType<typeof sql>): Promise<FreeAgentOfferView[]> {
    const now = new Date();
    const rows = await this.db
      .select({
        id: schema.teamInvites.id,
        teamId: schema.teamInvites.teamId,
        teamName: schema.teams.name,
        seasonId: schema.teamInvites.seasonId,
        seasonName: schema.seasons.name,
        status: schema.teamInvites.status,
        expiresAt: schema.teamInvites.expiresAt,
        acceptedAt: schema.teamInvites.acceptedAt,
        revokedAt: schema.teamInvites.revokedAt,
        updatedAt: schema.teamInvites.updatedAt,
        createdAt: schema.teamInvites.createdAt,
        metadata: schema.teamInvites.metadata,
        first: schema.persons.legalFirstName,
        last: schema.persons.legalLastName,
        preferred: schema.persons.preferredName
      })
      .from(schema.teamInvites)
      .innerJoin(schema.teams, eq(schema.teams.id, schema.teamInvites.teamId))
      .leftJoin(schema.seasons, eq(schema.seasons.id, schema.teamInvites.seasonId))
      .leftJoin(
        schema.persons,
        sql`${schema.persons.id}::text = ${schema.teamInvites.metadata}->>'playerPersonId'`
      )
      .where(
        and(sql`${schema.teamInvites.metadata}->>'source' = ${FREE_AGENT_OFFER_SOURCE}`, where)
      )
      .orderBy(desc(schema.teamInvites.createdAt));
    return rows.map((r) => {
      const meta = (r.metadata as Record<string, unknown>) ?? {};
      const status = freeAgentOfferStatus(r.status, r.expiresAt, now);
      return {
        id: r.id,
        entryId: String(meta.freeAgentPoolEntryId ?? ""),
        teamId: r.teamId,
        teamName: r.teamName,
        seasonId: r.seasonId,
        seasonName: r.seasonName ?? null,
        playerPersonId: (meta.playerPersonId as string | undefined) ?? null,
        playerName: personName(r),
        status,
        offeredBy: meta.offeredBy === "admin" ? "admin" : "captain",
        createdAt: r.createdAt.toISOString(),
        expiresAt: r.expiresAt?.toISOString() ?? null,
        decidedAt:
          status === "accepted"
            ? (r.acceptedAt ?? r.updatedAt).toISOString()
            : status === "declined" || status === "revoked"
              ? (r.revokedAt ?? r.updatedAt).toISOString()
              : null
      };
    });
  }

  /**
   * Inside the accept transaction (CaptainRosterController.acceptInvite),
   * after the roster add: a free-agent offer marks the pool entry placed
   * and withdraws the other teams' open offers for it. No-op for other
   * invites. Throws (rolling the add back) when the entry is gone from
   * the pool or belongs to someone else.
   */
  async placeOnAccept(
    tx: Tx,
    invite: { id: string; teamId: string; metadata: unknown },
    personId: string
  ): Promise<{ entryId: string; withdrawnOffers: number } | null> {
    const meta = (invite.metadata as Record<string, unknown>) ?? {};
    if (meta.source !== FREE_AGENT_OFFER_SOURCE) return null;
    const entryId = String(meta.freeAgentPoolEntryId ?? "");
    const [entry] = await tx
      .select()
      .from(schema.freeAgentPoolEntries)
      .where(eq(schema.freeAgentPoolEntries.id, entryId))
      .limit(1)
      .for("update");
    if (!entry) {
      throw new ConflictException({
        error: "offer_entry_missing",
        message: "This free-agent listing no longer exists. Ask the captain to add you from the roster page."
      });
    }
    if (entry.playerPersonId !== personId) {
      throw new ForbiddenException("This offer was made to another player.");
    }
    if (entry.status === "placed" && entry.placedTeamId !== invite.teamId) {
      throw new ConflictException({
        error: "already_placed",
        message: "You already joined another team from the free-agent pool for this season."
      });
    }
    const now = new Date();
    const placed = await tx
      .update(schema.freeAgentPoolEntries)
      .set({ status: "placed", placedTeamId: invite.teamId, placedAt: now, updatedAt: now })
      .where(eq(schema.freeAgentPoolEntries.id, entry.id))
      .returning({ id: schema.freeAgentPoolEntries.id });
    if (placed.length !== 1) throw new Error(`pool entry placement touched ${placed.length} rows entry=${entry.id}`);
    const withdrawn = await tx
      .update(schema.teamInvites)
      .set({
        status: "revoked",
        revokedAt: now,
        updatedAt: now,
        metadata: sql`${schema.teamInvites.metadata} || ${JSON.stringify({
          revokedReason: "player_joined_another_team"
        })}::jsonb`
      })
      .where(
        and(
          offerForEntry(entry.id),
          ne(schema.teamInvites.id, invite.id),
          inArray(schema.teamInvites.status, OPEN_INVITE_STATUSES)
        )
      )
      .returning({ id: schema.teamInvites.id });
    this.log.log(
      `free-agent offer accepted invite=${invite.id} entry=${entry.id} team=${invite.teamId} withdrew=${withdrawn.length} other offers`
    );
    return { entryId: entry.id, withdrawnOffers: withdrawn.length };
  }

  /** Tell the person who made the offer that the player answered. Fire-and-forget. */
  async notifyOutcome(inviteId: string, outcome: "accepted" | "declined"): Promise<void> {
    try {
      const [row] = await this.db
        .select({
          issuedByUserId: schema.teamInvites.issuedByUserId,
          metadata: schema.teamInvites.metadata,
          teamName: schema.teams.name,
          orgId: schema.teams.orgId,
          seasonId: schema.teamInvites.seasonId,
          seasonName: schema.seasons.name
        })
        .from(schema.teamInvites)
        .innerJoin(schema.teams, eq(schema.teams.id, schema.teamInvites.teamId))
        .leftJoin(schema.seasons, eq(schema.seasons.id, schema.teamInvites.seasonId))
        .where(eq(schema.teamInvites.id, inviteId))
        .limit(1);
      const meta = (row?.metadata as Record<string, unknown>) ?? {};
      if (!row || meta.source !== FREE_AGENT_OFFER_SOURCE) return;
      const playerPersonId = (meta.playerPersonId as string | undefined) ?? null;
      const [player] = playerPersonId
        ? await this.db
            .select({
              first: schema.persons.legalFirstName,
              last: schema.persons.legalLastName,
              preferred: schema.persons.preferredName
            })
            .from(schema.persons)
            .where(eq(schema.persons.id, playerPersonId))
            .limit(1)
        : [];
      if (!row.issuedByUserId) {
        this.log.warn(`offer ${inviteId} ${outcome}: no issuer to notify`);
        return;
      }
      const [issuer] = await this.db
        .select({ personId: schema.persons.id, email: schema.profiles.email })
        .from(schema.profiles)
        .leftJoin(schema.persons, eq(schema.persons.userId, schema.profiles.id))
        .where(eq(schema.profiles.id, row.issuedByUserId))
        .limit(1);
      const templateCode =
        outcome === "accepted" ? "FREE_AGENT_OFFER_ACCEPTED" : "FREE_AGENT_OFFER_DECLINED";
      const payload = {
        playerName: (player && personName(player)) ?? "The player",
        teamName: row.teamName,
        seasonName: row.seasonName ?? "the season",
        seasonId: row.seasonId
      };
      if (issuer?.personId) {
        void this.notify.queue({
          orgId: row.orgId,
          templateCode,
          channel: "in_app",
          idempotencyKey: `fa-offer-${inviteId}-${outcome}-inapp`,
          recipientPersonId: issuer.personId,
          payload
        });
      }
      if (issuer?.email) {
        void this.notify.queue({
          orgId: row.orgId,
          templateCode,
          channel: "email",
          idempotencyKey: `fa-offer-${inviteId}-${outcome}-email`,
          recipientEmail: issuer.email,
          recipientPersonId: issuer.personId ?? null,
          payload
        });
      }
    } catch (err) {
      this.log.error(`offer ${inviteId} ${outcome} notification failed: ${(err as Error).message}`);
    }
  }
}
