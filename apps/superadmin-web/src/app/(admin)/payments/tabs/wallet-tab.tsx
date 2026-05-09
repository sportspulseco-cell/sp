import { WalletCards } from "lucide-react";
import { EmptyState } from "@sportspulse/ui";
import type { WalletLedgerEntry } from "@sportspulse/api-client";
import { finance } from "@/lib/api/server-api";
import { fmtMoney, fmtDate } from "../lib/format";
import { WalletForm } from "./wallet-form";

/**
 * Wallet tab. Top card shows current balance + ledger entries; bottom
 * card is the admin "Issue wallet credit" form.
 *
 * If no wallet exists for (personId, orgId, USD), renders the form
 * with a $0 balance — submitting will create the row + first entry
 * atomically via /finance/wallet/issue-credit.
 */
export async function WalletTab({
  orgId,
  personId
}: {
  orgId: string;
  personId: string | null;
}) {
  if (!personId) {
    return (
      <EmptyState
        icon={WalletCards}
        title="Pick a player"
        description="The Wallet tab needs ?personId=… in the URL. Open an invoice to set the recipient, then switch tabs."
      />
    );
  }

  const wallet = await finance
    .getWallet({ personId, orgId, currency: "USD" })
    .catch(() => null);
  const ledger = wallet
    ? await finance
        .walletLedger(wallet.id)
        .catch(() => [] as WalletLedgerEntry[])
    : ([] as WalletLedgerEntry[]);

  const balance = wallet?.balanceCents ?? 0;
  const currency = wallet?.currency ?? "USD";
  const expires = wallet?.expiresAt;
  const playerLabel = personId.slice(0, 8); // Short ID until person fetch lands.

  return (
    <div className="space-y-6">
      {/* Continuous balance + ledger card — matches the mockup's layout
          where entries fall directly under the dark blue balance header
          inside a single rounded container. */}
      <section className="overflow-hidden rounded-xl border border-border bg-surface-1">
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 p-6 text-white">
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-widest text-blue-100">
                SportsPulse wallet balance
              </p>
              <p className="mt-1 text-[36px] font-semibold tabular-nums">
                {fmtMoney(balance, currency)}
              </p>
            </div>
            <div className="text-right text-blue-100">
              <p className="font-mono text-[12px]">{playerLabel}</p>
              <p className="mt-1 font-mono text-[11px] uppercase tracking-widest">
                {expires ? `Expires ${fmtDate(expires)}` : "Never expires"}
              </p>
            </div>
          </div>
        </div>
        {ledger.length > 0 ? (
          <ul className="divide-y divide-border">
            {ledger.map((e) => {
              const isCredit = e.amountCents > 0;
              return (
                <li
                  key={e.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-fg capitalize">
                      {e.entryType.replace(/_/g, " ")}
                    </p>
                    <p className="font-mono text-[11px] text-fg-muted">
                      {e.reason}
                      {e.relatedInvoiceId
                        ? ` · Applied to ${e.relatedInvoiceId.slice(0, 8)}`
                        : ""}
                      {" · "}
                      {fmtDate(e.createdAt)}
                    </p>
                  </div>
                  <p
                    className={`font-mono text-[14px] tabular-nums ${
                      isCredit
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "text-rose-700 dark:text-rose-400"
                    }`}
                  >
                    {isCredit ? "+" : ""}
                    {fmtMoney(e.amountCents, currency)}
                  </p>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-5 py-6 text-center text-[12px] text-fg-muted">
            No ledger entries yet — issue a credit below to seed the audit log.
          </p>
        )}
      </section>

      <WalletForm
        personId={personId}
        orgId={orgId}
        defaultCurrency={currency}
      />
    </div>
  );
}
