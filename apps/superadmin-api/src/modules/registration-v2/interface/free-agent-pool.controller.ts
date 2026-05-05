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
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID
} from "class-validator";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { AuthorizedAccessGuard } from "../../../shared/auth/guards/authorized-access.guard";
import { RegistrationV2Service } from "../application/registration-v2.service";

class UpsertFreeAgentBodyDto {
  @ApiProperty() @IsUUID() playerPersonId!: string;
  @ApiProperty() @IsUUID() seasonId!: string;
  @ApiProperty({ type: [String] }) @IsArray() @IsString({ each: true })
  positions!: string[];
  @ApiPropertyOptional() @IsOptional() availability?: Record<string, unknown>;
  @ApiProperty({ enum: ["A", "B", "C", "D"] })
  @IsIn(["A", "B", "C", "D"])
  levelPrimary!: "A" | "B" | "C" | "D";
  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true })
  levelFlexibility?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

class PlaceFreeAgentBodyDto {
  @ApiProperty() @IsUUID() teamId!: string;
}

class ListFreeAgentsQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() seasonId?: string;
}

@ApiTags("registration-v2/free-agent-pool")
@ApiBearerAuth()
@Controller("registration-v2/free-agent-pool")
@UseGuards(JwtAuthGuard, AuthorizedAccessGuard)
export class FreeAgentPoolController {
  constructor(private readonly svc: RegistrationV2Service) {}

  @Get()
  @ApiOperation({ summary: "List active free agents (filter by season)" })
  list(@Query() q: ListFreeAgentsQueryDto) {
    return this.svc.listFreeAgentPool({ seasonId: q.seasonId });
  }

  @Post()
  @ApiOperation({ summary: "Upsert a free agent entry (one per player+season)" })
  upsert(@Body() body: UpsertFreeAgentBodyDto) {
    return this.svc.upsertFreeAgentEntry({
      playerPersonId: body.playerPersonId,
      seasonId: body.seasonId,
      positions: body.positions,
      availability: body.availability ?? {},
      levelPrimary: body.levelPrimary,
      levelFlexibility: body.levelFlexibility,
      note: body.note
    });
  }

  @Patch(":id/place")
  @ApiOperation({ summary: "Captain places a free agent on a team" })
  place(@Param("id") id: string, @Body() body: PlaceFreeAgentBodyDto) {
    return this.svc.placeFreeAgent(id, { teamId: body.teamId });
  }
}
