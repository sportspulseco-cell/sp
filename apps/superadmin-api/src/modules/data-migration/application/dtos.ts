import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import type {
  ImportJobRow,
  ImportJobRowEntry
} from "../domain/repositories/import.repository";

export class ImportJobDto {
  @ApiProperty() id!: string;
  @ApiPropertyOptional({ nullable: true }) orgId!: string | null;
  @ApiProperty() entityKind!: string;
  @ApiPropertyOptional({ nullable: true }) sourceFilename!: string | null;
  @ApiProperty() status!: string;
  @ApiProperty() totalRows!: number;
  @ApiProperty() processedRows!: number;
  @ApiProperty() successRows!: number;
  @ApiProperty() failedRows!: number;
  @ApiPropertyOptional({ nullable: true }) error!: string | null;
  @ApiPropertyOptional({ nullable: true }) startedAt!: string | null;
  @ApiPropertyOptional({ nullable: true }) finishedAt!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;

  static fromRow(r: ImportJobRow): ImportJobDto {
    return {
      id: r.id,
      orgId: r.orgId,
      entityKind: r.entityKind,
      sourceFilename: r.sourceFilename,
      status: r.status,
      totalRows: r.totalRows,
      processedRows: r.processedRows,
      successRows: r.successRows,
      failedRows: r.failedRows,
      error: r.error,
      startedAt: r.startedAt?.toISOString() ?? null,
      finishedAt: r.finishedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString()
    };
  }
}

export class ImportJobPageDto {
  @ApiProperty({ type: [ImportJobDto] }) items!: ImportJobDto[];
  @ApiProperty({ nullable: true }) nextCursor!: string | null;
}

export class ImportJobRowDto {
  @ApiProperty() id!: string;
  @ApiProperty() rowNumber!: number;
  @ApiProperty() raw!: Record<string, unknown>;
  @ApiProperty() status!: string;
  @ApiPropertyOptional({ nullable: true }) error!: string | null;
  @ApiPropertyOptional({ nullable: true }) createdEntityId!: string | null;

  static fromRow(r: ImportJobRowEntry): ImportJobRowDto {
    return {
      id: r.id,
      rowNumber: r.rowNumber,
      raw: r.raw,
      status: r.status,
      error: r.error,
      createdEntityId: r.createdEntityId
    };
  }
}
