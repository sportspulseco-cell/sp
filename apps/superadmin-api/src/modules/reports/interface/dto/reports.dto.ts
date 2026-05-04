import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, IsUUID } from "class-validator";

export class StandingsCsvQueryDto {
  @ApiProperty() @IsUUID() leagueId!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() divisionId?: string;
}

export class RostersCsvQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() seasonId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() teamId?: string;
}

export class RegistrationsCsvQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() orgId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() leagueId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
}
