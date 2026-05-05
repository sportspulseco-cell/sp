import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID
} from "class-validator";

export const INVITE_KINDS = ["personal", "generic"] as const;
export type InviteKind = (typeof INVITE_KINDS)[number];

export class CreateTeamInviteBodyDto {
  @ApiProperty() @IsUUID() teamId!: string;
  @ApiProperty() @IsUUID() seasonId!: string;
  @ApiPropertyOptional({ enum: INVITE_KINDS, default: "personal" })
  @IsOptional() @IsIn(INVITE_KINDS as unknown as string[])
  kind?: InviteKind;
  @ApiPropertyOptional() @IsOptional() @IsEmail() inviteeEmail?: string;
}

export class ListTeamInvitesQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() teamId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() seasonId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
}
