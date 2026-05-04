import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import type {
  FeeScheduleRow,
  InvoiceItemRow,
  InvoiceRow,
  PaymentRow
} from "../../domain/repositories/finance.repository";

export class FeeScheduleDto {
  @ApiProperty() id!: string;
  @ApiProperty() orgId!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true }) description!: string | null;
  @ApiProperty() kind!: string;
  @ApiPropertyOptional({ nullable: true }) code!: string | null;
  @ApiProperty() currency!: string;
  @ApiProperty() baseAmountCents!: number;
  @ApiProperty() dueOffsetDays!: number;
  @ApiProperty() lateFeeCents!: number;
  @ApiPropertyOptional({ nullable: true }) seasonId!: string | null;
  @ApiPropertyOptional({ nullable: true }) leagueId!: string | null;
  @ApiPropertyOptional({ nullable: true }) divisionId!: string | null;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;

  static fromRow(r: FeeScheduleRow): FeeScheduleDto {
    return {
      id: r.id,
      orgId: r.orgId,
      name: r.name,
      description: r.description,
      kind: r.kind,
      code: r.code,
      currency: r.currency,
      baseAmountCents: r.baseAmountCents,
      dueOffsetDays: r.dueOffsetDays,
      lateFeeCents: r.lateFeeCents,
      seasonId: r.seasonId,
      leagueId: r.leagueId,
      divisionId: r.divisionId,
      isActive: r.isActive,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString()
    };
  }
}

export class FeeSchedulePageDto {
  @ApiProperty({ type: [FeeScheduleDto] }) items!: FeeScheduleDto[];
  @ApiProperty({ nullable: true }) nextCursor!: string | null;
}

export class InvoiceItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() invoiceId!: string;
  @ApiProperty() kind!: string;
  @ApiProperty() description!: string;
  @ApiProperty() quantity!: number;
  @ApiProperty() unitAmountCents!: number;
  @ApiProperty() amountCents!: number;
  @ApiPropertyOptional({ nullable: true }) feeScheduleId!: string | null;

  static fromRow(r: InvoiceItemRow): InvoiceItemDto {
    return {
      id: r.id,
      invoiceId: r.invoiceId,
      kind: r.kind,
      description: r.description,
      quantity: r.quantity,
      unitAmountCents: r.unitAmountCents,
      amountCents: r.amountCents,
      feeScheduleId: r.feeScheduleId
    };
  }
}

export class InvoiceDto {
  @ApiProperty() id!: string;
  @ApiProperty() orgId!: string;
  @ApiProperty() invoiceNumber!: string;
  @ApiPropertyOptional({ nullable: true }) registrationId!: string | null;
  @ApiPropertyOptional({ nullable: true }) recipientPersonId!: string | null;
  @ApiPropertyOptional({ nullable: true }) recipientEmail!: string | null;
  @ApiProperty() currency!: string;
  @ApiProperty() subtotalCents!: number;
  @ApiProperty() taxCents!: number;
  @ApiProperty() discountCents!: number;
  @ApiProperty() totalCents!: number;
  @ApiProperty() paidCents!: number;
  @ApiProperty() status!: string;
  @ApiPropertyOptional({ nullable: true }) issuedAt!: string | null;
  @ApiPropertyOptional({ nullable: true }) dueAt!: string | null;
  @ApiPropertyOptional({ nullable: true }) paidAt!: string | null;
  @ApiPropertyOptional({ nullable: true }) notes!: string | null;
  @ApiProperty({ type: [InvoiceItemDto] }) items!: InvoiceItemDto[];
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;

  static fromRow(r: InvoiceRow): InvoiceDto {
    return {
      id: r.id,
      orgId: r.orgId,
      invoiceNumber: r.invoiceNumber,
      registrationId: r.registrationId,
      recipientPersonId: r.recipientPersonId,
      recipientEmail: r.recipientEmail,
      currency: r.currency,
      subtotalCents: r.subtotalCents,
      taxCents: r.taxCents,
      discountCents: r.discountCents,
      totalCents: r.totalCents,
      paidCents: r.paidCents,
      status: r.status,
      issuedAt: r.issuedAt?.toISOString() ?? null,
      dueAt: r.dueAt?.toISOString() ?? null,
      paidAt: r.paidAt?.toISOString() ?? null,
      notes: r.notes,
      items: r.items.map((i) => InvoiceItemDto.fromRow(i)),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString()
    };
  }
}

export class InvoicePageDto {
  @ApiProperty({ type: [InvoiceDto] }) items!: InvoiceDto[];
  @ApiProperty({ nullable: true }) nextCursor!: string | null;
}

export class PaymentDto {
  @ApiProperty() id!: string;
  @ApiProperty() orgId!: string;
  @ApiProperty() invoiceId!: string;
  @ApiProperty() amountCents!: number;
  @ApiProperty() currency!: string;
  @ApiProperty() method!: string;
  @ApiProperty() status!: string;
  @ApiProperty() receivedAt!: string;
  @ApiPropertyOptional({ nullable: true }) externalProviderId!: string | null;
  @ApiPropertyOptional({ nullable: true }) recordedByUserId!: string | null;
  @ApiPropertyOptional({ nullable: true }) notes!: string | null;
  @ApiProperty() createdAt!: string;

  static fromRow(r: PaymentRow): PaymentDto {
    return {
      id: r.id,
      orgId: r.orgId,
      invoiceId: r.invoiceId,
      amountCents: r.amountCents,
      currency: r.currency,
      method: r.method,
      status: r.status,
      receivedAt: r.receivedAt.toISOString(),
      externalProviderId: r.externalProviderId,
      recordedByUserId: r.recordedByUserId,
      notes: r.notes,
      createdAt: r.createdAt.toISOString()
    };
  }
}
