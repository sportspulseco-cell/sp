import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min
} from "class-validator";
import { DOCUMENT_KINDS } from "../../domain/value-objects/statuses.vo";

export class CreateDocumentBodyDto {
  @ApiProperty({ enum: DOCUMENT_KINDS })
  @IsIn(DOCUMENT_KINDS as unknown as string[])
  kind!: (typeof DOCUMENT_KINDS)[number];
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(160) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() orgId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string | null;
}

export class UpdateDocumentBodyDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string | null;
}

export class PublishDocumentVersionBodyDto {
  @ApiProperty() @IsString() @IsNotEmpty() contentHtml!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() languageCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 2)
  jurisdictionCountryCode?: string | null;
}

export class SignDocumentBodyDto {
  @ApiProperty() @IsUUID() personId!: string;
  @ApiProperty() @IsUUID() documentVersionId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() signatureBlobUrl?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsObject() geolocation?: Record<string, unknown>;
}

export class RevokeSignatureBodyDto {
  @ApiProperty() @IsString() @IsNotEmpty() reason!: string;
}

export class ListDocumentsQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() cursor?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() orgId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() kind?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
}
