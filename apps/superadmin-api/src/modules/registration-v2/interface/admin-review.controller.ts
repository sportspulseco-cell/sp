import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiPropertyOptional,
  ApiTags
} from "@nestjs/swagger";
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID
} from "class-validator";
import { and, eq, inArray } from "drizzle-orm";
import {
  REGISTRATION_STATES,
  assertValidTransition,
  canTransition,
  isRegistrationState,
  type RegistrationState
} from "@sportspulse/kernel";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { AuthPrincipal } from "@sportspulse/auth";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { SuperAdminGuard } from "../../../shared/auth/guards/super-admin.guard";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import { EmailDispatcherService } from "../../../shared/notifications/email-dispatcher.service";

class ReviewActionBodyDto {
  @ApiPropertyOptional({
    enum: ["approve", "reject", "request_resubmission", "override_flag"]
  })
  @IsIn(["approve", "reject", "request_resubmission", "override_flag"])
  action!: "approve" | "reject" | "request_resubmission" | "override_flag";

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;

  /** Required when action = override_flag. e.g. "age_out_of_range" */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  flagKey?: string;
}

class BulkIdsDto {
  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @IsUUID("4", { each: true })
  ids!: string[];
}

class BulkRejectBodyDto extends BulkIdsDto {
  @IsString()
  reason!: string;
}

class BulkEmailBodyDto extends BulkIdsDto {
  @IsString()
  subject!: string;
  @IsString()
  body!: string;
}

class ListSubmissionsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: RegistrationState;

  /**
   * Comma-separated list of states. When present, takes precedence over
   * `status`. Drives the "needs decision" default in the admin review
   * queue (pending_review,pending_offline).
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  statuses?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  orgId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  limit?: string;
}

/**
 * Phase 5 — Admin review queue for registration v2 submissions.
 *
 * Lives alongside the v1 RegistrationsController so we can iterate on
 * the v2 state machine + bulk actions without disrupting older flows.
 * Real send for approve/reject emails goes through the global
 * EmailDispatcherService (Resend); falls back to log-only when
 * RESEND_API_KEY isn't configured.
 *
 * Audit: every successful 2xx mutation is recorded by the global
 * AuditInterceptor — no explicit emit needed here.
 */
@ApiTags("registration-v2/admin")
@ApiBearerAuth()
@Controller("registration-v2/admin")
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class AdminReviewController {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly email: EmailDispatcherService
  ) {}

  @Get("submissions")
  @ApiOperation({
    summary:
      "List submissions for the admin review queue. Filterable by state + free-text search across stored email/full name."
  })
  async list(@Query() q: ListSubmissionsQueryDto) {
    const conditions = [];
    const statusList = (q.statuses ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s): s is RegistrationState => isRegistrationState(s));
    if (statusList.length > 0) {
      conditions.push(inArray(schema.registrations.status, statusList));
    } else if (q.status && isRegistrationState(q.status)) {
      conditions.push(eq(schema.registrations.status, q.status));
    }
    if (q.orgId) {
      conditions.push(eq(schema.registrations.orgId, q.orgId));
    }
    const limit = Math.min(Math.max(Number(q.limit ?? 50) || 50, 1), 200);

    const rows = await this.db
      .select()
      .from(schema.registrations)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(schema.registrations.createdAt)
      .limit(limit);

    // Free-text search runs in app code — small N from the limit above,
    // and the metadata columns aren't indexed.
    const filtered = q.search
      ? rows.filter((r) => {
          const m = (r.metadata as Record<string, unknown>) ?? {};
          const hay =
            `${m.email ?? ""} ${m.fullName ?? ""}`.toLowerCase();
          return hay.includes(q.search!.toLowerCase());
        })
      : rows;

    return {
      items: filtered.map((r) => ({
        id: r.id,
        status: r.status,
        orgId: r.orgId,
        createdAt: r.createdAt.toISOString(),
        submittedAt: r.submittedAt?.toISOString() ?? null,
        reviewedAt: r.reviewedAt?.toISOString() ?? null,
        decisionReason: r.decisionReason ?? null,
        metadata: r.metadata
      }))
    };
  }

  @Post("submissions/:id/review")
  @ApiOperation({
    summary:
      "Apply an individual review action. approve | reject | request_resubmission | override_flag — all guarded by the kernel state machine."
  })
  async review(
    @Param("id") id: string,
    @Body() body: ReviewActionBodyDto,
    @CurrentUser() user: AuthPrincipal
  ) {
    const [row] = await this.db
      .select()
      .from(schema.registrations)
      .where(eq(schema.registrations.id, id))
      .limit(1);
    if (!row) return { id, status: null, error: "not_found" };
    if (!isRegistrationState(row.status)) {
      return { id, status: row.status, error: "invalid_state" };
    }

    const meta = (row.metadata as Record<string, unknown>) ?? {};
    const recipient = meta.email as string | undefined;

    if (body.action === "approve") {
      assertValidTransition(row.status, "approved");
      await this.db
        .update(schema.registrations)
        .set({
          status: "approved",
          reviewedAt: new Date(),
          reviewedByUserId: user.userId,
          decisionReason: body.reason ?? null,
          updatedAt: new Date()
        })
        .where(eq(schema.registrations.id, id));
      if (recipient) {
        await this.email.send({
          to: recipient,
          subject: "Your SportsPulse registration is approved",
          body: approvedBody(meta),
          channel: "registration.approved"
        });
      }
      return { id, status: "approved" as const };
    }

    if (body.action === "reject") {
      assertValidTransition(row.status, "rejected");
      await this.db
        .update(schema.registrations)
        .set({
          status: "rejected",
          reviewedAt: new Date(),
          reviewedByUserId: user.userId,
          decisionReason: body.reason ?? null,
          updatedAt: new Date()
        })
        .where(eq(schema.registrations.id, id));
      if (recipient) {
        await this.email.send({
          to: recipient,
          subject: "Your SportsPulse registration was not approved",
          body: rejectedBody(meta, body.reason ?? null),
          channel: "registration.rejected"
        });
      }
      return { id, status: "rejected" as const };
    }

    if (body.action === "request_resubmission") {
      assertValidTransition(row.status, "incomplete");
      await this.db
        .update(schema.registrations)
        .set({
          status: "incomplete",
          reviewedAt: new Date(),
          reviewedByUserId: user.userId,
          decisionReason: body.reason ?? null,
          updatedAt: new Date()
        })
        .where(eq(schema.registrations.id, id));
      if (recipient) {
        await this.email.send({
          to: recipient,
          subject: "Action required: please update your SportsPulse registration",
          body: incompleteBody(meta, body.reason ?? null),
          channel: "registration.incomplete"
        });
      }
      return { id, status: "incomplete" as const };
    }

    if (body.action === "override_flag") {
      if (!body.flagKey) {
        return { id, status: row.status, error: "flagKey_required" };
      }
      const overrides = ((meta.flagOverrides as Record<string, unknown>) ??
        {}) as Record<string, unknown>;
      overrides[body.flagKey] = {
        overriddenBy: user.userId,
        overriddenAt: new Date().toISOString(),
        justification: body.reason ?? ""
      };
      await this.db
        .update(schema.registrations)
        .set({
          metadata: { ...meta, flagOverrides: overrides },
          updatedAt: new Date()
        })
        .where(eq(schema.registrations.id, id));
      // Override doesn't transition state on its own — admin still
      // calls approve afterwards. This matches spec §8.1.
      return { id, status: row.status, flagOverridden: body.flagKey };
    }

    return { id, status: row.status, error: "unknown_action" };
  }

  @Post("submissions/bulk-approve")
  @ApiOperation({
    summary:
      "Approve many submissions at once. Accepts rows in pending_review or pending_offline; skips others."
  })
  async bulkApprove(
    @Body() body: BulkIdsDto,
    @CurrentUser() user: AuthPrincipal
  ) {
    return this.bulkTransition(
      body.ids,
      "approved",
      user.userId,
      null,
      "registration.approved",
      (meta) => ({
        subject: "Your SportsPulse registration is approved",
        body: approvedBody(meta)
      })
    );
  }

  @Post("submissions/bulk-reject")
  @ApiOperation({
    summary:
      "Reject many submissions with a single shared reason. Accepts rows in pending_review or pending_offline; skips others."
  })
  async bulkReject(
    @Body() body: BulkRejectBodyDto,
    @CurrentUser() user: AuthPrincipal
  ) {
    return this.bulkTransition(
      body.ids,
      "rejected",
      user.userId,
      body.reason,
      "registration.rejected",
      (meta) => ({
        subject: "Your SportsPulse registration was not approved",
        body: rejectedBody(meta, body.reason)
      })
    );
  }

  @Post("submissions/bulk-email")
  @ApiOperation({
    summary:
      "Send a custom email to many submissions at once. Does not change state — purely a comms action."
  })
  async bulkEmail(@Body() body: BulkEmailBodyDto) {
    const rows = await this.db
      .select()
      .from(schema.registrations)
      .where(inArray(schema.registrations.id, body.ids));
    let delivered = 0;
    let logOnly = 0;
    for (const r of rows) {
      const meta = (r.metadata as Record<string, unknown>) ?? {};
      const recipient = meta.email as string | undefined;
      if (!recipient) continue;
      const res = await this.email.send({
        to: recipient,
        subject: body.subject,
        body: body.body,
        channel: "registration.bulk_email"
      });
      if (res.delivered) delivered++;
      else logOnly++;
    }
    return { matched: rows.length, delivered, logOnly };
  }

  // ---------- internals ----------

  private async bulkTransition(
    ids: string[],
    target: "approved" | "rejected",
    reviewerUserId: string,
    reason: string | null,
    channel: string,
    renderEmail: (meta: Record<string, unknown>) => {
      subject: string;
      body: string;
    }
  ) {
    const rows = await this.db
      .select()
      .from(schema.registrations)
      .where(inArray(schema.registrations.id, ids));
    let applied = 0;
    let skipped = 0;
    let emailDelivered = 0;
    for (const r of rows) {
      // Bulk approve/reject accepts any state that legally transitions
      // to the target — currently pending_review + pending_offline.
      if (!isRegistrationState(r.status)) {
        skipped++;
        continue;
      }
      if (!canTransition(r.status, target)) {
        skipped++;
        continue;
      }
      assertValidTransition(r.status, target);
      await this.db
        .update(schema.registrations)
        .set({
          status: target,
          reviewedAt: new Date(),
          reviewedByUserId: reviewerUserId,
          decisionReason: reason,
          updatedAt: new Date()
        })
        .where(eq(schema.registrations.id, r.id));
      applied++;
      const meta = (r.metadata as Record<string, unknown>) ?? {};
      const recipient = meta.email as string | undefined;
      if (recipient) {
        const rendered = renderEmail(meta);
        const res = await this.email.send({
          to: recipient,
          subject: rendered.subject,
          body: rendered.body,
          channel
        });
        if (res.delivered) emailDelivered++;
      }
    }
    return { matched: rows.length, applied, skipped, emailDelivered };
  }
}

function approvedBody(meta: Record<string, unknown>): string {
  const name = ((meta.fullName as string | undefined)?.split(" ")[0]) ?? "there";
  return [
    `Hi ${name},`,
    ``,
    `Your SportsPulse registration was approved. You're on the roster — ` +
      `we'll see you on the ice.`,
    ``,
    `Sign in to view your team page, schedule, and any next steps.`,
    ``,
    `— SportsPulse`
  ].join("\n");
}

function rejectedBody(
  meta: Record<string, unknown>,
  reason: string | null
): string {
  const name = ((meta.fullName as string | undefined)?.split(" ")[0]) ?? "there";
  return [
    `Hi ${name},`,
    ``,
    `Unfortunately your SportsPulse registration wasn't approved this time.`,
    reason ? `Reason: ${reason}` : `Your league admin will reach out with details.`,
    ``,
    `If you've already paid, a refund is in flight per the league's refund policy.`,
    ``,
    `— SportsPulse`
  ].join("\n");
}

function incompleteBody(
  meta: Record<string, unknown>,
  reason: string | null
): string {
  const name = ((meta.fullName as string | undefined)?.split(" ")[0]) ?? "there";
  return [
    `Hi ${name},`,
    ``,
    `Your SportsPulse registration needs a small update before we can approve it.`,
    reason ? `Admin's note: ${reason}` : ``,
    ``,
    `Open the registration link you used originally with the same email — ` +
      `we've reopened the form so you can update + resubmit.`,
    ``,
    `— SportsPulse`
  ].join("\n");
}

// Suppress unused-import warning when REGISTRATION_STATES is only used
// for type narrowing above.
void REGISTRATION_STATES;
