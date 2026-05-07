import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsObject, IsOptional, IsString, Matches } from "class-validator";

export class SetRoleProfileBodyDto {
  @ApiProperty({ example: "season_admin" })
  @IsString()
  @Matches(/^[a-z][a-z0-9_]{2,40}$/, {
    message:
      "roleCode must be lowercase alphanumeric (with underscores), 3–41 chars."
  })
  roleCode!: string;

  @ApiProperty({ description: "Free-form JSON keyed by question key." })
  @IsObject()
  data!: Record<string, unknown>;

  @ApiPropertyOptional({
    description:
      "If true, also flip auth.users.app_metadata.profile_complete = true. Used by the onboarding wizard's final Finish action."
  })
  @IsOptional()
  @IsBoolean()
  complete?: boolean;
}
