import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBase64, IsIn, IsOptional, IsUUID, MaxLength } from "class-validator";
import {
  COMPLIANCE_DOCUMENT_KINDS,
  type ComplianceDocumentKind
} from "@sportspulse/kernel";

/**
 * POST /compliance/self/documents/uploads (COMP-3). The target fields
 * must match one of the caller's upload targets (GET of the same path);
 * the server re-derives them and refuses anything else with 404.
 * The file's type is read from its bytes; no declared type is taken.
 */
export class UploadComplianceDocumentBodyDto {
  @ApiProperty({ description: "The person the document is for: the caller, or a minor linked to them." })
  @IsUUID()
  personId!: string;

  @ApiProperty()
  @IsUUID()
  orgId!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID()
  seasonId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID()
  registrationId?: string | null;

  @ApiProperty({ enum: COMPLIANCE_DOCUMENT_KINDS })
  @IsIn([...COMPLIANCE_DOCUMENT_KINDS])
  kind!: ComplianceDocumentKind;

  @ApiPropertyOptional({ nullable: true, description: "Only for kind = signed_waiver." })
  @IsOptional()
  @IsUUID()
  documentVersionId?: string | null;

  /** Raw file bytes, base64, no data: prefix. 3 MiB decoded at most (checked on the bytes). */
  @ApiProperty()
  @IsBase64()
  @MaxLength(4_200_000)
  dataBase64!: string;
}
