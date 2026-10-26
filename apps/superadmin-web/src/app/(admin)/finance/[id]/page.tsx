import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { load } from "@sportspulse/api-client";
import { notFound } from "next/navigation";
import { LoadError } from "@sportspulse/ui";
import { finance } from "@/lib/api/server-api";
import { InvoiceDetailClient } from "@/components/finance/invoice-detail-client";

export const metadata = { title: "Invoice · Super Admin" };
export const dynamic = "force-dynamic";

export default async function InvoiceDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const bundleResult = await load(finance.invoiceDetail(id));
  if (!bundleResult.ok) {
    if (bundleResult.status === 404) notFound();
    return (
      <LoadError
        what="this invoice"
        status={bundleResult.status}
        message={bundleResult.message}
        action={
          <Link
            href="/finance"
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-fg-muted hover:text-fg"
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
            Back to Invoices
          </Link>
        }
      />
    );
  }
  const bundle = bundleResult.data;

  return (
    <div className="space-y-6">
      <Link
        href="/finance"
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        Back to Invoices
      </Link>

      <InvoiceDetailClient bundle={bundle} />
    </div>
  );
}
