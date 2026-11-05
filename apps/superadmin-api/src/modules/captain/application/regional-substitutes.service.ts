import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq, inArray, isNull, isNotNull, or, sql } from "drizzle-orm";
import { schema, type Database } from "@sportspulse/db";
import { FREE_AGENT_POSITIONS, SCHEDULABLE_ENTRY_STATUSES, formatInZone, ageOnDate, genderMatchesDivision, resolveDivisionRules, playoffGuestEligible,
  type RegionalSubBroadcast, type RegionalSubGameView, type RegionalSubInbox, type RegionalSubRequestInput } from "@sportspulse/kernel";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { ADMIN_SCOPE_ROLE_CODES, loadAdminScope } from "../../../shared/auth/scope";
import { visibleSeasonIds } from "../../../shared/auth/visibility";
import { accessCan, accessForAnyScope } from "../../../shared/auth/game-access";
import { NotificationService } from "../../communications/application/notification.service";
import { SubstituteRequestsService } from "./substitute-requests.service";
import { addGameGuest, countGameGuests, lockGameGuests, teamDivisionInSeason } from "./game-guests";
import { resolveAnnouncementRecipients } from "../../../shared/audience/announcements";
import { closeRegionalSubRequests } from "./regional-substitute-events";
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Exec = Database | Tx;
type Broadcast = typeof schema.substituteBroadcasts.$inferSelect;
type Game = NonNullable<Awaited<ReturnType<SubstituteRequestsService["loadGame"]>>>;
function audit(event: string, actorId: string, details: Record<string, unknown> = {}) {
  return sql`${schema.substituteBroadcasts.log} || ${JSON.stringify([{ event, actorId, at: new Date().toISOString(), ...details }])}::jsonb`;
}
function parseCursor(cursor?: string): { startsAt: string; id: string } | undefined {
  if (!cursor) return undefined;
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (!value || typeof value.startsAt !== "string" || !Number.isFinite(Date.parse(value.startsAt)) ||
      typeof value.id !== "string" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value.id)) throw new Error();
    return value;
  } catch { throw new BadRequestException("The request list changed. Reload to start again."); }
}

@Injectable()
export class RegionalSubstitutesService {
  constructor(@Inject(DRIZZLE) private readonly db: Database, private readonly subs: SubstituteRequestsService,
    private readonly notify: NotificationService) {}

  private async person(userId: string, exec: Exec = this.db) {
    const [person] = await exec.select({ id: schema.persons.id }).from(schema.persons)
      .where(and(eq(schema.persons.userId, userId), isNull(schema.persons.deletedAt))).limit(1);
    if (!person) throw new NotFoundException("Player profile not found");
    return person.id;
  }
  private async region(game: Game, teamId: string, exec: Exec) {
    const [region] = await exec.select({ id: schema.regions.id, name: schema.regions.name }).from(schema.divisionTeamEntries)
      .innerJoin(schema.divisions, eq(schema.divisions.id, schema.divisionTeamEntries.divisionId))
      .innerJoin(schema.regions, eq(schema.regions.id, schema.divisions.regionId))
      .where(and(eq(schema.divisionTeamEntries.teamId, teamId), eq(schema.divisions.seasonId, game.seasonId),
        inArray(schema.divisionTeamEntries.entryStatus, [...SCHEDULABLE_ENTRY_STATUSES]), isNull(schema.divisionTeamEntries.leftAt),
        isNull(schema.divisions.deletedAt), eq(schema.regions.orgId, game.orgId), eq(schema.regions.status, "active"))).limit(1);
    return region ?? null;
  }
  private checkOpen(game: Game) {
    if (!game.publishedAt || game.status !== "scheduled" || game.start <= new Date()) throw new ConflictException("Only a published, upcoming game can accept substitute requests.");
  }
  private async staff(userId: string, game: Game, exec: Exec) {
    const access = await accessForAnyScope(exec as Database, userId, [{ id: game.id, orgId: game.orgId,
      leagueId: game.leagueId, seasonId: game.seasonId, divisionId: game.divisionId, homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId }], ADMIN_SCOPE_ROLE_CODES);
    if (!accessCan(access, "roster.write")) throw new NotFoundException("Request not found");
  }
  private async lockGame(tx: Tx, id: string): Promise<Game> {
    const [row] = await tx.select({ id: schema.games.id }).from(schema.games).where(eq(schema.games.id, id)).for("update");
    if (!row) throw new NotFoundException("Game not found");
    const game = await this.subs.loadGame(id, tx);
    if (!game) throw new NotFoundException("Game not found");
    return game;
  }
  private async broadcast(id: string, exec: Exec) {
    const [row] = await exec.select().from(schema.substituteBroadcasts).where(eq(schema.substituteBroadcasts.id, id)).limit(1);
    if (!row) throw new NotFoundException("Request not found");
    return row;
  }
  private async view(row: Broadcast, game: Game, exec: Exec, includeAccepted = true): Promise<RegionalSubBroadcast> {
    return (await this.views([row.id], exec, includeAccepted))[0]!;
  }
  private async views(ids: string[], exec: Exec, includeAccepted = true): Promise<RegionalSubBroadcast[]> {
    if (!ids.length) return [];
    const b = schema.substituteBroadcasts;
    const rows = await exec.select({ id: b.id, gameId: b.gameId, teamId: b.teamId, teamName: schema.teams.name,
      regionName: schema.regions.name, position: b.position, needed: b.needed, filled: b.filled, note: b.note, status: b.status,
      createdAt: b.createdAt, reviewedAt: b.reviewedAt, reviewNote: b.reviewNote,
      closedReason: b.closedReason,
      startsAt: schema.games.scheduledStartTsUtc, timezone: schema.games.tz, venueName: schema.games.venueName,
      invitedCount: sql<number>`(SELECT count(*)::int FROM substitute_broadcast_recipients br WHERE br.broadcast_id=${b.id})`,
      accepted: includeAccepted ? sql<Array<{ personId: string; name: string }>>`coalesce((SELECT jsonb_agg(jsonb_build_object('personId',p.id,'name',trim(concat_ws(' ',p.legal_first_name,p.legal_last_name))))
        FROM substitute_broadcast_recipients br JOIN persons p ON p.id=br.person_id WHERE br.broadcast_id=${b.id} AND br.status='accepted'),'[]'::jsonb)` : sql<null>`NULL`,
    }).from(b).innerJoin(schema.games, eq(schema.games.id, b.gameId)).innerJoin(schema.teams, eq(schema.teams.id, b.teamId))
      .innerJoin(schema.regions, eq(schema.regions.id, b.regionId)).where(inArray(b.id, ids)).orderBy(desc(b.createdAt));
    return rows.map(({ accepted, ...row }) => ({ ...row, position: row.position as RegionalSubBroadcast["position"],
      createdAt: row.createdAt.toISOString(), reviewedAt: row.reviewedAt?.toISOString() ?? null, startsAt: row.startsAt.toISOString(),
      ...(accepted ? { accepted } : {}) }));
  }
  async captainView(userId: string, teamId: string, gameId: string): Promise<RegionalSubGameView> {
    const { game } = await this.subs.requireCaptainGame(userId, teamId, gameId);
    const region = await this.region(game, teamId, this.db);
    const division = await teamDivisionInSeason(this.db, teamId, game.seasonId);
    const rows = await this.db.select().from(schema.substituteBroadcasts)
      .where(and(eq(schema.substituteBroadcasts.gameId, gameId), eq(schema.substituteBroadcasts.teamId, teamId)))
      .orderBy(desc(schema.substituteBroadcasts.createdAt)).limit(20);
    return { regionName: region?.name ?? null,
      problem: !region ? "Ask league staff to set this division's region before requesting a regional substitute." :
        !division?.tier ? "Ask league staff to set this division's skill tier before matching players across leagues." :
        !game.publishedAt || game.status !== "scheduled" || game.start <= new Date() ? "Only a published, upcoming game can accept substitute requests." : null,
      items: await this.views(rows.map(row => row.id), this.db) };
  }
  async create(userId: string, teamId: string, gameId: string, input: RegionalSubRequestInput) {
    return this.db.transaction(async tx => {
      const game = await this.lockGame(tx, gameId);
      await this.subs.requireCaptainGame(userId, teamId, gameId, tx);
      const [existing] = await tx.select().from(schema.substituteBroadcasts).where(sql`${schema.substituteBroadcasts.requestKey}=${input.requestKey}::uuid OR
        (${schema.substituteBroadcasts.gameId}=${gameId}::uuid AND ${schema.substituteBroadcasts.teamId}=${teamId}::uuid AND ${schema.substituteBroadcasts.status} IN ('pending_review','approved'))`).limit(1);
      if (existing) {
        if (existing.gameId !== gameId || existing.teamId !== teamId || existing.position !== input.position || existing.needed !== input.needed || existing.note !== (input.note?.trim() ?? ""))
          throw new ConflictException("An open substitute request already exists, or this request key was used with different details.");
        return this.view(existing, game, tx);
      }
      this.checkOpen(game);
      const region = await this.region(game, teamId, tx);
      if (!region) throw new ConflictException("Ask league staff to set this division's region first.");
      await lockGameGuests(tx, gameId, teamId);
      const division = await teamDivisionInSeason(tx, teamId, game.seasonId);
      if (!division?.tier) throw new ConflictException("Set this division's skill tier before matching players across leagues.");
      if (input.needed + await countGameGuests(tx, gameId, teamId) > (division?.rules.maxGuestPlayersPerGame ?? 2))
        throw new ConflictException("Request only the guest spots still available for this game.");
      const [row] = await tx.insert(schema.substituteBroadcasts).values({ requestKey: input.requestKey, gameId, teamId,
        seasonId: game.seasonId, regionId: region.id, position: input.position, needed: input.needed,
        note: input.note?.trim() ?? "", requestedByUserId: userId,
        log: [{ event: "requested", actorId: userId, at: new Date().toISOString() }] }).returning();
      const reviewers = await resolveAnnouncementRecipients(tx as unknown as Database, { teamIds: [], leagueIds: [game.leagueId],
        seasonIds: [game.seasonId], divisionIds: [] }, game.orgId, ["all_admins"]);
      await this.notify.queueAudienceBatch({ orgId: game.orgId, templateCode: "org.broadcast", eventKey: `sub-broadcast-review:${row!.id}`,
        sourceEvent: "substitute.broadcast.review", recipients: reviewers,
        payload: { subject: "Substitute request needs review", body: `${teamId === game.homeTeamId ? game.homeTeamName : game.awayTeamName} needs ${input.needed} ${input.position} substitute(s) for ${formatInZone(game.start, game.tz)}. Review this request before any invitation is sent.`,
          broadcastId: row!.id, gameId, teamId, seasonId: game.seasonId } }, tx);
      return this.view(row!, game, tx);
    });
  }

  private async matches(row: Broadcast, game: Game, exec: Exec, onlyPersonId?: string) {
    const s = schema.substituteSubscriptions;
    const subscriptions = await exec.select({ personId: s.personId, positions: s.positions }).from(s)
      .where(and(eq(s.orgId, game.orgId), eq(s.regionId, row.regionId), eq(s.enabled, true),
        onlyPersonId ? eq(s.personId, onlyPersonId) : undefined));
    const ids = subscriptions.filter(s => row.position === "any" || (row.position === "goalie" ? s.positions.includes("G") : s.positions.some(p => p !== "G"))).map(s => s.personId);
    if (!ids.length) return [];
    const candidates = await this.subs.candidatesFor(exec, game, row.teamId, { personIds: ids, regional: true });
    const [division] = await exec.select({ gender: schema.divisions.genderEligibility, tier: schema.divisions.tier, rules: schema.divisions.ruleSetOverrides,
      referenceDate: schema.seasons.startDate }).from(schema.divisionTeamEntries)
      .innerJoin(schema.divisions, eq(schema.divisions.id, schema.divisionTeamEntries.divisionId))
      .innerJoin(schema.seasons, eq(schema.seasons.id, schema.divisions.seasonId))
      .where(and(eq(schema.divisionTeamEntries.teamId, row.teamId), eq(schema.divisions.seasonId, game.seasonId),
        inArray(schema.divisionTeamEntries.entryStatus, [...SCHEDULABLE_ENTRY_STATUSES]), isNull(schema.divisionTeamEntries.leftAt))).limit(1);
    if (!division) throw new ConflictException("The team has no active division for this season.");
    if (!division.tier) throw new ConflictException("Set this division's skill tier before matching players across leagues.");
    const rules = resolveDivisionRules(division.rules as Record<string, unknown>);
    const people = await exec.select({ personId: schema.persons.id, dob: schema.persons.dobDate, gender: schema.persons.genderSelfId,
      email: schema.profiles.email }).from(schema.persons).leftJoin(schema.profiles, eq(schema.profiles.id, schema.persons.userId))
      .where(inArray(schema.persons.id, ids));
    const playoffRows = game.gameType === "playoff" ? await exec.selectDistinctOn([schema.eligibilityRecords.personId], {
      personId: schema.eligibilityRecords.personId, status: schema.eligibilityRecords.status, ruleEvaluation: schema.eligibilityRecords.ruleEvaluation,
    }).from(schema.eligibilityRecords).where(and(inArray(schema.eligibilityRecords.personId, ids), eq(schema.eligibilityRecords.seasonId, game.seasonId),
      sql`${schema.eligibilityRecords.effectiveFrom}<=${game.start.toISOString()}::timestamptz`, sql`(${schema.eligibilityRecords.effectiveTo} IS NULL OR ${schema.eligibilityRecords.effectiveTo}>=${new Date(game.start.getTime() + game.durationMin * 60000).toISOString()}::timestamptz)`))
      .orderBy(schema.eligibilityRecords.personId, desc(schema.eligibilityRecords.evaluatedAt)) : [];
    const playoffByPerson = new Map(playoffRows.map(record => [record.personId, record]));
    const eligible = new Set(candidates.filter(c => c.reasons.every(reason => reason === "availability_unknown")).map(c => c.personId));
    return people.filter(person => {
      if (!eligible.has(person.personId) || genderMatchesDivision(division.gender, person.gender) !== true) return false;
      if (game.gameType === "playoff" && !playoffGuestEligible(playoffByPerson.get(person.personId))) return false;
      const age = person.dob ? ageOnDate(person.dob, division.referenceDate) : null;
      if ((rules.ageMinYears !== undefined || rules.ageMaxYears !== undefined) && age === null) return false;
      return age === null || ((rules.ageMinYears === undefined || age >= rules.ageMinYears) && (rules.ageMaxYears === undefined || age <= rules.ageMaxYears));
    });
  }

  async adminView(userId: string, gameId: string) {
    const game = await this.subs.requireAdminGame(userId, gameId); await this.staff(userId, game, this.db);
    const rows = await this.db.select({ id: schema.substituteBroadcasts.id }).from(schema.substituteBroadcasts)
      .where(eq(schema.substituteBroadcasts.gameId, gameId)).orderBy(desc(schema.substituteBroadcasts.createdAt)).limit(50);
    return { items: await this.views(rows.map(row => row.id), this.db) };
  }
  async pending(userId: string, cursor?: string, orgId?: string) {
    const scope = await loadAdminScope(this.db, userId), visible = visibleSeasonIds(scope), b = schema.substituteBroadcasts;
    const after = parseCursor(cursor);
    const rows = await this.db.select({ id: b.id, startsAt: schema.games.scheduledStartTsUtc }).from(b).innerJoin(schema.games, eq(schema.games.id, b.gameId))
      .where(and(eq(b.status, "pending_review"), eq(schema.games.status, "scheduled"), sql`${schema.games.scheduledStartTsUtc}>now()`,
        visible ? sql`${b.seasonId} IN ${visible}` : undefined,
        orgId ? sql`${b.seasonId} IN (SELECT id FROM seasons WHERE org_id=${orgId}::uuid)` : undefined,
        after ? sql`(${schema.games.scheduledStartTsUtc},${b.id})>(${after.startsAt}::timestamptz,${after.id}::uuid)` : undefined))
      .orderBy(schema.games.scheduledStartTsUtc, b.id).limit(51);
    const items = rows.slice(0, 50);
    const views = new Map((await this.views(items.map(row => row.id), this.db)).map(view => [view.id, view]));
    const last = items[items.length - 1];
    return { items: items.map(row => views.get(row.id)!), nextCursor: rows.length > 50 && last ?
      Buffer.from(JSON.stringify({ startsAt: last.startsAt.toISOString(), id: last.id })).toString("base64url") : null };
  }

  async review(userId: string, id: string, action: "approve" | "reject", note = "") {
    if (action === "reject" && !note.trim()) throw new BadRequestException("Add a short message so the captain knows what to change.");
    const existing = await this.broadcast(id, this.db);
    return this.db.transaction(async tx => {
      const game = await this.lockGame(tx, existing.gameId); await this.staff(userId, game, tx); this.checkOpen(game);
      const [row] = await tx.select().from(schema.substituteBroadcasts).where(eq(schema.substituteBroadcasts.id, id)).for("update");
      if (!row) throw new NotFoundException("Request not found");
      if (row.status === (action === "approve" ? "approved" : "rejected")) return this.view(row, game, tx);
      if (row.status !== "pending_review") throw new ConflictException("This request was already decided.");
      const region = await this.region(game, row.teamId, tx);
      if (!region || region.id !== row.regionId) throw new ConflictException("This team's region changed. Cancel this request and create a new one.");
      let recipients: Array<{ personId: string; email: string | null }> = [];
      if (action === "approve") {
        await lockGameGuests(tx, game.id, row.teamId);
        const division = await teamDivisionInSeason(tx, row.teamId, game.seasonId);
        if (row.needed - row.filled + await countGameGuests(tx, game.id, row.teamId) > (division?.rules.maxGuestPlayersPerGame ?? 2))
          throw new ConflictException("The game's remaining guest spots changed. Ask the captain to submit an updated request.");
        recipients = await this.matches(row, game, tx);
        if (!recipients.length) throw new ConflictException("No eligible, opted-in players currently match this region and position. Keep this request pending or reject it with a note.");
        for (let i = 0; i < recipients.length; i += 100) await tx.insert(schema.substituteBroadcastRecipients)
          .values(recipients.slice(i, i + 100).map(recipient => ({ broadcastId: id, personId: recipient.personId }))).onConflictDoNothing();
      }
      const [updated] = await tx.update(schema.substituteBroadcasts).set({ status: action === "approve" ? "approved" : "rejected",
        reviewedByUserId: userId, reviewedAt: new Date(), reviewNote: note.trim() || null, reviewSequence: row.reviewSequence + 1,
        log: audit(action === "approve" ? "approved" : "rejected", userId, { recipientCount: recipients.length, note: note.trim() }), updatedAt: new Date() })
        .where(eq(schema.substituteBroadcasts.id, id)).returning();
      const team = row.teamId === game.homeTeamId ? game.homeTeamName : game.awayTeamName;
      if (recipients.length) await this.notify.queueAudienceBatch({ orgId: game.orgId, templateCode: "org.broadcast",
        eventKey: `sub-broadcast-invite:${id}:${updated!.reviewSequence}`, sourceEvent: "substitute.broadcast.invitation", recipients,
        payload: { subject: `${team} is looking for a ${row.position === "goalie" ? "goalie" : "substitute"}`,
          body: `${team} needs a substitute for ${formatInZone(game.start, game.tz)}${game.venueName ? ` at ${game.venueName}` : ""}. ${row.note} Open SportsPulse to accept or decline.`,
          broadcastId: id, gameId: game.id, seasonId: game.seasonId } }, tx);
      const captains = await resolveAnnouncementRecipients(tx as unknown as Database, { teamIds: [row.teamId], leagueIds: [], seasonIds: [], divisionIds: [] }, game.orgId, ["captains"]);
      await this.notify.queueAudienceBatch({ orgId: game.orgId, templateCode: "org.broadcast", eventKey: `sub-broadcast-decision:${id}:${updated!.reviewSequence}`,
        sourceEvent: "substitute.broadcast.decision", recipients: captains, payload: {
          subject: action === "approve" ? "Your substitute request was approved" : "Your substitute request needs an update",
          body: action === "approve" ? `Private invitations are queued for ${recipients.length} matching players for ${formatInZone(game.start, game.tz)}.` : `Staff declined this request.${note.trim() ? ` ${note.trim()}` : " Contact league staff for details."}`,
          broadcastId: id, gameId: game.id, teamId: row.teamId, seasonId: game.seasonId } }, tx);
      return this.view(updated!, game, tx);
    });
  }

  private async regionOptions(personId: string, exec: Exec) {
    const rows = await exec.execute(sql`SELECT r.id,r.name,o.display_name AS org_name,s.enabled,s.positions
      FROM regions r JOIN orgs o ON o.id=r.org_id
      LEFT JOIN substitute_subscriptions s ON s.region_id=r.id AND s.person_id=${personId}::uuid
      WHERE r.status='active' AND o.deleted_at IS NULL AND r.org_id IN (
        SELECT org_id FROM registrations WHERE subject_person_id=${personId}::uuid AND status='approved'
        UNION SELECT t.org_id FROM team_memberships m JOIN teams t ON t.id=m.team_id
          WHERE m.person_id=${personId}::uuid AND m.current_status='active' AND m.effective_to IS NULL AND t.deleted_at IS NULL
        UNION SELECT se.org_id FROM free_agent_pool_entries f JOIN seasons se ON se.id=f.season_id
          WHERE f.player_person_id=${personId}::uuid AND f.status='active' AND se.deleted_at IS NULL
      ) ORDER BY o.display_name,r.sort_order,r.name LIMIT 100`);
    return rows.map(row => ({ id: row.id as string, name: row.name as string, orgName: row.org_name as string,
      enabled: row.enabled === true, positions: (row.positions as string[] | null) ?? [] }));
  }
  async mine(userId: string, cursor?: string, confirmedOnly = false): Promise<RegionalSubInbox> {
    let personId: string;
    try { personId = await this.person(userId); }
    catch (error) { if (error instanceof NotFoundException) return { regions: [], invitations: [], nextCursor: null }; throw error; }
    const after = parseCursor(cursor);
    const [regions, rows] = await Promise.all([confirmedOnly ? Promise.resolve([]) : this.regionOptions(personId, this.db), this.db
      .select({ id: schema.substituteBroadcasts.id, response: schema.substituteBroadcastRecipients.status, startsAt: schema.games.scheduledStartTsUtc })
      .from(schema.substituteBroadcastRecipients).innerJoin(schema.substituteBroadcasts,
        eq(schema.substituteBroadcasts.id, schema.substituteBroadcastRecipients.broadcastId))
      .innerJoin(schema.games, eq(schema.games.id, schema.substituteBroadcasts.gameId))
      .where(and(eq(schema.substituteBroadcastRecipients.personId, personId),
        or(and(eq(schema.substituteBroadcastRecipients.status, "accepted"), isNotNull(schema.substituteBroadcastRecipients.attendanceId)),
          !confirmedOnly ? and(eq(schema.substituteBroadcastRecipients.status, "invited"), eq(schema.substituteBroadcasts.status, "approved")) : undefined),
        eq(schema.games.status, "scheduled"),
        sql`${schema.games.scheduledStartTsUtc}>now()`,
        after ? sql`(${schema.games.scheduledStartTsUtc},${schema.substituteBroadcasts.id})>(${after.startsAt}::timestamptz,${after.id}::uuid)` : undefined))
        .orderBy(schema.games.scheduledStartTsUtc, schema.substituteBroadcasts.id).limit(51)]);
    const items = rows.slice(0, 50), last = items[items.length - 1];
    const views = new Map((await this.views(items.map(row => row.id), this.db, false)).map(view => [view.id, view]));
    return { regions, invitations: items.map(row => ({ broadcast: views.get(row.id)!, response: row.response })),
      nextCursor: rows.length > 50 && last ? Buffer.from(JSON.stringify({ startsAt: last.startsAt.toISOString(), id: last.id })).toString("base64url") : null };
  }
  async subscribe(userId: string, regionId: string, enabled: boolean, positions: string[]) {
    const allowed = FREE_AGENT_POSITIONS.map(position => position.value as string);
    if ((enabled && !positions.length) || positions.length > 5 || positions.some(position => !allowed.includes(position)))
      throw new BadRequestException("Choose the positions you want to play.");
    return this.db.transaction(async tx => {
      const personId = await this.person(userId, tx);
      const options = await this.regionOptions(personId, tx);
      const existing = options.find(region => region.id === regionId);
      const [owned] = !enabled ? await tx.select({ id: schema.substituteSubscriptions.id }).from(schema.substituteSubscriptions)
        .where(and(eq(schema.substituteSubscriptions.personId, personId), eq(schema.substituteSubscriptions.regionId, regionId))).limit(1) : [];
      // Consent can always be revoked, including after a region is archived
      // or the player's membership no longer qualifies for new invitations.
      if (!existing && !owned) throw new NotFoundException("Region not available to your account");
      const [region] = await tx.select().from(schema.regions).where(and(eq(schema.regions.id, regionId), enabled ? eq(schema.regions.status, "active") : undefined));
      if (!region) throw new NotFoundException("Region not found");
      if (!enabled && !positions.length) await tx.delete(schema.substituteSubscriptions)
        .where(and(eq(schema.substituteSubscriptions.personId, personId), eq(schema.substituteSubscriptions.regionId, regionId)));
      else await tx.insert(schema.substituteSubscriptions).values({ personId, regionId, orgId: region.orgId, enabled,
        positions: [...new Set(positions)] }).onConflictDoUpdate({ target: [schema.substituteSubscriptions.personId, schema.substituteSubscriptions.regionId],
        set: { enabled, positions: [...new Set(positions)], updatedAt: new Date() } });
      if (!enabled) {
        await tx.update(schema.notifications).set({ status: "suppressed", lastError: "Regional substitute invitations disabled", updatedAt: new Date() })
          .where(and(eq(schema.notifications.recipientPersonId, personId), eq(schema.notifications.sourceEvent, "substitute.broadcast.invitation"),
            inArray(schema.notifications.status, ["queued", "failed"]),
            sql`${schema.notifications.payload}->>'broadcastId' IN (SELECT id::text FROM substitute_broadcasts WHERE region_id=${regionId}::uuid)`));
        await tx.update(schema.substituteBroadcastRecipients).set({ status: "closed", answeredAt: new Date() })
          .where(and(eq(schema.substituteBroadcastRecipients.personId, personId), eq(schema.substituteBroadcastRecipients.status, "invited"),
            sql`${schema.substituteBroadcastRecipients.broadcastId} IN (SELECT id FROM substitute_broadcasts WHERE region_id=${regionId}::uuid)`));
      }
      return { regionId, enabled, positions: [...new Set(positions)] };
    });
  }
  async cancel(userId: string, teamId: string, id: string) {
    const existing = await this.broadcast(id, this.db);
    if (existing.teamId !== teamId) throw new NotFoundException("Request not found");
    return this.db.transaction(async tx => {
      const game = await this.lockGame(tx, existing.gameId);
      await this.subs.requireCaptainGame(userId, teamId, game.id, tx);
      const row = await this.broadcast(id, tx);
      if (row.status === "cancelled") return this.view(row, game, tx);
      if (row.status !== "pending_review" && row.status !== "approved") throw new ConflictException("This request can no longer be cancelled.");
      await closeRegionalSubRequests(tx, this.notify, { gameId: game.id, reason: "Withdrawn by the captain", actorId: userId, requestIds: [id] });
      return this.view(await this.broadcast(id, tx), game, tx);
    });
  }
  async answer(userId: string, id: string, action: "accept" | "decline") {
    const personId = await this.person(userId);
    const [own] = await this.db.select({ id: schema.substituteBroadcastRecipients.id, gameId: schema.substituteBroadcasts.gameId })
      .from(schema.substituteBroadcastRecipients).innerJoin(schema.substituteBroadcasts,
        eq(schema.substituteBroadcasts.id, schema.substituteBroadcastRecipients.broadcastId))
      .where(and(eq(schema.substituteBroadcastRecipients.broadcastId, id), eq(schema.substituteBroadcastRecipients.personId, personId))).limit(1);
    if (!own) throw new NotFoundException("Invitation not found");
    return this.db.transaction(async tx => {
      const game = await this.lockGame(tx, own.gameId);
      const row = await this.broadcast(id, tx);
      const [recipient] = await tx.select().from(schema.substituteBroadcastRecipients).where(eq(schema.substituteBroadcastRecipients.id, own.id)).for("update");
      if (!recipient) throw new NotFoundException("Invitation not found");
      if (recipient.status === (action === "accept" ? "accepted" : "declined")) return { response: recipient.status, broadcast: await this.view(row, game, tx, false) };
      this.checkOpen(game);
      if (row.status !== "approved" || recipient.status !== "invited") throw new ConflictException("This invitation is no longer open.");
      if (action === "decline") {
        await tx.update(schema.substituteBroadcastRecipients).set({ status: "declined", answeredAt: new Date() })
          .where(eq(schema.substituteBroadcastRecipients.id, own.id));
        await tx.update(schema.substituteBroadcasts).set({ log: audit("declined", userId, { personId }) }).where(eq(schema.substituteBroadcasts.id, id));
        return { response: "declined", broadcast: await this.view(row, game, tx, false) };
      }
      const region = await this.region(game, row.teamId, tx);
      if (!region || region.id !== row.regionId) throw new ConflictException("The team's region changed. Ask staff to review a new request.");
      await lockGameGuests(tx, game.id, row.teamId);
      if (row.filled >= row.needed) throw new ConflictException("This request is already filled.");
      if (!(await this.matches(row, game, tx, personId)).length)
        throw new ConflictException("Your eligibility or regional subscription changed. Check your membership proof, availability and active subscription, or contact league staff.");
      const guest = await addGameGuest(tx, { gameId: game.id, teamId: row.teamId, seasonId: game.seasonId, personId,
        actorUserId: userId, moveMetadata: { source: "approved_regional_broadcast", broadcastId: id, reviewedByUserId: row.reviewedByUserId } });
      await tx.update(schema.substituteBroadcastRecipients).set({ status: "accepted", attendanceId: guest.attendance.id, answeredAt: new Date() })
        .where(eq(schema.substituteBroadcastRecipients.id, own.id));
      const filled = row.filled + 1;
      const [updated] = await tx.update(schema.substituteBroadcasts).set({ filled, status: filled === row.needed ? "filled" : "approved",
        log: audit("accepted", userId, { personId, attendanceId: guest.attendance.id }), updatedAt: new Date() })
        .where(eq(schema.substituteBroadcasts.id, id)).returning();
      if (filled === row.needed) await tx.update(schema.substituteBroadcastRecipients).set({ status: "closed", answeredAt: new Date() })
        .where(and(eq(schema.substituteBroadcastRecipients.broadcastId, id), eq(schema.substituteBroadcastRecipients.status, "invited")));
      const captains = await resolveAnnouncementRecipients(tx as unknown as Database, { teamIds: [row.teamId], leagueIds: [], seasonIds: [], divisionIds: [] }, game.orgId, ["captains"]);
      const [person] = await tx.select({ first: schema.persons.legalFirstName, last: schema.persons.legalLastName }).from(schema.persons).where(eq(schema.persons.id, personId));
      await this.notify.queueAudienceBatch({ orgId: game.orgId, templateCode: "org.broadcast", eventKey: `sub-broadcast-accepted:${id}:${personId}`,
        sourceEvent: "substitute.broadcast.accepted", recipients: captains, payload: {
          subject: "Your substitute is confirmed", body: `${[person?.first, person?.last].filter(Boolean).join(" ")} accepted and is on your guest lineup for ${formatInZone(game.start, game.tz)}.`,
          gameId: game.id, broadcastId: id, teamId: row.teamId, seasonId: game.seasonId } }, tx);
      return { response: "accepted", broadcast: await this.view(updated!, game, tx, false) };
    });
  }
}
