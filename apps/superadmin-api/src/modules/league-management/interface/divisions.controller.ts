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
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { AuthorizedAccessGuard } from "../../../shared/auth/guards/authorized-access.guard";
import { UserScope } from "../../../shared/auth/decorators/user-scope.decorator";
import type { UserScope as UserScopeType } from "../../../shared/auth/scope";
import { DivisionDto, DivisionPageDto } from "../application/dtos/division.dto";
import {
  CreateDivisionHandler,
  GetDivisionHandler,
  ListDivisionsHandler,
  UpdateDivisionHandler,
  ArchiveDivisionHandler
} from "../application/divisions/handlers";
import {
  CreateDivisionBodyDto,
  ListDivisionsQueryDto,
  UpdateDivisionBodyDto
} from "./dto/division.dto";

@ApiTags("league-management/divisions")
@ApiBearerAuth()
@Controller("league/divisions")
@UseGuards(JwtAuthGuard, AuthorizedAccessGuard)
export class DivisionsController {
  constructor(
    private readonly listH: ListDivisionsHandler,
    private readonly getH: GetDivisionHandler,
    private readonly createH: CreateDivisionHandler,
    private readonly updateH: UpdateDivisionHandler,
    private readonly archiveH: ArchiveDivisionHandler
  ) {}

  @Get() list(
    @Query() q: ListDivisionsQueryDto,
    @UserScope() scope: UserScopeType
  ): Promise<DivisionPageDto> {
    return this.listH.execute({ ...q, leagueIdsFilter: scope.leagueIds ?? undefined });
  }
  @Get(":id") getOne(
    @Param("id") id: string,
    @UserScope() scope: UserScopeType
  ): Promise<DivisionDto> {
    return this.getH.execute({ id, leagueIdsFilter: scope.leagueIds ?? undefined });
  }
  @Post() create(@Body() body: CreateDivisionBodyDto): Promise<DivisionDto> {
    return this.createH.execute(body);
  }
  @Patch(":id") update(
    @Param("id") id: string,
    @Body() body: UpdateDivisionBodyDto
  ): Promise<DivisionDto> {
    return this.updateH.execute({ id, ...body });
  }
  @Delete(":id") archive(@Param("id") id: string): Promise<DivisionDto> {
    return this.archiveH.execute({ id });
  }
}
