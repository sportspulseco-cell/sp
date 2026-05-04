import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateProfileBodyDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120)
  legalFirstName?: string | null;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120)
  legalLastName?: string | null;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120)
  preferredName?: string | null;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120)
  displayName?: string | null;

  @ApiPropertyOptional() @IsOptional() @IsString()
  locale?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  timezone?: string;
}
