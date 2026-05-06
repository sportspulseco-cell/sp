import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsEmail,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested
} from "class-validator";
import { SYSTEM_ROLE_CODES, type ScopeType } from "@sportspulse/kernel";

const SCOPE_TYPES: ScopeType[] = [
  "platform",
  "org",
  "league",
  "season",
  "division",
  "team",
  "game"
];

class InviteUserRoleDto {
  @ApiProperty({ enum: SYSTEM_ROLE_CODES })
  @IsIn(SYSTEM_ROLE_CODES as unknown as string[])
  roleCode!: string;

  @ApiProperty({ enum: SCOPE_TYPES })
  @IsIn(SCOPE_TYPES as unknown as string[])
  scopeType!: ScopeType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  scopeId?: string;
}

export class InviteUserBodyDto {
  @ApiProperty({ format: "email" })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional({
    description:
      "Optional initial password. If provided, the user is created with auto-confirmed email; the inviter relays credentials out-of-band. If omitted, a magic-link invite email is sent."
  })
  @IsOptional()
  @IsString()
  password?: string;

  @ApiPropertyOptional({ type: () => InviteUserRoleDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => InviteUserRoleDto)
  role?: InviteUserRoleDto;
}
