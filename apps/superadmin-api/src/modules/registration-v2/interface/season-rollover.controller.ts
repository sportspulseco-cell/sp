import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ApiProperty } from "@nestjs/swagger";
import { IsUUID } from "class-validator";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { SuperAdminGuard } from "../../../shared/auth/guards/super-admin.guard";
import { RegistrationV2Service } from "../application/registration-v2.service";

class RolloverBodyDto {
  @ApiProperty() @IsUUID() sourceSeasonId!: string;
}

@ApiTags("registration-v2/seasons")
@ApiBearerAuth()
@Controller("registration-v2/seasons")
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class SeasonRolloverController {
  constructor(private readonly svc: RegistrationV2Service) {}

  @Post(":id/rollover")
  @ApiOperation({
    summary:
      "Copy pricing tiers and email templates from source season into this draft season"
  })
  rollover(@Param("id") id: string, @Body() body: RolloverBodyDto) {
    return this.svc.rolloverSeason({
      sourceSeasonId: body.sourceSeasonId,
      targetSeasonId: id
    });
  }
}
