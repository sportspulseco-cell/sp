import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

const ROLES = [
  "referee",
  "linesman",
  "scorekeeper",
  "timekeeper",
  "video_review",
  "commissioner",
  "other"
] as const;

const STATUSES = ["confirmed", "tentative", "declined"] as const;

export class AssignGameOfficialBodyDto {
  /** The person to assign. Give this or `email`, not both. */
  @ApiPropertyOptional() @IsOptional() @IsUUID() personId?: string;
  /**
   * An existing account's full email (exact match, any case), for an
   * official with no tie to the league yet. Never matched in part.
   */
  @ApiPropertyOptional() @IsOptional() @IsEmail() @MaxLength(320) email?: string;
  @ApiProperty({ enum: ROLES })
  @IsIn(ROLES as unknown as string[])
  role!: (typeof ROLES)[number];
  @ApiPropertyOptional() @IsOptional() @IsString() slot?: string | null;
  @ApiPropertyOptional({ enum: STATUSES })
  @IsOptional()
  @IsIn(STATUSES as unknown as string[])
  status?: (typeof STATUSES)[number];
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string | null;
  /** Assign although the person runs another game at the same time. */
  @ApiPropertyOptional() @IsOptional() @IsBoolean() force?: boolean;
}

export class UpdateOfficialStatusBodyDto {
  @ApiProperty({ enum: STATUSES })
  @IsIn(STATUSES as unknown as string[])
  status!: (typeof STATUSES)[number];
}
