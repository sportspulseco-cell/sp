import { Wallet } from "lucide-react";
import { EmptyState, PageHeader, LoadError } from "@sportspulse/ui";
import { load } from "@sportspulse/api-client";
import { finance } from "@/lib/api/server-api";
import { PaymentsClient } from "./payments-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Payments · Player" };

export default async function PaymentsPage() {
  const [walletResult, invoicesResult] = await Promise.all([
    load(finance.myWallet()),
    load(finance.myInvoices())
  ]);

  // A failed load is shown as an error, never as "No invoices yet".
  if (!walletResult.ok || !invoicesResult.ok) {
    const failed = !invoicesResult.ok ? invoicesResult : !walletResult.ok ? walletResult : null;
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Payments"
          title="Payments"
          description="Invoice timeline, wallet balance, and payment history."
        />
        <LoadError
          what={!invoicesResult.ok ? "your invoices" : "your wallet"}
          status={failed?.status ?? null}
          message={failed?.message}
        />
      </div>
    );
  }
  const walletResp = walletResult.data;
  const invoicesResp = invoicesResult.data;

  if (invoicesResp.items.length === 0 && walletResp.accounts.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Payments"
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
        eyebrow="Payments"
        title="Payments"
        description="Pay what you owe with your wallet, your card, or both."
      />
      <PaymentsClient initial={{ wallet: walletResp, invoices: invoicesResp }} />
    </div>
  );
}
