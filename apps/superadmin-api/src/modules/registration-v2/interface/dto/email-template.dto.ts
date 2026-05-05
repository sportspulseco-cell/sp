import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MinLength } from "class-validator";

export const EMAIL_EVENT_TYPES = [
  "on_payment",
  "on_approved",
  "on_rejected",
  "installment_reminder",
  "season_closing",
  "parental_consent",
  "custom"
] as const;
export type EmailEventType = (typeof EMAIL_EVENT_TYPES)[number];

export const EMAIL_TYPE_FILTERS = ["all", "team", "individual"] as const;
export type EmailTypeFilter = (typeof EMAIL_TYPE_FILTERS)[number];

export class CreateEmailTemplateBodyDto {
  @ApiProperty() @IsUUID() seasonId!: string;
  @ApiProperty({ enum: EMAIL_EVENT_TYPES }) @IsIn(EMAIL_EVENT_TYPES as unknown as string[])
  eventType!: EmailEventType;
  @ApiPropertyOptional({ enum: EMAIL_TYPE_FILTERS }) @IsOptional()
  @IsIn(EMAIL_TYPE_FILTERS as unknown as string[])
  registrationTypeFilter?: EmailTypeFilter;
  @ApiProperty() @IsString() @MinLength(1) subject!: string;
  @ApiProperty() @IsString() @MinLength(1) bodyHtml!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() attachmentPath?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateEmailTemplateBodyDto {
  @ApiPropertyOptional() @IsOptional() @IsString() subject?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bodyHtml?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() attachmentPath?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class ListEmailTemplatesQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() seasonId?: string;
}
