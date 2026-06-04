import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min
} from "class-validator";
import { and, asc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { AuthPrincipal } from "@sportspulse/auth";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import { loadUserScope } from "../../../shared/auth/scope";

/**
 * Scheduling inventory — venue / surface / ice_slot CRUD.
 *
 * This is what the scheduler reads from: a VENUE has SURFACES (sheets),
 * each surface has ICE_SLOTS (bookable start+duration units). Before
 * this controller existed the only way to get rows into venues /
 * surfaces / ice_slots was direct SQL, so the admin web apps had no
 * way to set up a season's inventory without a DBA.
 *
 * Scope:
 *   - super_admin sees + writes anything
 *   - org_admin sees + writes within their org's scope.orgIds
 *   - everyone else is denied
 *
 * Bulk ice slot generation: POST /surfaces/:id/ice-slots/bulk takes a
 * weekly recurrence ({weekday, startLocalTime, durationMin, weeks})
 * and emits one row per (weekday × week) in the [startDate, endDate]
 * window. ON CONFLICT skips collisions on the
 * ice_slot_surface_start_uniq index.
 */

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
  @IsString() startTsUtc!: string;
  @IsInt() @Min(15) @Max(360) durationMin!: number;
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
  /** 0=Sunday .. 6=Saturday. Local-time interpretation per `tz`. */
  @IsArray() @IsInt({ each: true }) @Min(0, { each: true }) @Max(6, { each: true })
  weekdays!: number[];
  /** "HH:MM" local start time. */
  @Matches(/^\d{2}:\d{2}$/) startLocalTime!: string;
  @IsInt() @Min(15) @Max(360) durationMin!: number;
  @IsString() tz!: string;
  @IsOptional() @IsIn(["early", "mid", "late"]) band?: "early" | "mid" | "late";
  @IsOptional() @IsInt() @Min(0) hourlyCostCents?: number;
  @IsOptional() @IsBoolean() isPlayoffReservation?: boolean;
}

class UpdateIceSlotDto {
  @IsOptional() @IsString() startTsUtc?: string;
  @IsOptional() @IsInt() @Min(15) @Max(360) durationMin?: number;
  @IsOptional() @IsIn(["early", "mid", "late"]) band?: "early" | "mid" | "late";
  @IsOptional() @IsInt() @Min(0) hourlyCostCents?: number;
  @IsOptional() @IsBoolean() isPlayoffReservation?: boolean;
  @IsOptional() @IsIn(["available", "assigned", "blocked", "returned"])
  status?: string;
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
        createdAt: r.createdAt.toISOString()
      }))
    };
  }

  @Get("venues/:id")
  async getVenue(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string
  ) {
    const venue = await this.requireVenueInScope(user, id);
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
      venue: {
        ...venue,
        createdAt: venue.createdAt.toISOString(),
        updatedAt: venue.updatedAt.toISOString()
      },
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
    await this.requireOrgScope(user, body.orgId);
    const [inserted] = await this.db
      .insert(schema.venues)
      .values({
        orgId: body.orgId,
        name: body.name.trim(),
        address: body.address ?? {},
        timezone: body.timezone?.trim() || "UTC"
      })
      .returning();
    return { ...inserted!, createdAt: inserted!.createdAt.toISOString(), updatedAt: inserted!.updatedAt.toISOString() };
  }

  @Patch("venues/:id")
  async updateVenue(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string,
    @Body() body: UpdateVenueDto
  ) {
    await this.requireVenueInScope(user, id);
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) patch.name = body.name.trim();
    if (body.address !== undefined) patch.address = body.address;
    if (body.timezone !== undefined) patch.timezone = body.timezone.trim() || "UTC";
    const [updated] = await this.db
      .update(schema.venues)
      .set(patch)
      .where(eq(schema.venues.id, id))
      .returning();
    return { ...updated!, createdAt: updated!.createdAt.toISOString(), updatedAt: updated!.updatedAt.toISOString() };
  }

  @Delete("venues/:id")
  async deleteVenue(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string
  ) {
    await this.requireVenueInScope(user, id);
    await this.db
      .update(schema.venues)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.venues.id, id));
    return { ok: true };
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
    await this.requireVenueInScope(user, venueId);
    try {
      const [inserted] = await this.db
        .insert(schema.surfaces)
        .values({ venueId, label: body.label.trim() })
        .returning();
      return { ...inserted!, createdAt: inserted!.createdAt.toISOString(), updatedAt: inserted!.updatedAt.toISOString() };
    } catch (e) {
      if ((e as { code?: string }).code === "23505") {
        throw new BadRequestException(
          `A surface labeled "${body.label}" already exists at this venue.`
        );
      }
      throw e;
    }
  }

  @Patch("surfaces/:id")
  async updateSurface(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string,
    @Body() body: UpdateSurfaceDto
  ) {
    await this.requireSurfaceInScope(user, id);
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (body.label !== undefined) patch.label = body.label.trim();
    const [updated] = await this.db
      .update(schema.surfaces)
      .set(patch)
      .where(eq(schema.surfaces.id, id))
      .returning();
    return { ...updated!, createdAt: updated!.createdAt.toISOString(), updatedAt: updated!.updatedAt.toISOString() };
  }

  @Delete("surfaces/:id")
  async deleteSurface(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string
  ) {
    await this.requireSurfaceInScope(user, id);
    await this.db
      .update(schema.surfaces)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.surfaces.id, id));
    return { ok: true };
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
    await this.requireSurfaceInScope(user, surfaceId);
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
          lte(schema.iceSlots.startTsUtc, to),
          seasonId ? eq(schema.iceSlots.seasonId, seasonId) : sql`true`
        )
      )
      .orderBy(asc(schema.iceSlots.startTsUtc));
    return {
      items: rows.map((r) => ({
        ...r,
        startTsUtc: r.startTsUtc.toISOString(),
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString()
      }))
    };
  }

  @Post("surfaces/:surfaceId/ice-slots")
  async createIceSlot(
    @CurrentUser() user: AuthPrincipal,
    @Param("surfaceId") surfaceId: string,
    @Body() body: CreateIceSlotDto
  ) {
    await this.requireSurfaceInScope(user, surfaceId);
    try {
      const [inserted] = await this.db
        .insert(schema.iceSlots)
        .values({
          surfaceId,
          seasonId: body.seasonId ?? null,
          startTsUtc: new Date(body.startTsUtc),
          durationMin: body.durationMin,
          tz: body.tz ?? "UTC",
          band: body.band ?? null,
          hourlyCostCents: body.hourlyCostCents ?? 0,
          isPlayoffReservation: body.isPlayoffReservation ?? false
        })
        .returning();
      return {
        ...inserted,
        startTsUtc: inserted!.startTsUtc.toISOString(),
        createdAt: inserted!.createdAt.toISOString(),
        updatedAt: inserted!.updatedAt.toISOString()
      };
    } catch (e) {
      if ((e as { code?: string }).code === "23505") {
        throw new BadRequestException(
          "Another slot already starts at this exact time on this surface."
        );
      }
      throw e;
    }
  }

  @Post("surfaces/:surfaceId/ice-slots/bulk")
  @ApiOperation({
    summary:
      "Generate ice slots on a weekly recurrence. ON CONFLICT skips existing slots at the same surface+start (the partial unique index)."
  })
  async bulkIceSlots(
    @CurrentUser() user: AuthPrincipal,
    @Param("surfaceId") surfaceId: string,
    @Body() body: BulkIceSlotDto
  ) {
    await this.requireSurfaceInScope(user, surfaceId);
    const start = new Date(`${body.startDate}T00:00:00Z`);
    const end = new Date(`${body.endDate}T23:59:59Z`);
    if (end <= start) {
      throw new BadRequestException("endDate must be after startDate.");
    }
    const [hour, minute] = body.startLocalTime.split(":").map((n) => parseInt(n, 10));
    if (Number.isNaN(hour) || Number.isNaN(minute)) {
      throw new BadRequestException("startLocalTime must be HH:MM.");
    }
    const weekdays = new Set(body.weekdays);
    const rows: Array<typeof schema.iceSlots.$inferInsert> = [];
    for (
      const cursor = new Date(start.getTime());
      cursor <= end;
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    ) {
      if (!weekdays.has(cursor.getUTCDay())) continue;
      // Local-time interpretation: build a UTC ISO from the local
      // date + HH:MM using the supplied tz. We rely on the JS engine's
      // tz-conversion via toLocaleString round-trip — sufficient for
      // North-American common zones; deeper tz correctness can come
      // later if needed.
      const local = new Date(
        Date.UTC(
          cursor.getUTCFullYear(),
          cursor.getUTCMonth(),
          cursor.getUTCDate(),
          hour,
          minute
        )
      );
      // Offset from UTC for the given tz at that wall-clock instant:
      const offsetMs = tzOffsetMs(local, body.tz);
      const startTsUtc = new Date(local.getTime() - offsetMs);
      rows.push({
        surfaceId,
        seasonId: body.seasonId ?? null,
        startTsUtc,
        durationMin: body.durationMin,
        tz: body.tz,
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
  async updateIceSlot(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string,
    @Body() body: UpdateIceSlotDto
  ) {
    await this.requireIceSlotInScope(user, id);
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (body.startTsUtc !== undefined) patch.startTsUtc = new Date(body.startTsUtc);
    if (body.durationMin !== undefined) patch.durationMin = body.durationMin;
    if (body.band !== undefined) patch.band = body.band;
    if (body.hourlyCostCents !== undefined) patch.hourlyCostCents = body.hourlyCostCents;
    if (body.isPlayoffReservation !== undefined) patch.isPlayoffReservation = body.isPlayoffReservation;
    if (body.status !== undefined) patch.status = body.status;
    const [updated] = await this.db
      .update(schema.iceSlots)
      .set(patch)
      .where(eq(schema.iceSlots.id, id))
      .returning();
    return {
      ...updated,
      startTsUtc: updated!.startTsUtc.toISOString(),
      createdAt: updated!.createdAt.toISOString(),
      updatedAt: updated!.updatedAt.toISOString()
    };
  }

  @Delete("ice-slots/:id")
  async deleteIceSlot(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") id: string
  ) {
    await this.requireIceSlotInScope(user, id);
    await this.db.delete(schema.iceSlots).where(eq(schema.iceSlots.id, id));
    return { ok: true };
  }

  // ---------------------------------------------------------------
  //  Scope helpers
  // ---------------------------------------------------------------
  private async requireOrgScope(user: AuthPrincipal, orgId: string) {
    const scope = await loadUserScope(this.db, user.userId);
    if (scope.isSuperAdmin) return;
    if (scope.orgIds === null) return;
    if (!scope.orgIds.includes(orgId)) {
      throw new ForbiddenException("Org not in scope");
    }
  }

  private async requireVenueInScope(user: AuthPrincipal, venueId: string) {
    const [venue] = await this.db
      .select()
      .from(schema.venues)
      .where(and(eq(schema.venues.id, venueId), isNull(schema.venues.deletedAt)))
      .limit(1);
    if (!venue) throw new NotFoundException("Venue not found");
    await this.requireOrgScope(user, venue.orgId);
    return venue;
  }

  private async requireSurfaceInScope(user: AuthPrincipal, surfaceId: string) {
    const [row] = await this.db
      .select({ venueId: schema.surfaces.venueId })
      .from(schema.surfaces)
      .where(and(eq(schema.surfaces.id, surfaceId), isNull(schema.surfaces.deletedAt)))
      .limit(1);
    if (!row) throw new NotFoundException("Surface not found");
    await this.requireVenueInScope(user, row.venueId);
  }

  private async requireIceSlotInScope(user: AuthPrincipal, iceSlotId: string) {
    const [row] = await this.db
      .select({ surfaceId: schema.iceSlots.surfaceId })
      .from(schema.iceSlots)
      .where(eq(schema.iceSlots.id, iceSlotId))
      .limit(1);
    if (!row) throw new NotFoundException("Ice slot not found");
    await this.requireSurfaceInScope(user, row.surfaceId);
  }
}

/**
 * Returns the offset in ms between the given wall-clock instant and
 * UTC, interpreted in `tz`. Uses Intl APIs so it works for any IANA
 * tz the runtime knows.
 */
function tzOffsetMs(instant: Date, tz: string): number {
  const utc = new Date(instant.toLocaleString("en-US", { timeZone: "UTC" }));
  const local = new Date(instant.toLocaleString("en-US", { timeZone: tz }));
  return local.getTime() - utc.getTime();
}
