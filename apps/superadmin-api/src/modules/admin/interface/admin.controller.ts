import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
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
  FeatureFlagDto,
  HealthDto,
  SportDto,
  SystemSettingDto
} from "../application/dtos/admin.dto";
import {
  DeleteFlagHandler,
  HealthHandler,
  ListFlagsHandler,
  ListSettingsHandler,
  ListSportsHandler,
  UpdateSportHandler,
  UpsertFlagHandler,
  UpsertSettingHandler
} from "../application/handlers/admin.handlers";
import {
  ListSettingsQueryDto,
  UpdateSportBodyDto,
  UpsertFlagBodyDto,
  UpsertSettingBodyDto
} from "./dto/admin.dto";

@ApiTags("admin")
@ApiBearerAuth()
@Controller("admin")
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class AdminController {
  constructor(
    private readonly listSettingsH: ListSettingsHandler,
    private readonly upsertSettingH: UpsertSettingHandler,
    private readonly listFlagsH: ListFlagsHandler,
    private readonly upsertFlagH: UpsertFlagHandler,
    private readonly deleteFlagH: DeleteFlagHandler,
    private readonly listSportsH: ListSportsHandler,
    private readonly updateSportH: UpdateSportHandler,
    private readonly healthH: HealthHandler
  ) {}

  // ---- Settings ----
  @Get("settings") list(@Query() q: ListSettingsQueryDto): Promise<SystemSettingDto[]> {
    return this.listSettingsH.execute(q);
  }
  @Post("settings")
  upsertSetting(
    @Body() body: UpsertSettingBodyDto,
    @CurrentUser() user: AuthPrincipal
  ): Promise<SystemSettingDto> {
    return this.upsertSettingH.execute({
      ...body,
      updatedByUserId: user.userId
    });
  }

  // ---- Flags ----
  @Get("flags") flags(): Promise<FeatureFlagDto[]> {
    return this.listFlagsH.execute();
  }
  @Post("flags")
  upsertFlag(
    @Body() body: UpsertFlagBodyDto,
    @CurrentUser() user: AuthPrincipal
  ): Promise<FeatureFlagDto> {
    return this.upsertFlagH.execute({
      ...body,
      updatedByUserId: user.userId
    });
  }
  @Delete("flags/:key") deleteFlag(@Param("key") key: string) {
    return this.deleteFlagH.execute({ key });
  }

  // ---- Sports ----
  @Get("sports") sports(): Promise<SportDto[]> {
    return this.listSportsH.execute();
  }
  @Patch("sports/:code")
  updateSport(
    @Param("code") code: string,
    @Body() body: UpdateSportBodyDto
  ): Promise<SportDto> {
    return this.updateSportH.execute({ code, ...body });
  }

  // ---- Health ----
  @Get("health") @ApiOperation({ summary: "Platform health check (db ping + module list)" })
  health(): Promise<HealthDto> {
    return this.healthH.execute();
  }
}
