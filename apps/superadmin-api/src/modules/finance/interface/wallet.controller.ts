import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength
} from "class-validator";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { AuthPrincipal } from "@sportspulse/auth";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { SuperAdminGuard } from "../../../shared/auth/guards/super-admin.guard";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";

class IssueCreditBodyDto {
  @IsUUID() personId!: string;
  @IsUUID() orgId!: string;
  @IsInt() @Min(1) amountCents!: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsDateString() expiresAt?: string | null;
  @IsString() @MinLength(10) @MaxLength(2000) reason!: string;
}

class GetWalletQueryDto {
  @IsUUID() personId!: string;
  @IsUUID() orgId!: string;
  @IsOptional() @IsString() currency?: string;
}

interface WalletDto {
  id: string;
  personId: string;
  orgId: string;
  currency: string;
  balanceCents: number;
  expiresAt: string | null;
  frozen: boolean;
  createdAt: string;
  updatedAt: string;
}

interface LedgerEntryDto {
  id: string;
  walletId: string;
  entryType: string;
  amountCents: number;
  relatedInvoiceId: string | null;
  relatedRefundId: string | null;
  reason: string;
  issuedByUserId: string | null;
  expiresAt: string | null;
  createdAt: string;
}

/**
 * Wallet balance + ledger. The "Wallet" tab reads
 * GET /finance/wallet?personId=…&orgId=… for the balance card and
 * GET /finance/wallet/:walletId/ledger for the entries list.
 *
 * Issuing credit is super-admin-only. The balance is bumped + a
 * credit_issued ledger row is appended in one transaction so the
 * denormalised balance never diverges from the audit log.
 */
@ApiTags("finance/wallet")
@ApiBearerAuth()
@Controller("finance/wallet")
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class FinanceWalletController {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @Get()
  @ApiOperation({
    summary:
      "Resolve the wallet for (personId, orgId, currency). Returns null balance card if none exists yet."
  })
  async getWallet(@Query() q: GetWalletQueryDto): Promise<WalletDto | null> {
    const currency = q.currency ?? "USD";
    const [row] = await this.db
      .select()
      .from(schema.walletAccounts)
      .where(
        and(
          eq(schema.walletAccounts.personId, q.personId),
          eq(schema.walletAccounts.orgId, q.orgId),
          eq(schema.walletAccounts.currency, currency)
        )
      )
      .limit(1);
    if (!row) return null;
    return walletToDto(row);
  }

  @Get(":walletId/ledger")
  async ledger(@Param("walletId") walletId: string): Promise<LedgerEntryDto[]> {
    const rows = await this.db
      .select()
      .from(schema.walletLedger)
      .where(eq(schema.walletLedger.walletId, walletId))
      .orderBy(desc(schema.walletLedger.createdAt))
      .limit(200);
    return rows.map(ledgerToDto);
  }

  @Post("issue-credit")
  @ApiOperation({
    summary:
      "Issue a wallet credit (admin-only). Bumps balance + appends a credit_issued ledger entry atomically."
  })
  async issueCredit(
    @Body() body: IssueCreditBodyDto,
    @CurrentUser() user: AuthPrincipal
  ): Promise<{ wallet: WalletDto; entry: LedgerEntryDto }> {
    const currency = body.currency ?? "USD";
    if (body.amountCents <= 0) {
      throw new BadRequestException("amountCents must be > 0");
    }
    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;

    const result = await this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(schema.walletAccounts)
        .where(
          and(
            eq(schema.walletAccounts.personId, body.personId),
            eq(schema.walletAccounts.orgId, body.orgId),
            eq(schema.walletAccounts.currency, currency)
          )
        )
        .limit(1);

      let wallet: typeof schema.walletAccounts.$inferSelect;
      if (existing) {
        if (existing.frozen) {
          throw new BadRequestException("Wallet is frozen — unfreeze before issuing credit");
        }
        const [updated] = await tx
          .update(schema.walletAccounts)
          .set({
            balanceCents: sql`${schema.walletAccounts.balanceCents} + ${body.amountCents}`,
            updatedAt: sql`now()`
          })
          .where(eq(schema.walletAccounts.id, existing.id))
          .returning();
        wallet = updated!;
      } else {
        const [created] = await tx
          .insert(schema.walletAccounts)
          .values({
            personId: body.personId,
            orgId: body.orgId,
            currency,
            balanceCents: body.amountCents
          })
          .returning();
        wallet = created!;
      }

      const [entry] = await tx
        .insert(schema.walletLedger)
        .values({
          walletId: wallet.id,
          entryType: "credit_issued",
          amountCents: body.amountCents,
          reason: body.reason,
          issuedByUserId: user.userId,
          expiresAt
        })
        .returning();

      return { wallet, entry: entry! };
    });

    return {
      wallet: walletToDto(result.wallet),
      entry: ledgerToDto(result.entry)
    };
  }

  @Post(":walletId/freeze")
  async freeze(@Param("walletId") walletId: string): Promise<WalletDto> {
    const [row] = await this.db
      .update(schema.walletAccounts)
      .set({ frozen: true, updatedAt: sql`now()` })
      .where(eq(schema.walletAccounts.id, walletId))
      .returning();
    if (!row) throw new NotFoundException("Wallet not found");
    return walletToDto(row);
  }

  @Post(":walletId/unfreeze")
  async unfreeze(@Param("walletId") walletId: string): Promise<WalletDto> {
    const [row] = await this.db
      .update(schema.walletAccounts)
      .set({ frozen: false, updatedAt: sql`now()` })
      .where(eq(schema.walletAccounts.id, walletId))
      .returning();
    if (!row) throw new NotFoundException("Wallet not found");
    return walletToDto(row);
  }
}

function walletToDto(row: typeof schema.walletAccounts.$inferSelect): WalletDto {
  return {
    id: row.id,
    personId: row.personId,
    orgId: row.orgId,
    currency: row.currency,
    balanceCents: row.balanceCents,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    frozen: row.frozen,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function ledgerToDto(row: typeof schema.walletLedger.$inferSelect): LedgerEntryDto {
  return {
    id: row.id,
    walletId: row.walletId,
    entryType: row.entryType,
    amountCents: row.amountCents,
    relatedInvoiceId: row.relatedInvoiceId,
    relatedRefundId: row.relatedRefundId,
    reason: row.reason,
    issuedByUserId: row.issuedByUserId,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString()
  };
}
