import {
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
import { and, desc, eq, sql } from "drizzle-orm";
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min
} from "class-validator";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { AuthPrincipal } from "@sportspulse/auth";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { SuperAdminGuard } from "../../../shared/auth/guards/super-admin.guard";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";

class PatchEscalationBodyDto {
  @IsOptional() @IsInt() @Min(1) @Max(3) level?: number;
  @IsOptional() @IsBoolean() lockSuspended?: boolean;
  @IsOptional() @IsDateString() extendedDueAt?: string | null;
  @IsOptional() @IsIn(["mark_paid", "message", "extend", "suppress", "waive_flag"])
  lastActionKind?: string;
}

class ListEscalationsQueryDto {
  @IsOptional() @IsUUID() orgId?: string;
  @IsOptional() @IsBoolean() lockSuspended?: boolean;
}

class LogReminderBodyDto {
  @IsUUID() escalationId!: string;
  @IsUUID() invoiceId!: string;
  @IsOptional() @IsIn(["email", "sms", "in_app"]) channel?: string;
  @IsOptional() @IsString() @MaxLength(120) templateCode?: string;
  @IsOptional() @IsIn(["queued", "sent", "failed"]) status?: string;
  @IsOptional() @IsString() @MaxLength(2000) errorMessage?: string;
}

interface EscalationDto {
  id: string;
  invoiceId: string;
  level: number;
  remindersSent: number;
  lastReminderAt: string | null;
  nextReminderAt: string | null;
  lockSuspended: boolean;
  flagWaivedAt: string | null;
  flagWaivedByUserId: string | null;
  extendedDueAt: string | null;
  lastActionAt: string | null;
  lastActionByUserId: string | null;
  lastActionKind: string | null;
  createdAt: string;
  updatedAt: string;
}

interface EscalationWithInvoiceDto extends EscalationDto {
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

/**
 * Overdue escalation queue. Reads return rows joined with invoice
 * snapshot fields needed for the queue UI (number, totals, dueAt).
 *
 * The reminder dispatch worker is a separate ticket — this controller
 * exposes the data + admin overrides (waive flag, extend due date,
 * mark paid passes through to recordPayment on the existing finance
 * controller).
 */
@ApiTags("finance/escalations")
@ApiBearerAuth()
@Controller("finance/escalations")
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class FinanceEscalationsController {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @Get()
  async list(
    @Query() q: ListEscalationsQueryDto
  ): Promise<EscalationWithInvoiceDto[]> {
    const conditions = [];
    if (q.orgId) conditions.push(eq(schema.invoices.orgId, q.orgId));
    if (q.lockSuspended !== undefined) {
      conditions.push(eq(schema.invoiceEscalations.lockSuspended, q.lockSuspended));
    }

    const rows = await this.db
      .select({
        esc: schema.invoiceEscalations,
        invoice: {
          id: schema.invoices.id,
          invoiceNumber: schema.invoices.invoiceNumber,
          totalCents: schema.invoices.totalCents,
          paidCents: schema.invoices.paidCents,
          currency: schema.invoices.currency,
          dueAt: schema.invoices.dueAt,
          recipientPersonId: schema.invoices.recipientPersonId
        }
      })
      .from(schema.invoiceEscalations)
      .innerJoin(
        schema.invoices,
        eq(schema.invoices.id, schema.invoiceEscalations.invoiceId)
      )
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(schema.invoiceEscalations.level), desc(schema.invoiceEscalations.remindersSent))
      .limit(200);

    return rows.map((r) => ({
      ...escalationToDto(r.esc),
      invoice: {
        ...r.invoice,
        dueAt: r.invoice.dueAt?.toISOString() ?? null
      }
    }));
  }

  @Patch(":id")
  @ApiOperation({
    summary:
      "Patch escalation row. Use lockSuspended=false to waive the auto-suspension flag; extend by setting extendedDueAt; record any admin action via lastActionKind."
  })
  async patch(
    @Param("id") id: string,
    @Body() body: PatchEscalationBodyDto,
    @CurrentUser() user: AuthPrincipal
  ): Promise<EscalationDto> {
    const updateSet: Record<string, unknown> = {
      lastActionAt: sql`now()`,
      lastActionByUserId: user.userId,
      updatedAt: sql`now()`
    };
    if (body.level !== undefined) updateSet.level = body.level;
    if (body.lockSuspended !== undefined) {
      updateSet.lockSuspended = body.lockSuspended;
      // When admin waives the flag, also stamp the waiver fields.
      if (body.lockSuspended === false) {
        updateSet.flagWaivedAt = sql`now()`;
        updateSet.flagWaivedByUserId = user.userId;
      }
    }
    if (body.extendedDueAt !== undefined) {
      updateSet.extendedDueAt = body.extendedDueAt
        ? new Date(body.extendedDueAt)
        : null;
    }
    if (body.lastActionKind !== undefined) {
      updateSet.lastActionKind = body.lastActionKind;
    }

    const [row] = await this.db
      .update(schema.invoiceEscalations)
      .set(updateSet as never)
      .where(eq(schema.invoiceEscalations.id, id))
      .returning();
    if (!row) throw new NotFoundException("Escalation not found");
    return escalationToDto(row);
  }

  @Post("ensure")
  @ApiOperation({
    summary:
      "Ensure an escalation row exists for an invoice (idempotent). Used when an invoice flips to overdue."
  })
  async ensure(
    @Body() body: { invoiceId: string }
  ): Promise<EscalationDto> {
    const [existing] = await this.db
      .select()
      .from(schema.invoiceEscalations)
      .where(eq(schema.invoiceEscalations.invoiceId, body.invoiceId))
      .limit(1);
    if (existing) return escalationToDto(existing);

    const [created] = await this.db
      .insert(schema.invoiceEscalations)
      .values({ invoiceId: body.invoiceId })
      .returning();
    return escalationToDto(created!);
  }

  @Post("log-reminder")
  @ApiOperation({
    summary:
      "Append a reminder log entry + bump remindersSent + stamp lastReminderAt on the escalation."
  })
  async logReminder(@Body() body: LogReminderBodyDto): Promise<{ ok: true }> {
    await this.db.transaction(async (tx) => {
      await tx.insert(schema.overdueReminderLog).values({
        escalationId: body.escalationId,
        invoiceId: body.invoiceId,
        channel: body.channel ?? "email",
        templateCode: body.templateCode ?? null,
        status: body.status ?? "sent",
        errorMessage: body.errorMessage ?? null
      });
      // Only bump counters when the dispatch actually succeeded.
      if ((body.status ?? "sent") === "sent") {
        await tx
          .update(schema.invoiceEscalations)
          .set({
            remindersSent: sql`${schema.invoiceEscalations.remindersSent} + 1`,
            lastReminderAt: sql`now()`,
            updatedAt: sql`now()`
          })
          .where(eq(schema.invoiceEscalations.id, body.escalationId));
      }
    });
    return { ok: true };
  }
}

function escalationToDto(
  row: typeof schema.invoiceEscalations.$inferSelect
): EscalationDto {
  return {
    id: row.id,
    invoiceId: row.invoiceId,
    level: row.level,
    remindersSent: row.remindersSent,
    lastReminderAt: row.lastReminderAt?.toISOString() ?? null,
    nextReminderAt: row.nextReminderAt?.toISOString() ?? null,
    lockSuspended: row.lockSuspended,
    flagWaivedAt: row.flagWaivedAt?.toISOString() ?? null,
    flagWaivedByUserId: row.flagWaivedByUserId,
    extendedDueAt: row.extendedDueAt?.toISOString() ?? null,
    lastActionAt: row.lastActionAt?.toISOString() ?? null,
    lastActionByUserId: row.lastActionByUserId,
    lastActionKind: row.lastActionKind,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}
