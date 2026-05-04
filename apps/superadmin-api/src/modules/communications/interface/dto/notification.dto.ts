import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from "class-validator";

export class ListNotificationsQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 200 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200)
  limit?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() cursor?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() orgId?: string;
  @ApiPropertyOptional({ enum: ["queued", "sending", "sent", "failed", "suppressed"] })
  @IsOptional()
  @IsIn(["queued", "sending", "sent", "failed", "suppressed"])
  status?: "queued" | "sending" | "sent" | "failed" | "suppressed";
  @ApiPropertyOptional() @IsOptional() @IsUUID() recipientPersonId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() templateCode?: string;
  @ApiPropertyOptional({ enum: ["email", "sms", "in_app"] })
  @IsOptional()
  @IsIn(["email", "sms", "in_app"])
  channel?: "email" | "sms" | "in_app";
}
