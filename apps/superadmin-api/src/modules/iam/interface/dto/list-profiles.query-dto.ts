import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class ListProfilesQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ enum: ["pending", "active", "suspended", "deleted"] })
  @IsOptional()
  @IsIn(["pending", "active", "suspended", "deleted"])
  status?: "pending" | "active" | "suspended" | "deleted";

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: "ISO-3166-1 alpha-2" })
  @IsOptional()
  @IsString()
  countryCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  isSuperAdmin?: boolean;

  @ApiPropertyOptional({
    description:
      "Filter to users with an active assignment of this role code (e.g. season_admin)."
  })
  @IsOptional()
  @IsString()
  roleCode?: string;
}
