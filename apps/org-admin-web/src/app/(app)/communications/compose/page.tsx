import Link from "next/link";
import { ArrowLeft, Building2 } from "lucide-react";
import { EmptyState } from "@sportspulse/ui";
import { iam } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { getActiveOrgId } from "@/lib/active-org";
import { ComposeForm } from "./compose-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Compose broadcast — Org admin" };

export default async function ComposePage() {
  const scope = await iam.meScope().catch(() => null);
  const orgId = await getActiveOrgId(scope);

  if (!orgId) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="// Compose" title="Send a broadcast" />
        <EmptyState
          icon={Building2}
          title="No org in scope"
          description="Pick an org from the switcher first."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href="/communications"
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        Outbox
      </Link>
      <PageHeader
        eyebrow="// Compose"
        title="Send a broadcast"
        description="Queue a notification to a scoped audience inside this org. Each recipient gets one idempotent row — re-send is safe."
      />
      <ComposeForm orgId={orgId} />
    </div>
  );
}
