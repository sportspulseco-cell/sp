import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import type { Document } from "../../domain/entities/document.entity";
import type {
  ConsentSignatureRow,
  DocumentVersionRow
} from "../../domain/repositories/document.repository";
import { DOCUMENT_KINDS } from "../../domain/value-objects/statuses.vo";

export class DocumentDto {
  @ApiProperty() id!: string;
  @ApiPropertyOptional({ nullable: true }) orgId!: string | null;
  @ApiProperty({ enum: DOCUMENT_KINDS }) kind!: (typeof DOCUMENT_KINDS)[number];
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true }) description!: string | null;
  @ApiPropertyOptional({ nullable: true }) activeVersionId!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;

  static fromDomain(d: Document): DocumentDto {
    const x = d.toSnapshot();
    return {
      id: x.id,
      orgId: x.orgId,
      kind: x.kind,
      name: x.name,
      description: x.description,
      activeVersionId: x.activeVersionId,
      createdAt: x.createdAt.toISOString(),
      updatedAt: x.updatedAt.toISOString()
    };
  }
}

export class DocumentPageDto {
  @ApiProperty({ type: [DocumentDto] }) items!: DocumentDto[];
  @ApiProperty({ nullable: true }) nextCursor!: string | null;
}

export class DocumentVersionDto {
  @ApiProperty() id!: string;
  @ApiProperty() documentId!: string;
  @ApiProperty() versionNumber!: number;
  @ApiProperty() contentHtml!: string;
  @ApiProperty() contentHash!: string;
  @ApiProperty() languageCode!: string;
  @ApiPropertyOptional({ nullable: true }) jurisdictionCountryCode!: string | null;
  @ApiProperty() effectiveFrom!: string;
  @ApiPropertyOptional({ nullable: true }) supersededAt!: string | null;
  @ApiProperty() createdAt!: string;

  static fromRow(r: DocumentVersionRow): DocumentVersionDto {
    return {
      id: r.id,
      documentId: r.documentId,
      versionNumber: r.versionNumber,
      contentHtml: r.contentHtml,
      contentHash: r.contentHash,
      languageCode: r.languageCode,
      jurisdictionCountryCode: r.jurisdictionCountryCode,
      effectiveFrom: r.effectiveFrom.toISOString(),
      supersededAt: r.supersededAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString()
    };
  }
}

export class ConsentSignatureDto {
  @ApiProperty() id!: string;
  @ApiProperty() personId!: string;
  @ApiProperty() documentVersionId!: string;
  @ApiProperty() signedAt!: string;
  @ApiPropertyOptional({ nullable: true }) ipAddr!: string | null;
  @ApiPropertyOptional({ nullable: true }) userAgent!: string | null;
  @ApiPropertyOptional({ nullable: true }) signedByUserId!: string | null;
  @ApiPropertyOptional({ nullable: true }) signatureBlobUrl!: string | null;
  @ApiPropertyOptional({ nullable: true }) revokedAt!: string | null;
  @ApiPropertyOptional({ nullable: true }) revokedReason!: string | null;

  static fromRow(r: ConsentSignatureRow): ConsentSignatureDto {
    return {
      id: r.id,
      personId: r.personId,
      documentVersionId: r.documentVersionId,
      signedAt: r.signedAt.toISOString(),
      ipAddr: r.ipAddr,
      userAgent: r.userAgent,
      signedByUserId: r.signedByUserId,
      signatureBlobUrl: r.signatureBlobUrl,
      revokedAt: r.revokedAt?.toISOString() ?? null,
      revokedReason: r.revokedReason
    };
  }
}
