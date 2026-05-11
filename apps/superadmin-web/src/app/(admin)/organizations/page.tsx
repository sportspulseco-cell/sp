import { Building2, Globe2, Layers, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { orgs } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { KineticStrip } from "@/components/layout/kinetic-strip";
import { Badge, statusTone } from "@/components/ui/badge";
import {
  EmptyRow,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table
} from "@/components/ui/table";
import { CreateOrgButton } from "@/components/orgs/create-org-button";

export const metadata = { title: "Organizations — SportsPulse" };

export default async function OrganizationsPage({
  searchParams
}: {
  searchParams?: Promise<{ search?: string }>;
}) {
  const sp = await searchParams;
  const page = await orgs
    .list({ search: sp?.search, limit: 50 })
    .catch(() => ({ items: [], nextCursor: null }));

  const total = page.items.length;
  const active = page.items.filter((o) => o.status === "active").length;
  const suspended = page.items.filter((o) => o.status === "suspended").length;
  const countries = new Set(
    page.items.map((o) => o.countryCode).filter(Boolean)
  ).size;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="tenancy"
        title="Organizations"
        description="Tenants on the platform — clubs, federations, leagues, schools."
        action={<CreateOrgButton />}
      />
      <KineticStrip
        cards={[
          {
            label: "Total tenants",
            value: total,
            icon: <Building2 className="h-3.5 w-3.5" strokeWidth={1.75} />,
            tone: "idle"
          },
          {
            label: "Active",
            value: active,
            icon: <Layers className="h-3.5 w-3.5" strokeWidth={1.75} />,
            tone: active > 0 ? "ok" : "idle",
            hint:
              total > 0
                ? `${Math.round((active / total) * 100)}% live`
                : undefined
          },
          {
            label: "Suspended",
            value: suspended,
            icon: <ShieldAlert className="h-3.5 w-3.5" strokeWidth={1.75} />,
            tone: suspended > 0 ? "warn" : "idle"
          },
          {
            label: "Countries",
            value: countries,
            icon: <Globe2 className="h-3.5 w-3.5" strokeWidth={1.75} />,
            tone: "info"
          }
        ]}
      />

      {page.items.length === 0 ? (
        <EmptyOrgs />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Slug</TH>
              <TH>Type</TH>
              <TH>Country</TH>
              <TH>Currency</TH>
              <TH>Status</TH>
              <TH>Created</TH>
            </TR>
          </THead>
          <TBody>
            {page.items.map((o) => (
              <TR key={o.id}>
                <TD className="font-medium">
                  <Link
                    href={`/organizations/${o.id}`}
                    className="hover:underline"
                  >
                    {o.displayName}
                  </Link>
                </TD>
                <TD className="text-muted-foreground">{o.slug}</TD>
                <TD className="text-muted-foreground">
                  {o.orgType.replace(/_/g, " ")}
                </TD>
                <TD className="text-muted-foreground">{o.countryCode}</TD>
                <TD className="text-muted-foreground">{o.defaultCurrency}</TD>
                <TD>
                  <Badge tone={statusTone(o.status)}>{o.status}</Badge>
                </TD>
                <TD className="text-muted-foreground">
                  {new Date(o.createdAt).toLocaleDateString()}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}

function EmptyOrgs() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-card/50 p-12 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Building2 className="h-5 w-5 text-muted-foreground" />
      </div>
      <h3 className="text-base font-semibold">No organizations yet</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Create your first organization — it can be a club, federation,
        league operator, association, or school.
      </p>
      <div className="mt-4">
        <CreateOrgButton />
      </div>
    </div>
  );
}
