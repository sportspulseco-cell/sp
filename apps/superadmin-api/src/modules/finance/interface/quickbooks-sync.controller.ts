import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { and, desc, eq } from "drizzle-orm";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min
} from "class-validator";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { SuperAdminGuard } from "../../../shared/auth/guards/super-admin.guard";

class ListSyncQueryDto {
  @IsOptional() @IsUUID() orgId?: string;
  @IsOptional() @IsIn(["invoice", "payment", "refund", "credit_memo"])
  entityType?: string;
  @IsOptional() @IsUUID() entityId?: string;
  @IsOptional() @IsIn(["queued", "syncing", "succeeded", "failed"])
  status?: string;
  @IsOptional() @IsInt() @Min(1) limit?: number;
}

class LogSyncBodyDto {
  @IsUUID() orgId!: string;
  @IsIn(["invoice", "payment", "refund", "credit_memo"]) entityType!: string;
  @IsUUID() entityId!: string;
  @IsOptional() @IsString() qbId?: string;
  @IsOptional() @IsIn(["create", "update", "delete"]) action?: string;
  @IsIn(["queued", "syncing", "succeeded", "failed"]) status!: string;
  @IsOptional() @IsString() @MaxLength(200) summary?: string;
  @IsOptional() @IsString() @MaxLength(2000) errorMessage?: string;
}

interface SyncLogDto {
  id: string;
  orgId: string;
  entityType: string;
  entityId: string;
  qbId: string | null;
  action: string;
  status: string;
  summary: string | null;
  errorMessage: string | null;
  attemptedAt: string;
  createdAt: string;
}

interface SyncStatusDto {
  /** Whether QB OAuth is connected for this org. Stub today — real wiring comes with the Intuit integration ticket. */
  connected: boolean;
  lastSyncAt: string | null;
  errorCount24h: number;
  recentEvents: SyncLogDto[];
}

/**
 * QuickBooks sync log + status footer. Real OAuth + push integration
 * is a separate ticket (Intuit OAuth2 + webhook ingest); this surface
 * shows whatever the worker has logged so far.
 */
@ApiTags("finance/quickbooks")
@ApiBearerAuth()
@Controller("finance/quickbooks-sync")
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class FinanceQuickbooksSyncController {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @Get()
  async list(@Query() q: ListSyncQueryDto): Promise<SyncLogDto[]> {
    const conditions = [];
    if (q.orgId) conditions.push(eq(schema.quickbooksSyncLogs.orgId, q.orgId));
    if (q.entityType)
      conditions.push(eq(schema.quickbooksSyncLogs.entityType, q.entityType));
    if (q.entityId)
      conditions.push(eq(schema.quickbooksSyncLogs.entityId, q.entityId));
    if (q.status) conditions.push(eq(schema.quickbooksSyncLogs.status, q.status));

    const rows = await this.db
      .select()
      .from(schema.quickbooksSyncLogs)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(schema.quickbooksSyncLogs.attemptedAt))
      .limit(Math.min(q.limit ?? 50, 200));

    return rows.map(toDto);
  }

  @Get("status")
  @ApiOperation({
    summary:
      "Aggregate sync status for an org — drives the 'QuickBooks synced · 2 min ago' header indicator."
  })
  async status(@Query("orgId") orgId: string): Promise<SyncStatusDto> {
    const recentRows = orgId
      ? await this.db
          .select()
          .from(schema.quickbooksSyncLogs)
          .where(eq(schema.quickbooksSyncLogs.orgId, orgId))
          .orderBy(desc(schema.quickbooksSyncLogs.attemptedAt))
          .limit(10)
      : [];

    const lastSyncAt =
      recentRows.find((r) => r.status === "succeeded")?.attemptedAt ?? null;

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const errorCount = recentRows.filter(
      (r) => r.status === "failed" && r.attemptedAt >= since24h
    ).length;

    return {
      connected: recentRows.length > 0, // Placeholder — replace with real OAuth state lookup once wired.
      lastSyncAt: lastSyncAt?.toISOString() ?? null,
      errorCount24h: errorCount,
      recentEvents: recentRows.map(toDto)
    };
  }

  @Post("log")
  @ApiOperation({
    summary:
      "Append a sync-log row. Called by the QB worker after each push. Surfaced verbatim in the Recent sync events list."
  })
  async log(@Body() body: LogSyncBodyDto): Promise<SyncLogDto> {
    const [row] = await this.db
      .insert(schema.quickbooksSyncLogs)
      .values({
        orgId: body.orgId,
        entityType: body.entityType,
        entityId: body.entityId,
        qbId: body.qbId ?? null,
        action: body.action ?? "create",
        status: body.status,
        summary: body.summary ?? null,
        errorMessage: body.errorMessage ?? null
      })
      .returning();
    return toDto(row!);
  }
}

function toDto(row: typeof schema.quickbooksSyncLogs.$inferSelect): SyncLogDto {
  return {
    id: row.id,
    orgId: row.orgId,
    entityType: row.entityType,
    entityId: row.entityId,
    qbId: row.qbId,
    action: row.action,
    status: row.status,
    summary: row.summary,
    errorMessage: row.errorMessage,
    attemptedAt: row.attemptedAt.toISOString(),
    createdAt: row.createdAt.toISOString()
  };
}
