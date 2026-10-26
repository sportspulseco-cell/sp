import { Body, Controller, Inject, Logger, Post, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import {
  FREE_AGENT_OFFER_SOURCE,
  INVITE_AUTO_REMINDER_AFTER_DAYS,
  INVITE_LOCK_REMINDER_HOURS,
  inviteAutoReminderDue
} from "@sportspulse/kernel";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { CronSecretGuard } from "../../../shared/auth/guards/cron-secret.guard";
import { playerWebUrl } from "../../../shared/app-urls";
import { NotificationService } from "../../communications/application/notification.service";
import { buildTeamInvitePayload } from "../../communications/domain/templates/team-invite-payload";

/**
 * UC-04 alternative flow / FR-3.4.4: "Player ignores invite -> Reminder
 * sent before roster deadline". pg_cron (migration 0075) calls this
 * hourly. A pending personal invite gets at most two automatic
 * reminders: one after INVITE_AUTO_REMINDER_AFTER_DAYS days, one in the
 * INVITE_LOCK_REMINDER_HOURS before the season's roster lock. Each is
 * claimed on the invite row (metadata.autoReminders.<kind>) before the
 * email is queued, and the notice is idempotent on the invite and kind,
 * so overlapping runs send once. Free-agent offers have their own expiry
 * and are left out.
 */
@ApiTags("captain/cron")
@Controller("captain/roster-cron")
export class InviteRemindersCronController {
  private readonly log = new Logger(InviteRemindersCronController.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly notify: NotificationService,
    private readonly config: ConfigService
  ) {}

  @Post("invite-reminders")
  @UseGuards(CronSecretGuard)
  @ApiOperation({
    summary:
      "Hourly: one automatic reminder for a personal team invite still pending after 3 days, and one in the 48 hours before the roster lock. Idempotent per invite and reminder."
  })
  async run(
    @Body() body?: { teamIds?: string[] }
  ): Promise<{ candidates: number; sent: number; byKind: Record<string, number> }> {
    // teamIds narrows a run to some teams (verification on shared data);
    // pg_cron sends {} and sweeps every team.
    const teamIds = Array.isArray(body?.teamIds) ? body!.teamIds.filter((t) => typeof t === "string") : null;
    return this.sweep(new Date(), teamIds);
  }

  async sweep(now: Date, teamIds: string[] | null = null) {
    const rows = await this.db
      .select({
        id: schema.teamInvites.id,
        token: schema.teamInvites.token,
        email: schema.teamInvites.inviteeEmail,
        status: schema.teamInvites.status,
        createdAt: schema.teamInvites.createdAt,
        expiresAt: schema.teamInvites.expiresAt,
        metadata: schema.teamInvites.metadata,
        seasonId: schema.teamInvites.seasonId,
        seasonName: schema.seasons.name,
        rosterLockAt: schema.seasons.rosterLockAt,
        teamName: schema.teams.name,
        orgId: schema.teams.orgId
      })
      .from(schema.teamInvites)
      .innerJoin(schema.teams, eq(schema.teams.id, schema.teamInvites.teamId))
      .innerJoin(schema.seasons, eq(schema.seasons.id, schema.teamInvites.seasonId))
      .where(
        and(
          eq(schema.teamInvites.kind, "personal"),
          teamIds ? inArray(schema.teamInvites.teamId, teamIds.length ? teamIds : ["00000000-0000-0000-0000-000000000000"]) : undefined,
          inArray(schema.teamInvites.status, ["pending", "extended"]),
          sql`${schema.teamInvites.inviteeEmail} IS NOT NULL`,
          sql`(${schema.teamInvites.expiresAt} IS NULL OR ${schema.teamInvites.expiresAt} > now())`,
          sql`coalesce(${schema.teamInvites.metadata}->>'source', '') <> ${FREE_AGENT_OFFER_SOURCE}`
        )
      );
    const byKind: Record<string, number> = { after_days: 0, before_lock: 0 };
    let sent = 0;
    for (const r of rows) {
      const meta = (r.metadata as Record<string, unknown> | null) ?? {};
      const done = (meta.autoReminders as Record<string, string> | undefined) ?? {};
      const kind = inviteAutoReminderDue(
        { createdAt: r.createdAt, rosterLockAt: r.rosterLockAt, sent: Object.keys(done) },
        now
      );
      if (!kind) continue;
      // Claim: only one run writes the flag.
      const claimed = await this.db
        .update(schema.teamInvites)
        .set({
          metadata: sql`jsonb_set(coalesce(${schema.teamInvites.metadata}, '{}'::jsonb), '{autoReminders}', coalesce(${schema.teamInvites.metadata}->'autoReminders', '{}'::jsonb) || ${JSON.stringify({ [kind]: now.toISOString() })}::jsonb)`,
          updatedAt: now
        })
        .where(
          and(
            eq(schema.teamInvites.id, r.id),
            sql`NOT (coalesce(${schema.teamInvites.metadata}->'autoReminders', '{}'::jsonb) ? ${kind})`
          )
        )
        .returning({ id: schema.teamInvites.id });
      if (claimed.length !== 1) continue;
      await this.notify.queue({
        orgId: r.orgId,
        templateCode: "INVITE_REMINDER_1",
        idempotencyKey: `invite-auto-remind-${r.id}-${kind}`,
        recipientEmail: r.email!,
        payload: buildTeamInvitePayload({
          teamName: r.teamName,
          seasonName: r.seasonName,
          seasonId: r.seasonId,
          token: r.token,
          expiresAt: r.expiresAt,
          playerWebUrl: playerWebUrl(this.config)
        })
      });
      byKind[kind] = (byKind[kind] ?? 0) + 1;
      sent++;
    }
    this.log.log(
      `invite reminders: candidates=${rows.length} sent=${sent} after_days=${byKind.after_days} before_lock=${byKind.before_lock} (after ${INVITE_AUTO_REMINDER_AFTER_DAYS}d, lock window ${INVITE_LOCK_REMINDER_HOURS}h)`
    );
    return { candidates: rows.length, sent, byKind };
  }
}
