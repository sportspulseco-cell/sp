import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  Logger,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UnprocessableEntityException,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min
} from "class-validator";
import { and, asc, count, eq, gte, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { AuthPrincipal } from "@sportspulse/auth";
import { isValidTimeZone, zonedWallTimeToUtc } from "@sportspulse/kernel";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import { loadUserScope } from "../../../shared/auth/scope";
import { canInOrg } from "../../../shared/auth/org-permission";
import { resolveEntityNames } from "../../../shared/display/entity-names";
import { gameTimeLabel } from "../../game-operations/application/games/game-notifications";

/**
 * Scheduling inventory — venue / surface / ice_slot CRUD.
 *
 * This is what the scheduler reads from: a VENUE (rink building) has
 * SURFACES (sheets), each surface has ICE_SLOTS (bookable start+duration
 * units). Games point at a surface (and, when the scheduler placed them,
 * at a slot).
 *
 * Access:
 *   - reads: super admin, or the venue's org in the caller's scope
 *     (loadUserScope.orgIds); out of scope is 404.
 *   - writes: super admin, or a role inside the venue's org whose
 *     permissions grant `scheduler.run` (org, league and season admins;
 *     PPHL matrix "Create season/division/schedule"). Captains, players
 *     and platform roles such as parents cannot change rinks (403).
 *
 * Removing a rink (SCH-3): refused while a game there is not finished;
 * open ice slots from today on go only when the admin confirms
 * (removeOpenSlots=true); a rink with history (played or cancelled
 * games, past slots, rink integrations) is archived (deleted_at, hidden
 * everywhere, games keep its name), otherwise it is deleted.
 *
 * Times: admins type rink-local wall times ("YYYY-MM-DDTHH:MM" or
 * date + "HH:MM"); the server converts them in the venue's time zone
 * with the kernel helper, so the result never depends on the browser.
 */

const WALL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
/** Game statuses that still need the rink. */
const UNFINISHED_GAME_STATUSES = ["scheduled", "in_play", "postponed"];
/** Permission that lets a role set up rinks and ice time. */
const INVENTORY_WRITE = "scheduler.run";

const log = new Logger("SchedulingInventory");

/** Postal address kept on venues.address. Other keys (lat, lng) are preserved. */
const ADDRESS_KEYS = ["line1", "line2", "city", "region", "postalCode", "countryCode"] as const;

class CreateVenueDto {
  @IsUUID() orgId!: string;
  @IsString() @Length(1, 120) name!: string;
  @IsOptional() @IsObject() address?: Record<string, unknown>;
  @IsOptional() @IsString() timezone?: string;
}

class UpdateVenueDto {
  @IsOptional() @IsString() @Length(1, 120) name?: string;
  @IsOptional() @IsObject() address?: Record<string, unknown>;
  @IsOptional() @IsString() timezone?: string;
}

class CreateSurfaceDto {
  @IsString() @Length(1, 60) label!: string;
}

class UpdateSurfaceDto {
  @IsOptional() @IsString() @Length(1, 60) label?: string;
}

class CreateIceSlotDto {
  @IsOptional() @IsUUID() seasonId?: string | null;
  /** Rink-local start "YYYY-MM-DDTHH:MM" (preferred). */
  @IsOptional() @Matches(WALL, { message: "Pick the date and start time." }) startLocal?: string;
  /** Absolute start; used only when startLocal is absent. */
  @IsOptional() @IsString() startTsUtc?: string;
  @IsInt() @Min(15) @Max(360) durationMin!: number;
  /** Ignored: a slot takes its venue's time zone. Kept for old clients. */
  @IsOptional() @IsString() tz?: string;
  @IsOptional() @IsIn(["early", "mid", "late"]) band?: "early" | "mid" | "late";
  @IsOptional() @IsInt() @Min(0) hourlyCostCents?: number;
  @IsOptional() @IsBoolean() isPlayoffReservation?: boolean;
}

class BulkIceSlotDto {
  @IsOptional() @IsUUID() seasonId?: string | null;
  /** Inclusive YYYY-MM-DD. */
  @Matches(/^\d{4}-\d{2}-\d{2}$/) startDate!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) endDate!: string;
  /** 0=Sunday .. 6=Saturday, rink-local. */
  @IsArray() @IsInt({ each: true }) @Min(0, { each: true }) @Max(6, { each: true })
  weekdays!: number[];
  /** "HH:MM" rink-local start time. */
  @Matches(/^\d{2}:\d{2}$/) startLocalTime!: string;
  @IsInt() @Min(15) @Max(360) durationMin!: number;
  /** Ignored: slots take their venue's time zone. Kept for old clients. */
  @IsOptional() @IsString() tz?: string;
  @IsOptional() @IsIn(["early", "mid", "late"]) band?: "early" | "mid" | "late";
  @IsOptional() @IsInt() @Min(0) hourlyCostCents?: number;
  @IsOptional() @IsBoolean() isPlayoffReservation?: boolean;
}

class UpdateIceSlotDto {
  /** Rink-local start "YYYY-MM-DDTHH:MM" in the slot's time zone (preferred). */
  @IsOptional() @Matches(WALL, { message: "Pick the date and start time." }) startLocal?: string;
  @IsOptional() @IsString() startTsUtc?: string;
  @IsOptional() @IsInt() @Min(15) @Max(360) durationMin?: number;
  /** null clears the band. */
  @IsOptional() @IsIn(["early", "mid", "late"]) band?: "early" | "mid" | "late" | null;
  /** null unties the slot from any season. */
  @IsOptional() @IsUUID() seasonId?: string | null;
  @IsOptional() @IsInt() @Min(0) hourlyCostCents?: number;
  @IsOptional() @IsBoolean() isPlayoffReservation?: boolean;
  @IsOptional() @IsIn(["available", "assigned", "blocked", "returned"])
  status?: string;
}

class RemoveRinkQueryDto {
  /** Confirms removing open ice slots from today on with the rink. */
  @IsOptional()
  @Transform(({ value }) => value === true || value === "true")
  @IsBoolean()
  removeOpenSlots?: boolean;
}

/** What still uses a venue or surface, and what removing it would do. */
export interface RinkUsage {
  name: string;
  /** Games here that are scheduled, in play or postponed (first 5). */
  unfinishedGames: Array<{ id: string; label: string }>;
  unfinishedGamesCount: number;
  /** Completed, forfeited or cancelled games here. */
  finishedGamesCount: number;
  /** Ice slots starting from now on (they go with the rink, after confirmation). */
  openSlotsCount: number;
  pastSlotsCount: number;
  /** Venue only: rink notification integrations (kept as history). */
  rinkIntegrationsCount: number;
  /** blocked = refuse; archive = hide, keep history; delete = remove the row. */
  outcome: "blocked" | "archive" | "delete";
  /** Plain sentence for the confirm step. */
  message: string;
}

type Exec = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Keep the known address keys (trimmed, blanks dropped) and any other stored keys. */
function mergeAddress(current: unknown, patch: Record<string, unknown>): Record<string, unknown> {
  const base = current && typeof current === "object" ? { ...(current as Record<string, unknown>) } : {};
  for (const k of ADDRESS_KEYS) {
    if (!(k in patch)) continue;
    const v = patch[k];
    const text = typeof v === "string" ? v.trim() : "";
    if (text) base[k] = text;
    else delete base[k];
  }
  return base;
}

function isUniqueViolation(e: unknown): boolean {
  return (e as { code?: string })?.code === "23505";
}

@ApiTags("scheduling/inventory")
@ApiBearerAuth()
@Controller("scheduling")
@UseGuards(JwtAuthGuard)
export class SchedulingInventoryController {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  // ---------------------------------------------------------------
  //  Venues
  // ---------------------------------------------------------------
  @Get("venues")
  @ApiOperation({
    summary:
      "List venues, optionally filtered by orgId. Returns surfaces count per row for the admin list view."
  })
  async listVenues(
    @CurrentUser() user: AuthPrincipal,
    @Query("orgId") orgId?: string
  ) {
    const scope = await loadUserScope(this.db, user.userId);
    let orgFilter: string[] | null = null;
    if (!scope.isSuperAdmin) {
      const allowedOrgIds = scope.orgIds ?? [];
      if (orgId) {
        if (!allowedOrgIds.includes(orgId)) {
          throw new NotFoundException("Org not found");
        }
        orgFilter = [orgId];
      } else if (allowedOrgIds.length === 0) {
        return { items: [] };
      } else {
        orgFilter = allowedOrgIds;
      }
    } else if (orgId) {
      orgFilter = [orgId];
    }

    const whereClause = and(
      isNull(schema.venues.deletedAt),
      orgFilter ? inArray(schema.venues.orgId, orgFilter) : sql`true`
    );
    const rows = await this.db
      .select({
        id: schema.venues.id,
        orgId: schema.venues.orgId,
        name: schema.venues.name,
        address: schema.venues.address,
        timezone: schema.venues.timezone,
        createdAt: schema.venues.createdAt,
        surfacesCount: sql<number>`COUNT(${schema.surfaces.id})::int`.mapWith(Number)
      })
      .from(schema.venues)
      .leftJoin(
        schema.surfaces,
        and(
          eq(schema.surfaces.venueId, schema.venues.id),
          isNull(schema.surfaces.deletedAt)
        )
      )
      .where(whereClause)
      .groupBy(
        schema.venues.id,
        schema.venues.orgId,
        schema.venues.name,
        schema.venues.address,
        schema.venues.timezone,
        schema.venues.createdAt
      )
      .orderBy(asc(schema.venues.name));

    return {
      items: rows.map((r) => ({
        ...r,
        address: r.address as Record<string, unknown>,
        createdAt: r.createdAt.toISOString()
      }))
    };
  }

  @Get("venues/:id")
  async getVenue(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string
  ) {
    const venue = await this.requireVenue(user, id, "read");
    const surfaces = await this.db
      .select({
        id: schema.surfaces.id,
        venueId: schema.surfaces.venueId,
        label: schema.surfaces.label,
        createdAt: schema.surfaces.createdAt,
        iceSlotsCount: sql<number>`COUNT(${schema.iceSlots.id})::int`.mapWith(Number)
      })
      .from(schema.surfaces)
      .leftJoin(
        schema.iceSlots,
        eq(schema.iceSlots.surfaceId, schema.surfaces.id)
      )
      .where(
        and(
          eq(schema.surfaces.venueId, id),
          isNull(schema.surfaces.deletedAt)
        )
      )
      .groupBy(
        schema.surfaces.id,
        schema.surfaces.venueId,
        schema.surfaces.label,
        schema.surfaces.createdAt
      )
      .orderBy(asc(schema.surfaces.label));
    return {
      venue: this.venueOut(venue),
      surfaces: surfaces.map((s) => ({
        ...s,
        createdAt: s.createdAt.toISOString()
      }))
    };
  }

  @Post("venues")
  async createVenue(
    @CurrentUser() user: AuthPrincipal,
    @Body() body: CreateVenueDto
  ) {
    await this.requireOrgWrite(user, body.orgId);
    const name = body.name.trim();
    if (!name) throw new UnprocessableEntityException("Give the rink a name.");
    const timezone = this.validTimeZone(body.timezone);
    const [inserted] = await this.db
      .insert(schema.venues)
      .values({
        orgId: body.orgId,
        name,
        address: mergeAddress({}, body.address ?? {}),
        timezone
      })
      .returning();
    log.log(`venue.create id=${inserted!.id} org=${body.orgId} by=${user.userId}`);
    return this.venueOut(inserted!);
  }

  @Patch("venues/:id")
  @ApiOperation({
    summary:
      "Rename a venue, change its time zone or postal address. Ice slots and games already saved keep their own time and zone."
  })
  async updateVenue(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string,
    @Body() body: UpdateVenueDto
  ) {
    const venue = await this.requireVenue(user, id, "write");
    const patch: Partial<typeof schema.venues.$inferInsert> = { updatedAt: new Date() };
    if (body.name !== undefined) {
      const name = body.name.trim();
      if (!name) throw new UnprocessableEntityException("Give the rink a name.");
      patch.name = name;
    }
    if (body.timezone !== undefined) patch.timezone = this.validTimeZone(body.timezone);
    if (body.address !== undefined) patch.address = mergeAddress(venue.address, body.address);
    const [updated] = await this.db
      .update(schema.venues)
      .set(patch)
      .where(and(eq(schema.venues.id, id), isNull(schema.venues.deletedAt)))
      .returning();
    if (!updated) throw new NotFoundException("Venue not found");
    log.log(
      `venue.update id=${id} by=${user.userId} fields=${Object.keys(patch).filter((k) => k !== "updatedAt").join(",")}`
    );
    return this.venueOut(updated);
  }

  @Get("venues/:id/usage")
  @ApiOperation({
    summary:
      "What still uses this venue (unfinished games, finished games, ice slots, rink integrations) and whether removing it deletes, archives or is refused. Writes nothing."
  })
  async venueUsage(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string
  ): Promise<RinkUsage> {
    const venue = await this.requireVenue(user, id, "write");
    return this.usage(this.db, { kind: "venue", id, name: venue.name });
  }

  @Delete("venues/:id")
  @ApiOperation({
    summary:
      "Remove a venue. 409 while a game there is not finished, or while open ice slots exist and removeOpenSlots is not true. Archived when it has history, deleted otherwise."
  })
  async deleteVenue(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string,
    @Query() q: RemoveRinkQueryDto
  ) {
    await this.requireVenue(user, id, "write");
    const result = await this.db.transaction(async (tx) => {
      const [venue] = await tx
        .select()
        .from(schema.venues)
        .where(and(eq(schema.venues.id, id), isNull(schema.venues.deletedAt)))
        .for("update");
      if (!venue) throw new NotFoundException("Venue not found");
      const surfaceIds = (
        await tx
          .select({ id: schema.surfaces.id })
          .from(schema.surfaces)
          .where(eq(schema.surfaces.venueId, id))
      ).map((s) => s.id);
      // Same locks as game create / move, so no game lands here while
      // the rink is being removed.
      await this.lockSurfaces(tx, surfaceIds);
      const usage = await this.usage(tx, { kind: "venue", id, name: venue.name });
      const removedSlots = await this.clearOpenSlots(tx, usage, surfaceIds, q.removeOpenSlots === true);
      if (usage.outcome === "delete") {
        const rows = await tx
          .delete(schema.venues)
          .where(eq(schema.venues.id, id))
          .returning({ id: schema.venues.id });
        if (rows.length !== 1) throw new Error(`venue ${id}: delete touched ${rows.length} rows`);
      } else {
        const now = new Date();
        await tx
          .update(schema.venues)
          .set({ deletedAt: now, updatedAt: now })
          .where(eq(schema.venues.id, id));
        for (const surfaceId of surfaceIds) await this.archiveSurface(tx, surfaceId, now);
      }
      return { outcome: usage.outcome === "delete" ? "deleted" : "archived", removedSlots } as const;
    });
    log.log(`venue.remove id=${id} by=${user.userId} outcome=${result.outcome} removedSlots=${result.removedSlots}`);
    return result;
  }

  // ---------------------------------------------------------------
  //  Surfaces
  // ---------------------------------------------------------------
  @Post("venues/:venueId/surfaces")
  async createSurface(
    @CurrentUser() user: AuthPrincipal,
    @Param("venueId") venueId: string,
    @Body() body: CreateSurfaceDto
  ) {
    await this.requireVenue(user, venueId, "write");
    const label = body.label.trim();
    if (!label) throw new UnprocessableEntityException("Give the surface a name.");
    try {
      const [inserted] = await this.db
        .insert(schema.surfaces)
        .values({ venueId, label })
        .returning();
      return { ...inserted!, createdAt: inserted!.createdAt.toISOString(), updatedAt: inserted!.updatedAt.toISOString() };
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new ConflictException(`A surface called "${label}" already exists at this venue.`);
      }
      throw e;
    }
  }

  @Patch("surfaces/:id")
  @ApiOperation({ summary: "Rename a surface. Games already played keep the name they were played under." })
  async updateSurface(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string,
    @Body() body: UpdateSurfaceDto
  ) {
    await this.requireSurface(user, id, "write");
    const patch: Partial<typeof schema.surfaces.$inferInsert> = { updatedAt: new Date() };
    if (body.label !== undefined) {
      const label = body.label.trim();
      if (!label) throw new UnprocessableEntityException("Give the surface a name.");
      patch.label = label;
    }
    try {
      const [updated] = await this.db
        .update(schema.surfaces)
        .set(patch)
        .where(and(eq(schema.surfaces.id, id), isNull(schema.surfaces.deletedAt)))
        .returning();
      if (!updated) throw new NotFoundException("Surface not found");
      log.log(`surface.update id=${id} by=${user.userId}`);
      return { ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() };
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new ConflictException(`Another surface at this venue is already called "${patch.label}".`);
      }
      throw e;
    }
  }

  @Get("surfaces/:id/usage")
  @ApiOperation({
    summary: "What still uses this surface and whether removing it deletes, archives or is refused. Writes nothing."
  })
  async surfaceUsage(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string
  ): Promise<RinkUsage> {
    const surface = await this.requireSurface(user, id, "write");
    return this.usage(this.db, { kind: "surface", id, name: surface.label });
  }

  @Delete("surfaces/:id")
  @ApiOperation({
    summary:
      "Remove a surface. Same rules as a venue: refused while a game there is not finished; open slots go only with removeOpenSlots=true; archived when it has history."
  })
  async deleteSurface(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string,
    @Query() q: RemoveRinkQueryDto
  ) {
    await this.requireSurface(user, id, "write");
    const result = await this.db.transaction(async (tx) => {
      const [surface] = await tx
        .select()
        .from(schema.surfaces)
        .where(and(eq(schema.surfaces.id, id), isNull(schema.surfaces.deletedAt)))
        .for("update");
      if (!surface) throw new NotFoundException("Surface not found");
      await this.lockSurfaces(tx, [id]);
      const usage = await this.usage(tx, { kind: "surface", id, name: surface.label });
      const removedSlots = await this.clearOpenSlots(tx, usage, [id], q.removeOpenSlots === true);
      if (usage.outcome === "delete") {
        const rows = await tx
          .delete(schema.surfaces)
          .where(eq(schema.surfaces.id, id))
          .returning({ id: schema.surfaces.id });
        if (rows.length !== 1) throw new Error(`surface ${id}: delete touched ${rows.length} rows`);
      } else {
        await this.archiveSurface(tx, id, new Date());
      }
      return { outcome: usage.outcome === "delete" ? "deleted" : "archived", removedSlots } as const;
    });
    log.log(`surface.remove id=${id} by=${user.userId} outcome=${result.outcome} removedSlots=${result.removedSlots}`);
    return result;
  }

  // ---------------------------------------------------------------
  //  Ice slots
  // ---------------------------------------------------------------
  @Get("surfaces/:surfaceId/ice-slots")
  @ApiOperation({
    summary:
      "List ice slots for a surface. Optional window via fromTsUtc / toTsUtc, defaults to next 90 days."
  })
  async listIceSlots(
    @CurrentUser() user: AuthPrincipal,
    @Param("surfaceId") surfaceId: string,
    @Query("fromTsUtc") fromTsUtc?: string,
    @Query("toTsUtc") toTsUtc?: string,
    @Query("seasonId") seasonId?: string
  ) {
    await this.requireSurface(user, surfaceId, "read");
    const from = fromTsUtc
      ? new Date(fromTsUtc)
      : new Date(Date.now() - 7 * 86400000);
    const to = toTsUtc
      ? new Date(toTsUtc)
      : new Date(Date.now() + 90 * 86400000);
    const rows = await this.db
      .select()
      .from(schema.iceSlots)
      .where(
        and(
          eq(schema.iceSlots.surfaceId, surfaceId),
          gte(schema.iceSlots.startTsUtc, from),
          sql`${schema.iceSlots.startTsUtc} <= ${to.toISOString()}::timestamptz`,
          seasonId ? eq(schema.iceSlots.seasonId, seasonId) : sql`true`
        )
      )
      .orderBy(asc(schema.iceSlots.startTsUtc));
    return { items: rows.map((r) => this.slotOut(r)) };
  }

  @Post("surfaces/:surfaceId/ice-slots")
  async createIceSlot(
    @CurrentUser() user: AuthPrincipal,
    @Param("surfaceId") surfaceId: string,
    @Body() body: CreateIceSlotDto
  ) {
    const { venue } = await this.requireSurface(user, surfaceId, "write");
    const tz = this.venueTimeZone(venue);
    const startTsUtc = this.slotStart(body.startLocal, body.startTsUtc, tz);
    if (body.seasonId) await this.requireSeasonOfOrg(body.seasonId, venue.orgId);
    try {
      const [inserted] = await this.db
        .insert(schema.iceSlots)
        .values({
          surfaceId,
          seasonId: body.seasonId ?? null,
          startTsUtc,
          durationMin: body.durationMin,
          tz,
          band: body.band ?? null,
          hourlyCostCents: body.hourlyCostCents ?? 0,
          isPlayoffReservation: body.isPlayoffReservation ?? false
        })
        .returning();
      return this.slotOut(inserted!);
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new ConflictException("Another slot already starts at this exact time on this surface.");
      }
      throw e;
    }
  }

  @Post("surfaces/:surfaceId/ice-slots/bulk")
  @ApiOperation({
    summary:
      "Generate ice slots on a weekly recurrence in the venue's time zone. Slots that already exist at the same surface+start are skipped."
  })
  async bulkIceSlots(
    @CurrentUser() user: AuthPrincipal,
    @Param("surfaceId") surfaceId: string,
    @Body() body: BulkIceSlotDto
  ) {
    const { venue } = await this.requireSurface(user, surfaceId, "write");
    const tz = this.venueTimeZone(venue);
    if (body.seasonId) await this.requireSeasonOfOrg(body.seasonId, venue.orgId);
    const start = new Date(`${body.startDate}T00:00:00Z`);
    const end = new Date(`${body.endDate}T00:00:00Z`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      throw new BadRequestException("The end date must be on or after the start date.");
    }
    if (end.getTime() - start.getTime() > 400 * 86400000) {
      throw new UnprocessableEntityException("Generate at most about a year of slots at a time.");
    }
    const weekdays = new Set(body.weekdays);
    const rows: Array<typeof schema.iceSlots.$inferInsert> = [];
    for (
      const cursor = new Date(start.getTime());
      cursor <= end;
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    ) {
      if (!weekdays.has(cursor.getUTCDay())) continue;
      const day = cursor.toISOString().slice(0, 10);
      let startTsUtc: Date;
      try {
        startTsUtc = zonedWallTimeToUtc(`${day}T${body.startLocalTime}`, tz);
      } catch (e) {
        throw new BadRequestException((e as Error).message);
      }
      rows.push({
        surfaceId,
        seasonId: body.seasonId ?? null,
        startTsUtc,
        durationMin: body.durationMin,
        tz,
        band: body.band ?? null,
        hourlyCostCents: body.hourlyCostCents ?? 0,
        isPlayoffReservation: body.isPlayoffReservation ?? false
      });
    }
    if (rows.length === 0) {
      return { created: 0, skipped: 0 };
    }
    const inserted = await this.db
      .insert(schema.iceSlots)
      .values(rows)
      .onConflictDoNothing({
        target: [schema.iceSlots.surfaceId, schema.iceSlots.startTsUtc]
      })
      .returning({ id: schema.iceSlots.id });
    return { created: inserted.length, skipped: rows.length - inserted.length };
  }

  @Patch("ice-slots/:id")
  @ApiOperation({
    summary:
      "Edit one ice slot (start, length, band, season, playoff reservation). Refused while a game is booked in it: move the game instead."
  })
  async updateIceSlot(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string,
    @Body() body: UpdateIceSlotDto
  ) {
    const { venue } = await this.requireIceSlot(user, id, "write");
    if (body.seasonId) await this.requireSeasonOfOrg(body.seasonId, venue.orgId);
    const updated = await this.db.transaction(async (tx) => {
      const [slot] = await tx
        .select()
        .from(schema.iceSlots)
        .where(eq(schema.iceSlots.id, id))
        .for("update");
      if (!slot) throw new NotFoundException("Ice slot not found");
      await this.refuseIfBooked(tx, id, "change");
      const patch: Partial<typeof schema.iceSlots.$inferInsert> = { updatedAt: new Date() };
      if (body.startLocal !== undefined || body.startTsUtc !== undefined) {
        const tz = isValidTimeZone(slot.tz) ? slot.tz : this.venueTimeZone(venue);
        patch.startTsUtc = this.slotStart(body.startLocal, body.startTsUtc, tz);
      }
      if (body.durationMin !== undefined) patch.durationMin = body.durationMin;
      if (body.band !== undefined) patch.band = body.band;
      if (body.seasonId !== undefined) patch.seasonId = body.seasonId;
      if (body.hourlyCostCents !== undefined) patch.hourlyCostCents = body.hourlyCostCents;
      if (body.isPlayoffReservation !== undefined) patch.isPlayoffReservation = body.isPlayoffReservation;
      if (body.status !== undefined) patch.status = body.status;
      try {
        const [row] = await tx
          .update(schema.iceSlots)
          .set(patch)
          .where(eq(schema.iceSlots.id, id))
          .returning();
        if (!row) throw new Error(`ice slot ${id}: update touched 0 rows`);
        return row;
      } catch (e) {
        if (isUniqueViolation(e)) {
          throw new ConflictException("Another slot already starts at this exact time on this surface.");
        }
        throw e;
      }
    });
    log.log(`ice_slot.update id=${id} by=${user.userId}`);
    return this.slotOut(updated);
  }

  @Delete("ice-slots/:id")
  @ApiOperation({ summary: "Delete one ice slot. Refused while a game is booked in it." })
  async deleteIceSlot(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string
  ) {
    await this.requireIceSlot(user, id, "write");
    await this.db.transaction(async (tx) => {
      const [slot] = await tx
        .select({ id: schema.iceSlots.id })
        .from(schema.iceSlots)
        .where(eq(schema.iceSlots.id, id))
        .for("update");
      if (!slot) throw new NotFoundException("Ice slot not found");
      await this.refuseIfBooked(tx, id, "delete");
      const rows = await tx
        .delete(schema.iceSlots)
        .where(eq(schema.iceSlots.id, id))
        .returning({ id: schema.iceSlots.id });
      if (rows.length !== 1) throw new Error(`ice slot ${id}: delete touched ${rows.length} rows`);
    });
    log.log(`ice_slot.delete id=${id} by=${user.userId}`);
    return { ok: true as const };
  }

  // ---------------------------------------------------------------
  //  Usage, archive
  // ---------------------------------------------------------------
  private async usage(
    exec: Exec,
    target: { kind: "venue" | "surface"; id: string; name: string }
  ): Promise<RinkUsage> {
    // Every surface of the venue, archived ones included: their games
    // and slots are history of this rink too.
    const surfaceIds =
      target.kind === "surface"
        ? [target.id]
        : (
            await exec
              .select({ id: schema.surfaces.id })
              .from(schema.surfaces)
              .where(eq(schema.surfaces.venueId, target.id))
          ).map((s) => s.id);
    const now = new Date();
    if (surfaceIds.length === 0 && target.kind === "venue") {
      const integrations = await this.integrationCount(exec, target.id);
      return this.verdict(target, [], 0, 0, 0, 0, integrations);
    }
    const slotIds = exec
      .select({ id: schema.iceSlots.id })
      .from(schema.iceSlots)
      .where(inArray(schema.iceSlots.surfaceId, surfaceIds));
    const atRink = or(
      inArray(schema.games.surfaceId, surfaceIds),
      inArray(schema.games.slotId, slotIds)
    );
    const [unfinished, unfinishedCount, finishedCount, openSlots, pastSlots, integrations] = await Promise.all([
      exec
        .select({
          id: schema.games.id,
          homeTeamId: schema.games.homeTeamId,
          awayTeamId: schema.games.awayTeamId,
          start: schema.games.scheduledStartTsUtc,
          tz: schema.games.tz
        })
        .from(schema.games)
        .where(and(atRink, inArray(schema.games.status, UNFINISHED_GAME_STATUSES)))
        .orderBy(asc(schema.games.scheduledStartTsUtc))
        .limit(5),
      exec
        .select({ n: count() })
        .from(schema.games)
        .where(and(atRink, inArray(schema.games.status, UNFINISHED_GAME_STATUSES))),
      exec
        .select({ n: count() })
        .from(schema.games)
        .where(and(atRink, sql`${schema.games.status} not in ('scheduled','in_play','postponed')`)),
      exec
        .select({ n: count() })
        .from(schema.iceSlots)
        .where(and(inArray(schema.iceSlots.surfaceId, surfaceIds), gte(schema.iceSlots.startTsUtc, now))),
      exec
        .select({ n: count() })
        .from(schema.iceSlots)
        .where(and(inArray(schema.iceSlots.surfaceId, surfaceIds), lt(schema.iceSlots.startTsUtc, now))),
      target.kind === "venue" ? this.integrationCount(exec, target.id) : Promise.resolve(0)
    ]);
    const names = await resolveEntityNames(
      exec as Database,
      unfinished.flatMap((g) => [
        { type: "team", id: g.homeTeamId },
        { type: "team", id: g.awayTeamId }
      ])
    );
    const team = (id: string) => names.get(`team:${id}`) ?? "Unnamed team";
    const games = unfinished.map((g) => ({
      id: g.id,
      label: `${team(g.awayTeamId)} at ${team(g.homeTeamId)}, ${gameTimeLabel(g.start, g.tz)}`
    }));
    return this.verdict(
      target,
      games,
      unfinishedCount[0]?.n ?? 0,
      finishedCount[0]?.n ?? 0,
      openSlots[0]?.n ?? 0,
      pastSlots[0]?.n ?? 0,
      integrations
    );
  }

  private verdict(
    target: { kind: "venue" | "surface"; name: string },
    unfinishedGames: RinkUsage["unfinishedGames"],
    unfinishedGamesCount: number,
    finishedGamesCount: number,
    openSlotsCount: number,
    pastSlotsCount: number,
    rinkIntegrationsCount: number
  ): RinkUsage {
    const what = target.kind === "venue" ? "rink" : "surface";
    let outcome: RinkUsage["outcome"];
    let message: string;
    if (unfinishedGamesCount > 0) {
      outcome = "blocked";
      const listed = unfinishedGames.map((g) => g.label).join("; ");
      const more = unfinishedGamesCount > unfinishedGames.length ? ` and ${unfinishedGamesCount - unfinishedGames.length} more` : "";
      message = `${target.name} cannot be removed: ${plural(unfinishedGamesCount, "game")} here ${unfinishedGamesCount === 1 ? "is" : "are"} not finished (${listed}${more}). Move or cancel ${unfinishedGamesCount === 1 ? "it" : "them"} first.`;
    } else {
      const history = finishedGamesCount > 0 || pastSlotsCount > 0 || rinkIntegrationsCount > 0;
      outcome = history ? "archive" : "delete";
      const slots = openSlotsCount > 0 ? ` Its ${plural(openSlotsCount, "open ice slot")} from today on will be removed.` : "";
      message = history
        ? `${target.name} has history (${[
            finishedGamesCount ? plural(finishedGamesCount, "past game") : "",
            pastSlotsCount ? plural(pastSlotsCount, "past ice slot") : "",
            rinkIntegrationsCount ? plural(rinkIntegrationsCount, "rink integration") : ""
          ]
            .filter(Boolean)
            .join(", ")}), so it will be archived: hidden from lists and pickers, while past games keep its name.${slots}`
        : `${target.name} is not used by any game, so the ${what} will be deleted.${slots}`;
    }
    return {
      name: target.name,
      unfinishedGames,
      unfinishedGamesCount,
      finishedGamesCount,
      openSlotsCount,
      pastSlotsCount,
      rinkIntegrationsCount,
      outcome,
      message
    };
  }

  private async integrationCount(exec: Exec, venueId: string): Promise<number> {
    const [row] = await exec
      .select({ n: count() })
      .from(schema.rinkIntegrations)
      .where(eq(schema.rinkIntegrations.venueId, venueId));
    return row?.n ?? 0;
  }

  /** Refuse while unfinished; remove open slots only when confirmed. */
  private async clearOpenSlots(
    tx: Exec,
    usage: RinkUsage,
    surfaceIds: string[],
    confirmed: boolean
  ): Promise<number> {
    if (usage.outcome === "blocked") throw new ConflictException(usage.message);
    if (usage.openSlotsCount === 0 || surfaceIds.length === 0) return 0;
    if (!confirmed) {
      throw new ConflictException(
        `${usage.name} still has ${plural(usage.openSlotsCount, "open ice slot")} from today on. Confirm that they go too.`
      );
    }
    const removed = await tx
      .delete(schema.iceSlots)
      .where(and(inArray(schema.iceSlots.surfaceId, surfaceIds), gte(schema.iceSlots.startTsUtc, new Date())))
      .returning({ id: schema.iceSlots.id });
    return removed.length;
  }

  /**
   * Hide a surface and free its label (labels are unique per venue, and
   * archived rows keep theirs), so the name can be used again.
   */
  private async archiveSurface(tx: Exec, surfaceId: string, at: Date): Promise<void> {
    const [s] = await tx
      .select({ label: schema.surfaces.label, deletedAt: schema.surfaces.deletedAt })
      .from(schema.surfaces)
      .where(eq(schema.surfaces.id, surfaceId))
      .limit(1);
    if (!s || s.deletedAt) return;
    const label = `${s.label} (archived ${at.toISOString().slice(0, 10)} ${surfaceId.slice(0, 4)})`;
    await tx
      .update(schema.surfaces)
      .set({ deletedAt: at, updatedAt: at, label })
      .where(eq(schema.surfaces.id, surfaceId));
  }

  private async lockSurfaces(tx: Exec, surfaceIds: string[]): Promise<void> {
    for (const id of [...surfaceIds].sort()) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`placement:surface:${id}`}))`);
    }
  }

  private async refuseIfBooked(tx: Exec, slotId: string, verb: "change" | "delete"): Promise<void> {
    const [game] = await tx
      .select({
        id: schema.games.id,
        homeTeamId: schema.games.homeTeamId,
        awayTeamId: schema.games.awayTeamId,
        status: schema.games.status
      })
      .from(schema.games)
      .where(and(eq(schema.games.slotId, slotId), ne(schema.games.status, "cancelled")))
      .limit(1);
    if (!game) return;
    const names = await resolveEntityNames(tx as Database, [
      { type: "team", id: game.homeTeamId },
      { type: "team", id: game.awayTeamId }
    ]);
    const matchup = `${names.get(`team:${game.awayTeamId}`) ?? "A team"} at ${names.get(`team:${game.homeTeamId}`) ?? "another team"}`;
    throw new ConflictException(
      game.status === "completed" || game.status === "forfeited"
        ? `${matchup} was played in this slot, so it stays as history.`
        : `${matchup} is booked in this slot. Move or cancel that game first (Games, then Reschedule), then ${verb} the slot.`
    );
  }

  // ---------------------------------------------------------------
  //  Helpers
  // ---------------------------------------------------------------
  private validTimeZone(raw: string | undefined): string {
    const tz = raw?.trim() || "UTC";
    if (!isValidTimeZone(tz)) {
      throw new UnprocessableEntityException(`"${tz}" is not a time zone. Pick one from the list, for example America/New_York.`);
    }
    return tz;
  }

  private venueTimeZone(venue: { name: string; timezone: string }): string {
    if (!isValidTimeZone(venue.timezone)) {
      throw new UnprocessableEntityException(
        `${venue.name} has the time zone "${venue.timezone}", which is not a real time zone. Fix it on the rink first.`
      );
    }
    return venue.timezone;
  }

  private slotStart(startLocal: string | undefined, startTsUtc: string | undefined, tz: string): Date {
    if (startLocal) {
      try {
        return zonedWallTimeToUtc(startLocal, tz);
      } catch (e) {
        throw new BadRequestException((e as Error).message);
      }
    }
    const d = startTsUtc ? new Date(startTsUtc) : null;
    if (!d || Number.isNaN(d.getTime())) throw new BadRequestException("Pick the date and start time.");
    return d;
  }

  private async requireSeasonOfOrg(seasonId: string, orgId: string): Promise<void> {
    const [season] = await this.db
      .select({ orgId: schema.seasons.orgId })
      .from(schema.seasons)
      .where(and(eq(schema.seasons.id, seasonId), isNull(schema.seasons.deletedAt)))
      .limit(1);
    if (!season || season.orgId !== orgId) {
      throw new UnprocessableEntityException("That season is not one of this rink's organisation. Pick another season.");
    }
  }

  private venueOut(v: typeof schema.venues.$inferSelect) {
    return {
      ...v,
      address: v.address as Record<string, unknown>,
      metadata: v.metadata as Record<string, unknown>,
      createdAt: v.createdAt.toISOString(),
      updatedAt: v.updatedAt.toISOString(),
      deletedAt: v.deletedAt ? v.deletedAt.toISOString() : null
    };
  }

  private slotOut(r: typeof schema.iceSlots.$inferSelect) {
    return {
      ...r,
      metadata: r.metadata as Record<string, unknown>,
      startTsUtc: r.startTsUtc.toISOString(),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString()
    };
  }

  // ---------------------------------------------------------------
  //  Scope
  // ---------------------------------------------------------------
  private async canReadOrg(user: AuthPrincipal, orgId: string): Promise<boolean> {
    const scope = await loadUserScope(this.db, user.userId);
    return scope.isSuperAdmin || scope.orgIds === null || scope.orgIds.includes(orgId);
  }

  private async requireOrgWrite(user: AuthPrincipal, orgId: string): Promise<void> {
    if (!(await canInOrg(this.db, user.userId, orgId, INVENTORY_WRITE))) {
      throw new ForbiddenException(
        "Your role cannot change rinks or ice time for this organisation. Ask an org or league admin."
      );
    }
  }

  /** Live venue in the caller's scope: 404 outside read scope, 403 when read-only. */
  private async requireVenue(user: AuthPrincipal, venueId: string, mode: "read" | "write") {
    const [venue] = await this.db
      .select()
      .from(schema.venues)
      .where(and(eq(schema.venues.id, venueId), isNull(schema.venues.deletedAt)))
      .limit(1);
    if (!venue || !(await this.canReadOrg(user, venue.orgId))) {
      throw new NotFoundException("Venue not found");
    }
    if (mode === "write") await this.requireOrgWrite(user, venue.orgId);
    return venue;
  }

  private async requireSurface(user: AuthPrincipal, surfaceId: string, mode: "read" | "write") {
    const [row] = await this.db
      .select()
      .from(schema.surfaces)
      .where(and(eq(schema.surfaces.id, surfaceId), isNull(schema.surfaces.deletedAt)))
      .limit(1);
    if (!row) throw new NotFoundException("Surface not found");
    const venue = await this.requireVenue(user, row.venueId, mode);
    return { ...row, venue };
  }

  private async requireIceSlot(user: AuthPrincipal, iceSlotId: string, mode: "read" | "write") {
    const [row] = await this.db
      .select({ surfaceId: schema.iceSlots.surfaceId })
      .from(schema.iceSlots)
      .where(eq(schema.iceSlots.id, iceSlotId))
      .limit(1);
    if (!row) throw new NotFoundException("Ice slot not found");
    return this.requireSurface(user, row.surfaceId, mode);
  }
}
