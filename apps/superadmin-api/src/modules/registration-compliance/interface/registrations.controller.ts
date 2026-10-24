import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
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
import { userIsPeopleAdmin } from "../../../shared/auth/org-admin";
import { ScopedAdminGuard } from "../../../shared/auth/guards/scoped-admin.guard";
import { UserScope } from "../../../shared/auth/decorators/user-scope.decorator";
import type { UserScope as UserScopeType } from "../../../shared/auth/scope";
import { orgVisible, registrationVisible, visibleRegistrationsWhere } from "../../../shared/auth/visibility";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import type { Database } from "@sportspulse/db";
import { resolveEntityNames } from "../../../shared/display/entity-names";
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

  // Read by the shared forms-builder Submissions tab in both admin apps
  // and by the admin console registrations page. Scoped admins (org /
  // league / season / division) see the registrations inside their
  // scope; nobody else sees the list. Writes stay super_admin.
  @Get() async list(
    @Query() q: ListRegistrationsQueryDto,
    @CurrentUser() user: AuthPrincipal
  ): Promise<RegistrationPageDto> {
    const scope = await loadUserScope(this.db, user.userId);
    if (!scope.isSuperAdmin) {
      if (!(await userIsPeopleAdmin(this.db, user.userId))) {
        throw new ForbiddenException(
          "Requires an admin role (org, league, season or division admin)."
        );
      }
      if (q.orgId && !orgVisible(scope, q.orgId)) {
        throw new ForbiddenException("That organisation is outside the scope of your role.");
      }
    }
    const page = await this.listH.execute({ ...q, visibleTo: scope });
    // Add subjectName + teamName so screens never print raw ids.
    const names = await resolveEntityNames(this.db, [
      ...page.items.map((r) => ({ type: "person", id: r.subjectPersonId })),
      ...page.items.map((r) => ({ type: "team", id: r.teamId }))
    ]);
    return {
      ...page,
      items: page.items.map((r) => ({
        ...r,
        subjectName: names.get(`person:${r.subjectPersonId}`) ?? null,
        teamName: r.teamId ? names.get(`team:${r.teamId}`) ?? null : null
      }))
    };
  }
  @Get(":id") @UseGuards(ScopedAdminGuard) async getOne(
    @Param("id") id: string,
    @UserScope() scope: UserScopeType
  ): Promise<RegistrationDto> {
    if (!(await registrationVisible(this.db, scope, id))) throw new NotFoundException("Registration not found");
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
