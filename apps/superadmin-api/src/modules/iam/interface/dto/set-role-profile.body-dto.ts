import { ApiProperty } from "@nestjs/swagger";
import { IsObject, IsString, Matches } from "class-validator";

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
}
