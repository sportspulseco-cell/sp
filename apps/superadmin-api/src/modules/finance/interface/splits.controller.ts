import {
  BadRequestException,
  Body,
  Controller,
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
import { and, eq, inArray, sql } from "drizzle-orm";
import { IsIn, IsInt, IsOptional, IsUUID, Min } from "class-validator";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { SuperAdminGuard } from "../../../shared/auth/guards/super-admin.guard";

class CreateSplitBodyDto {
  @IsUUID() invoiceId!: string;
  @IsUUID() teamId!: string;
  @IsUUID() playerPersonId!: string;
  @IsInt() @Min(0) allocatedCents!: number;
}

class CreateSplitsBatchBodyDto {
  @IsUUID() invoiceId!: string;
  @IsUUID() teamId!: string;
  /** Equal-split helper — splits invoice total across these players. */
  playerPersonIds!: string[];
}

class PatchSplitBodyDto {
  @IsOptional() @IsInt() @Min(0) collectedCents?: number;
  @IsOptional() @IsIn(["pending", "partial", "paid", "overdue"]) status?: string;
  @IsOptional() @IsInt() @Min(0) allocatedCents?: number;
}

class ListSplitsQueryDto {
  @IsOptional() @IsUUID() invoiceId?: string;
  @IsOptional() @IsUUID() teamId?: string;
  @IsOptional() @IsUUID() playerPersonId?: string;
}

interface SplitDto {
  id: string;
  invoiceId: string;
  teamId: string;
  playerPersonId: string;
  allocatedCents: number;
  collectedCents: number;
  status: string;
  lastReminderAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SplitWithPersonDto extends SplitDto {
  player: {
    id: string;
    legalFirstName: string;
    legalLastName: string;
    preferredName: string | null;
  };
  /** True when this player holds the captain role on the same team as this split. */
  isCaptain: boolean;
}

/**
 * Per-player share of a team-level invoice. Drives the "Dues split"
 * tab. Reads return rows joined with persons + a captain flag derived
 * from user_role_assignments scoped to the split's teamId.
 */
@ApiTags("finance/splits")
@ApiBearerAuth()
@Controller("finance/splits")
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class FinanceSplitsController {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @Get()
  async list(@Query() q: ListSplitsQueryDto): Promise<SplitWithPersonDto[]> {
    if (!q.invoiceId && !q.teamId && !q.playerPersonId) {
      throw new BadRequestException(
        "Pass at least one of: invoiceId, teamId, playerPersonId"
      );
    }

    const conditions = [] as ReturnType<typeof eq>[];
    if (q.invoiceId) conditions.push(eq(schema.teamInvoiceSplits.invoiceId, q.invoiceId));
    if (q.teamId) conditions.push(eq(schema.teamInvoiceSplits.teamId, q.teamId));
    if (q.playerPersonId)
      conditions.push(eq(schema.teamInvoiceSplits.playerPersonId, q.playerPersonId));

    const rows = await this.db
      .select({
        split: schema.teamInvoiceSplits,
        person: {
          id: schema.persons.id,
          userId: schema.persons.userId,
          legalFirstName: schema.persons.legalFirstName,
          legalLastName: schema.persons.legalLastName,
          preferredName: schema.persons.preferredName
        }
      })
      .from(schema.teamInvoiceSplits)
      .innerJoin(
        schema.persons,
        eq(schema.persons.id, schema.teamInvoiceSplits.playerPersonId)
      )
      .where(and(...conditions))
      .orderBy(schema.teamInvoiceSplits.createdAt);

    if (rows.length === 0) return [];

    // Captain flag — one query for all (teamId, userId) pairs in this batch.
    // Set keyed by `${teamId}:${userId}`; per-row lookup happens in the map below.
    const teamIds = Array.from(new Set(rows.map((r) => r.split.teamId)));
    const userIds = Array.from(
      new Set(rows.map((r) => r.person.userId).filter((u): u is string => u !== null))
    );
    const captainSet = new Set<string>();
    if (teamIds.length > 0 && userIds.length > 0) {
      const caps = await this.db
        .select({
          userId: schema.userRoleAssignments.userId,
          scopeId: schema.userRoleAssignments.scopeId
        })
        .from(schema.userRoleAssignments)
        .innerJoin(
          schema.roles,
          eq(schema.roles.id, schema.userRoleAssignments.roleId)
        )
        .where(
          and(
            eq(schema.roles.code, "captain"),
            sql`${schema.userRoleAssignments.revokedAt} IS NULL`,
            eq(schema.userRoleAssignments.scopeType, "team"),
            inArray(schema.userRoleAssignments.scopeId, teamIds),
            inArray(schema.userRoleAssignments.userId, userIds)
          )
        );
      for (const c of caps) {
        if (c.scopeId) captainSet.add(`${c.scopeId}:${c.userId}`);
      }
    }

    return rows.map((r) => ({
      id: r.split.id,
      invoiceId: r.split.invoiceId,
      teamId: r.split.teamId,
      playerPersonId: r.split.playerPersonId,
      allocatedCents: r.split.allocatedCents,
      collectedCents: r.split.collectedCents,
      status: r.split.status,
      lastReminderAt: r.split.lastReminderAt?.toISOString() ?? null,
      createdAt: r.split.createdAt.toISOString(),
      updatedAt: r.split.updatedAt.toISOString(),
      player: {
        id: r.person.id,
        legalFirstName: r.person.legalFirstName,
        legalLastName: r.person.legalLastName,
        preferredName: r.person.preferredName
      },
      isCaptain:
        r.person.userId !== null &&
        captainSet.has(`${r.split.teamId}:${r.person.userId}`)
    }));
  }

  @Post()
  @ApiOperation({ summary: "Create one split row" })
  async create(@Body() body: CreateSplitBodyDto): Promise<SplitDto> {
    const [row] = await this.db
      .insert(schema.teamInvoiceSplits)
      .values({
        invoiceId: body.invoiceId,
        teamId: body.teamId,
        playerPersonId: body.playerPersonId,
        allocatedCents: body.allocatedCents
      })
      .returning();
    return toDto(row!);
  }

  @Post("batch-equal")
  @ApiOperation({
    summary:
      "Create equal splits across N players. Allocates the un-allocated remainder of the invoice (totalCents minus existing splits)."
  })
  async batchEqual(@Body() body: CreateSplitsBatchBodyDto): Promise<SplitDto[]> {
    if (!Array.isArray(body.playerPersonIds) || body.playerPersonIds.length === 0) {
      throw new BadRequestException("playerPersonIds required");
    }
    const [invoice] = await this.db
      .select({ totalCents: schema.invoices.totalCents })
      .from(schema.invoices)
      .where(eq(schema.invoices.id, body.invoiceId))
      .limit(1);
    if (!invoice) throw new NotFoundException("Invoice not found");

    const existing = await this.db
      .select({ allocated: schema.teamInvoiceSplits.allocatedCents })
      .from(schema.teamInvoiceSplits)
      .where(eq(schema.teamInvoiceSplits.invoiceId, body.invoiceId));

    const alreadyAllocated = existing.reduce((sum, s) => sum + s.allocated, 0);
    const remaining = invoice.totalCents - alreadyAllocated;
    if (remaining <= 0) {
      throw new BadRequestException(
        "Invoice is already fully allocated across existing splits"
      );
    }

    const n = body.playerPersonIds.length;
    const base = Math.floor(remaining / n);
    const remainder = remaining - base * n;

    // Spread the cent-rounding remainder onto the first row so the
    // sum equals the invoice total exactly.
    const inserts = body.playerPersonIds.map((pid, i) => ({
      invoiceId: body.invoiceId,
      teamId: body.teamId,
      playerPersonId: pid,
      allocatedCents: i === 0 ? base + remainder : base
    }));

    const rows = await this.db
      .insert(schema.teamInvoiceSplits)
      .values(inserts)
      .returning();
    return rows.map(toDto);
  }

  @Patch(":id")
  async patch(
    @Param("id") id: string,
    @Body() body: PatchSplitBodyDto
  ): Promise<SplitDto> {
    const updateSet: Record<string, unknown> = { updatedAt: sql`now()` };
    if (body.collectedCents !== undefined) updateSet.collectedCents = body.collectedCents;
    if (body.allocatedCents !== undefined) updateSet.allocatedCents = body.allocatedCents;
    if (body.status !== undefined) updateSet.status = body.status;

    const [row] = await this.db
      .update(schema.teamInvoiceSplits)
      .set(updateSet as never)
      .where(eq(schema.teamInvoiceSplits.id, id))
      .returning();
    if (!row) throw new NotFoundException("Split not found");
    return toDto(row);
  }

  @Post(":id/remind")
  @ApiOperation({
    summary:
      "Stamp last_reminder_at. Real reminder dispatch lives in the notifications worker — this is the audit anchor for it."
  })
  async remind(@Param("id") id: string): Promise<SplitDto> {
    const [row] = await this.db
      .update(schema.teamInvoiceSplits)
      .set({ lastReminderAt: sql`now()`, updatedAt: sql`now()` })
      .where(eq(schema.teamInvoiceSplits.id, id))
      .returning();
    if (!row) throw new NotFoundException("Split not found");
    return toDto(row);
  }
}

function toDto(row: typeof schema.teamInvoiceSplits.$inferSelect): SplitDto {
  return {
    id: row.id,
    invoiceId: row.invoiceId,
    teamId: row.teamId,
    playerPersonId: row.playerPersonId,
    allocatedCents: row.allocatedCents,
    collectedCents: row.collectedCents,
    status: row.status,
    lastReminderAt: row.lastReminderAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}
