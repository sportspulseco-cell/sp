import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { finance } from "@/lib/api/server-api";
import { InvoiceDetailClient } from "@/components/finance/invoice-detail-client";

export const metadata = { title: "Invoice — SportsPulse" };
export const dynamic = "force-dynamic";

export default async function InvoiceDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const bundle = await finance.invoiceDetail(id).catch(() => null);
  if (!bundle) notFound();

  return (
    <div className="space-y-6">
      <Link
        href="/finance/ar"
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        Back to Invoices & AR
      </Link>

      <InvoiceDetailClient bundle={bundle} />
    </div>
  );
}
