import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min
} from "class-validator";

const KINDS = [
  "persons",
  "teams",
  "registrations",
  "rosters",
  "games"
] as const;

const STATUSES = [
  "pending",
  "running",
  "succeeded",
  "failed",
  "partial",
  "cancelled"
] as const;

export class ImportCsvBodyDto {
  @ApiProperty({ enum: KINDS })
  @IsIn(KINDS as unknown as string[])
  entityKind!: (typeof KINDS)[number];
  @ApiProperty({ description: "CSV content (full file as string)" })
  @IsString()
  csv!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() orgId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() sourceFilename?: string | null;
}

export class ListJobsQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 200 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200)
  limit?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() cursor?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() orgId?: string;
  @ApiPropertyOptional({ enum: KINDS })
  @IsOptional()
  @IsIn(KINDS as unknown as string[])
  entityKind?: (typeof KINDS)[number];
  @ApiPropertyOptional({ enum: STATUSES })
  @IsOptional()
  @IsIn(STATUSES as unknown as string[])
  status?: (typeof STATUSES)[number];
}
