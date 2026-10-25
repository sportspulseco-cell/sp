import {
  Body,
  Controller,
  Inject,
  Logger,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length
} from "class-validator";
import { eq } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { AuthPrincipal } from "@sportspulse/auth";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import { userIsCaptainOfTeam } from "../../../shared/auth/captain";
import { NotificationService } from "../../communications/application/notification.service";
import {
  ANNOUNCEMENT_CHANNELS,
  resolveAnnouncementRecipients,
  sendAnnouncement,
  type AnnouncementChannel
} from "../../../shared/audience/announcements";

/** Who a captain can write to: their own team only. */
const TEAM_AUDIENCES = ["players", "captains", "coaches"] as const;
type TeamAudience = (typeof TEAM_AUDIENCES)[number];

class TeamMessageBodyDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(TEAM_AUDIENCES as unknown as string[], { each: true })
  audiences!: TeamAudience[];
  @IsString() @Length(1, 200) subject!: string;
  @IsString() @Length(1, 5000) body!: string;
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(ANNOUNCEMENT_CHANNELS as unknown as string[], { each: true })
  channels!: AnnouncementChannel[];
  /** One key per composed message; a retry with the same key sends nothing new. */
  @IsOptional() @IsUUID() idempotencyKey?: string;
}

/**
 * Captain's team message (UC-20, MON-12). The captain writes to their
 * team's rostered players, captains and coaches, by email and/or in the
 * app. Same delivery path as the league announcement: the server
 * resolves recipients from the team (never from the client), one
 * notification per person per channel, idempotent on the message key.
 * A team the caller does not captain is a 404.
 */
@ApiTags("captain/message")
@ApiBearerAuth()
@Controller("captain/teams")
@UseGuards(JwtAuthGuard)
export class CaptainMessageController {
  private readonly log = new Logger("CaptainMessage");

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly notify: NotificationService
  ) {}

  @Post(":teamId/message")
  @ApiOperation({
    summary:
      "Captain writes to their team (players, captains, coaches) by email and/or in-app. Recipients resolved on the server from the team. Idempotent on idempotencyKey."
  })
  async message(
    @Param("teamId", ParseUUIDPipe) teamId: string,
    @Body() body: TeamMessageBodyDto,
    @CurrentUser() user: AuthPrincipal
  ) {
    if (!(await userIsCaptainOfTeam(this.db, user.userId, teamId))) {
      throw new NotFoundException(`Team not found: ${teamId}`);
    }
    const [team] = await this.db
      .select({ orgId: schema.teams.orgId, name: schema.teams.name })
      .from(schema.teams)
      .where(eq(schema.teams.id, teamId))
      .limit(1);
    if (!team) throw new NotFoundException(`Team not found: ${teamId}`);

    const audiences = Array.from(new Set(body.audiences));
    const channels = Array.from(new Set(body.channels));
    return sendAnnouncement(this.db, this.notify, this.log, {
      orgId: team.orgId,
      idempotencyKey: body.idempotencyKey,
      channels,
      recipients: () =>
        resolveAnnouncementRecipients(
          this.db,
          { teamIds: [teamId], leagueIds: [], seasonIds: [], divisionIds: [] },
          team.orgId,
          audiences
        ),
      payload: {
        // The team name leads the subject so players know who wrote.
        subject: `${team.name}: ${body.subject}`,
        body: body.body,
        teamId,
        fromUserId: user.userId,
        audiences
      },
      sourceEvent: "team.message",
      describe: `team=${teamId} by=${user.userId} audiences=${audiences.join(",")}`
    });
  }
}
