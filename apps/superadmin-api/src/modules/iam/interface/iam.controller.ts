import {
  Body,
  Controller,
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
import { GetCurrentUserHandler } from "../application/queries/get-current-user.query";
import { ListProfilesHandler } from "../application/queries/list-profiles.query";
import { SuspendProfileHandler } from "../application/commands/suspend-profile.command";
import { ReactivateProfileHandler } from "../application/commands/reactivate-profile.command";
import { UpdateProfileHandler } from "../application/commands/update-profile.command";
import { ProfileDto, ProfilePageDto } from "../application/dtos/profile.dto";
import { ListProfilesQueryDto } from "./dto/list-profiles.query-dto";
import { UpdateProfileBodyDto } from "./dto/update-profile.body-dto";

@ApiTags("iam")
@ApiBearerAuth()
@Controller("iam")
@UseGuards(JwtAuthGuard)
export class IamController {
  constructor(
    private readonly getCurrentUser: GetCurrentUserHandler,
    private readonly listProfiles: ListProfilesHandler,
    private readonly suspendProfile: SuspendProfileHandler,
    private readonly reactivateProfile: ReactivateProfileHandler,
    private readonly updateProfile: UpdateProfileHandler
  ) {}

  // -------- self --------

  @Get("me")
  @ApiOperation({ summary: "Get current authenticated user's profile" })
  async me(@CurrentUser() principal: AuthPrincipal): Promise<ProfileDto> {
    return this.getCurrentUser.execute({ userId: principal.userId });
  }

  // -------- super admin --------

  @Get("users")
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: "List users (super admin only)" })
  async list(@Query() q: ListProfilesQueryDto): Promise<ProfilePageDto> {
    return this.listProfiles.execute(q);
  }

  @Get("users/:id")
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: "Get a user's profile (super admin only)" })
  async getOne(@Param("id") id: string): Promise<ProfileDto> {
    return this.getCurrentUser.execute({ userId: id });
  }

  @Patch("users/:id")
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: "Update a user's profile (super admin only)" })
  async update(
    @Param("id") id: string,
    @Body() body: UpdateProfileBodyDto
  ): Promise<ProfileDto> {
    return this.updateProfile.execute({ userId: id, ...body });
  }

  @Post("users/:id/suspend")
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: "Suspend a user (super admin only)" })
  async suspend(@Param("id") id: string): Promise<ProfileDto> {
    return this.suspendProfile.execute({ userId: id });
  }

  @Post("users/:id/reactivate")
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: "Reactivate a suspended user (super admin only)" })
  async reactivate(@Param("id") id: string): Promise<ProfileDto> {
    return this.reactivateProfile.execute({ userId: id });
  }
}
