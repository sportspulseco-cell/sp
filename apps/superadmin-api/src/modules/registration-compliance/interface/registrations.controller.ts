import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
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
import { loadUserScope } from "../../../shared/auth/scope";
import { userHasOrgAdminOnOrg } from "../../../shared/auth/org-admin";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import type { Database } from "@sportspulse/db";
import {
  RegistrationDto,
  RegistrationPageDto
} from "../application/dtos/registration.dto";
import {
  CreateRegistrationHandler,
  GetRegistrationHandler,
  ListRegistrationsHandler,
  ReviewRegistrationHandler,
  SubmitRegistrationHandler,
  WithdrawRegistrationHandler
} from "../application/registrations/handlers";
import {
  CreateRegistrationBodyDto,
  ListRegistrationsQueryDto,
  ReviewRegistrationBodyDto,
  WithdrawRegistrationBodyDto
} from "./dto/registration.dto";

@ApiTags("registration/registrations")
@ApiBearerAuth()
@Controller("registration/registrations")
@UseGuards(JwtAuthGuard)
export class RegistrationsController {
  constructor(
    private readonly listH: ListRegistrationsHandler,
    private readonly getH: GetRegistrationHandler,
    private readonly createH: CreateRegistrationHandler,
    private readonly submitH: SubmitRegistrationHandler,
    private readonly reviewH: ReviewRegistrationHandler,
    private readonly withdrawH: WithdrawRegistrationHandler,
    @Inject(DRIZZLE) private readonly db: Database
  ) {}

  // Read by the shared forms-builder Submissions tab in both admin apps;
  // org admins may list their own org (it was super_admin only, so the
  // org-admin tab was always empty). Everything else stays super_admin.
  @Get() async list(
    @Query() q: ListRegistrationsQueryDto,
    @CurrentUser() user: AuthPrincipal
  ): Promise<RegistrationPageDto> {
    const scope = await loadUserScope(this.db, user.userId);
    if (!scope.isSuperAdmin) {
      if (!q.orgId || !(await userHasOrgAdminOnOrg(this.db, user.userId, q.orgId))) {
        throw new ForbiddenException("Requires super_admin, or org_admin on the requested orgId.");
      }
    }
    return this.listH.execute(q);
  }
  @Get(":id") @UseGuards(SuperAdminGuard) getOne(@Param("id") id: string): Promise<RegistrationDto> {
    return this.getH.execute({ id });
  }
  @UseGuards(SuperAdminGuard)
  @Post() create(
    @Body() body: CreateRegistrationBodyDto,
    @CurrentUser() user: AuthPrincipal
  ): Promise<RegistrationDto> {
    return this.createH.execute({
      ...body,
      submittedByUserId: user.userId,
      items: body.items?.map((i) => ({
        fieldKey: i.fieldKey,
        value: i.value,
        encrypted: !!i.encrypted
      }))
    });
  }
  @UseGuards(SuperAdminGuard)
  @Post(":id/submit") submit(@Param("id") id: string): Promise<RegistrationDto> {
    return this.submitH.execute({ id });
  }
  @UseGuards(SuperAdminGuard)
  @Post(":id/review") @ApiOperation({ summary: "Review a registration" })
  review(
    @Param("id") id: string,
    @Body() body: ReviewRegistrationBodyDto,
    @CurrentUser() user: AuthPrincipal
  ): Promise<RegistrationDto> {
    return this.reviewH.execute({
      id,
      action: body.action,
      reason: body.reason,
      reviewerId: user.userId
    });
  }
  @UseGuards(SuperAdminGuard)
  @Post(":id/withdraw") withdraw(
    @Param("id") id: string,
    @Body() body: WithdrawRegistrationBodyDto
  ): Promise<RegistrationDto> {
    return this.withdrawH.execute({ id, reason: body.reason });
  }
}
