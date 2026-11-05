import { Body, Controller, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsBoolean, IsIn, IsInt, IsObject, IsUUID, Matches, Max, Min } from "class-validator";
import { SEASON_REGISTRATION_TYPES, type SeasonRegistrationType, type FormDefinition } from "@sportspulse/kernel";
import type { AuthPrincipal } from "@sportspulse/auth";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { ScopedAdminGuard } from "../../../shared/auth/guards/scoped-admin.guard";
import { AllowScopedWrite } from "../../../shared/auth/decorators/allow-scoped-write.decorator";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import { PrepareRegistrationService } from "../application/prepare-registration.service";

class PrepareRegistrationBody {
  @IsUUID() requestId!: string;
  @IsIn([...SEASON_REGISTRATION_TYPES]) registrationType!: SeasonRegistrationType;
  @IsInt() @Min(0) @Max(99999999) playerPriceCents!: number;
  @IsBoolean() teamFeeEnabled!: boolean;
  @IsInt() @Min(0) @Max(99999999) teamPriceCents!: number;
  @Matches(/^[A-Z]{3}$/) currency!: string;
  @IsBoolean() requireUsaHockeyId!: boolean;
  @IsObject() formDefinition!: FormDefinition;
  @IsBoolean() publish!: boolean;
  @IsBoolean() reviewConfirmed!: boolean;
}

@ApiTags("registration-v2/seasons") @ApiBearerAuth()
@Controller("registration-v2/seasons") @UseGuards(JwtAuthGuard, ScopedAdminGuard)
export class PrepareRegistrationController {
  constructor(private readonly setup: PrepareRegistrationService) {}
  @Post(":id/registration-setup") @AllowScopedWrite()
  @ApiOperation({ summary: "Prepare a draft season's form and prices, then optionally publish registration in one replay-safe transaction." })
  async prepare(@Param("id", new ParseUUIDPipe()) seasonId: string, @Body() body: PrepareRegistrationBody, @CurrentUser() user: AuthPrincipal) {
    return this.setup.execute({ ...body, seasonId }, user.userId);
  }
}
