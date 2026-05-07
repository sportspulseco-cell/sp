import { ExternalLink, FileSignature } from "lucide-react";
import { EmptyState } from "@sportspulse/ui";
import { PageHeader } from "@/components/layout/page-header";

export const dynamic = "force-dynamic";
export const metadata = { title: "Forms - Org Admin" };

const SUPERADMIN_URL =
  process.env.NEXT_PUBLIC_SUPERADMIN_URL ?? "https://sp-superadmin.vercel.app";

export default function FormsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="// Forms"
        title="Registration forms"
        description="Manage registration forms, role-profile schemas, and free-agent flows from the super-admin console."
      />
      <EmptyState
        icon={FileSignature}
        title="Open the super-admin form builder"
        description="The form builder is a god-app feature — the org-admin console links out to it. Open the full builder in a new tab."
        action={
          <a
            href={`${SUPERADMIN_URL}/forms`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-fg-muted hover:border-fg-muted hover:text-fg"
          >
            Open form builder
            <ExternalLink className="h-3 w-3" strokeWidth={1.75} />
          </a>
        }
      />
    </div>
  );
}
