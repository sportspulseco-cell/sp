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
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class RegistrationsController {
  constructor(
    private readonly listH: ListRegistrationsHandler,
    private readonly getH: GetRegistrationHandler,
    private readonly createH: CreateRegistrationHandler,
    private readonly submitH: SubmitRegistrationHandler,
    private readonly reviewH: ReviewRegistrationHandler,
    private readonly withdrawH: WithdrawRegistrationHandler
  ) {}

  @Get() list(@Query() q: ListRegistrationsQueryDto): Promise<RegistrationPageDto> {
    return this.listH.execute(q);
  }
  @Get(":id") getOne(@Param("id") id: string): Promise<RegistrationDto> {
    return this.getH.execute({ id });
  }
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
  @Post(":id/submit") submit(@Param("id") id: string): Promise<RegistrationDto> {
    return this.submitH.execute({ id });
  }
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
  @Post(":id/withdraw") withdraw(
    @Param("id") id: string,
    @Body() body: WithdrawRegistrationBodyDto
  ): Promise<RegistrationDto> {
    return this.withdrawH.execute({ id, reason: body.reason });
  }
}
