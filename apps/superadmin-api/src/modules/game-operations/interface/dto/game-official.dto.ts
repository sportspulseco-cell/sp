import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, IsUUID } from "class-validator";

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
  @ApiProperty() @IsUUID() personId!: string;
  @ApiProperty({ enum: ROLES })
  @IsIn(ROLES as unknown as string[])
  role!: (typeof ROLES)[number];
  @ApiPropertyOptional() @IsOptional() @IsString() slot?: string | null;
  @ApiPropertyOptional({ enum: STATUSES })
  @IsOptional()
  @IsIn(STATUSES as unknown as string[])
  status?: (typeof STATUSES)[number];
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string | null;
}

export class UpdateOfficialStatusBodyDto {
  @ApiProperty({ enum: STATUSES })
  @IsIn(STATUSES as unknown as string[])
  status!: (typeof STATUSES)[number];
}
