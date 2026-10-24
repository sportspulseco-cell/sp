import { Building2 } from "lucide-react";
import { EmptyState, SectionRail } from "@sportspulse/ui";
import { iam, orgs } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { getActiveOrgId } from "@/lib/active-org";
import { OrgActions } from "@/components/edit/detail-actions";
import { RegionsSection } from "@/components/regions/regions-section";

export const dynamic = "force-dynamic";
export const metadata = { title: "Organisation - Org Admin" };

/**
 * The org admin's own organisation: its details with Edit organisation
 * (the same shared dialog super admins use; the API only lets this
 * org's org admins save) and its regions.
 */
export default async function OrganizationPage() {
  const scope = await iam.meScope().catch(() => null);
  const orgId = await getActiveOrgId(scope);
  const org = orgId ? await orgs.get(orgId).catch(() => null) : null;

  if (!org) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Organisation" title="Organisation" />
        <EmptyState
          icon={Building2}
          title="No organisation selected"
          description="You don't hold an org admin role on any organisation yet. Ask the platform admin to grant you the role."
        />
      </div>
    );
  }

  const rows: Array<[string, string]> = [
    ["Display name", org.displayName],
    ["Legal name", org.legalName],
    ["Type", org.orgType.replace(/_/g, " ")],
    ["Country", org.countryCode],
    ["Locale", org.defaultLocale],
    ["Currency", org.defaultCurrency],
    ["Timezone", org.defaultTimezone],
    ["Status", org.status]
  ];

  return (
    <div className="space-y-12">
      <PageHeader
        eyebrow="Organisation"
        title={org.displayName}
        description="Your organisation's details. Changes apply everywhere the organisation is shown."
        action={<OrgActions org={org} />}
      />
      <section className="space-y-6">
        <SectionRail index="01" label="Details" subtitle="Slug and type are fixed once the organisation exists." />
        <dl className="grid grid-cols-1 gap-x-8 gap-y-4 rounded-xl border border-border bg-surface-1 p-6 sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">{label}</dt>
              <dd className="mt-1 text-[14px] text-fg">{value || "—"}</dd>
            </div>
          ))}
        </dl>
      </section>
      <RegionsSection orgId={org.id} orgName={org.displayName} />
    </div>
  );
}
