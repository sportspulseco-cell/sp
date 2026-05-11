import { Wallet } from "lucide-react";
import { EmptyState } from "@sportspulse/ui";
import { finance } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { PaymentsClient } from "./payments-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Payments — SportsPulse" };

export default async function PaymentsPage() {
  const [walletResp, invoicesResp] = await Promise.all([
    finance.myWallet().catch(() => ({ accounts: [] })),
    finance.myInvoices().catch(() => ({ items: [] }))
  ]);

  if (invoicesResp.items.length === 0 && walletResp.accounts.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="// Payments"
          title="Payments"
          description="Invoice timeline, wallet balance, and payment history."
        />
        <EmptyState
          icon={Wallet}
          title="No invoices yet"
          description="Once your registration is approved, the invoice will appear here."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="// Payments"
        title="Payments"
        description="Pay outstanding invoices with your wallet, your card, or both. Update your card and retry failed installments inline."
      />
      <PaymentsClient initial={{ wallet: walletResp, invoices: invoicesResp }} />
    </div>
  );
}
