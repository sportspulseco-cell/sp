import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { AuthPrincipal } from "@sportspulse/auth";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { SuperAdminGuard } from "../../../shared/auth/guards/super-admin.guard";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import {
  SuspensionDto,
  SuspensionPageDto
} from "../application/dtos/game.dto";
import {
  IssueSuspensionHandler,
  LiftSuspensionHandler,
  ListSuspensionsHandler,
  ServeSuspensionHandler
} from "../application/suspensions/handlers";
import {
  IssueSuspensionBodyDto,
  LiftSuspensionBodyDto,
  ListSuspensionsQueryDto
} from "./dto/game.dto";

@ApiTags("game-operations/suspensions")
@ApiBearerAuth()
@Controller("suspensions")
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class SuspensionsController {
  constructor(
    private readonly listH: ListSuspensionsHandler,
    private readonly issueH: IssueSuspensionHandler,
    private readonly liftH: LiftSuspensionHandler,
    private readonly serveH: ServeSuspensionHandler
  ) {}

  @Get() list(
    @Query() q: ListSuspensionsQueryDto
  ): Promise<SuspensionPageDto> {
    return this.listH.execute(q);
  }
  @Post() @ApiOperation({ summary: "Issue a suspension" })
  issue(
    @Body() body: IssueSuspensionBodyDto,
    @CurrentUser() user: AuthPrincipal
  ): Promise<SuspensionDto> {
    return this.issueH.execute({ ...body, issuedByUserId: user.userId });
  }
  @Post(":id/lift") lift(
    @Param("id") id: string,
    @Body() body: LiftSuspensionBodyDto
  ): Promise<SuspensionDto> {
    return this.liftH.execute({ id, reason: body.reason });
  }
  @Post(":id/serve") @ApiOperation({ summary: "Mark one game served" })
  serve(@Param("id") id: string): Promise<SuspensionDto> {
    return this.serveH.execute({ id });
  }
}
