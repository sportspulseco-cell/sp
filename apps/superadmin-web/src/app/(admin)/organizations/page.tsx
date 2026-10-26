import { fetchAll } from "@sportspulse/api-client";
import { Alert, LocalDate } from "@sportspulse/ui";
import { Building2, Globe2, Layers, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { orgs } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { KineticStrip } from "@/components/layout/kinetic-strip";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge, statusTone } from "@/components/ui/badge";
import { UrlFilters } from "@/components/ui/url-filters";
import {
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table
} from "@/components/ui/table";
import { CreateOrgButton } from "@/components/orgs/create-org-button";
import type { Org } from "@/lib/api/types";

export const metadata = { title: "Organizations — SportsPulse" };

/**
 * Filters live in the URL (?search=&status=&type=&country=). `search`
 * keeps its name because older links and the API use it.
 */
export default async function OrganizationsPage({
  searchParams
}: {
  searchParams?: Promise<{ search?: string; status?: string; type?: string; country?: string; created?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  let loadFailed = false;
  const page = await fetchAll((cursor) => orgs.list({ limit: 100, cursor })).catch((e) => {
    // Show the failure; an empty list here read as "No organizations yet".
    console.error("[organizations] orgs.list failed", e);
    loadFailed = true;
    return { items: [] as Org[] };
  });

  const q = sp.search?.trim().toLowerCase() ?? "";
  const shown = page.items.filter((o) => {
    if (sp.status && o.status !== sp.status) return false;
    if (sp.type && o.orgType !== sp.type) return false;
    if (sp.country && o.countryCode !== sp.country) return false;
    if (q) {
      const hay = `${o.displayName} ${o.legalName} ${o.slug}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const typeOptions = [...new Set(page.items.map((o) => o.orgType))]
    .sort()
    .map((t) => ({ value: t, label: t.replace(/_/g, " ") }));
  const countryOptions = [...new Set(page.items.map((o) => o.countryCode).filter(Boolean))]
    .sort()
    .map((c) => ({ value: c, label: c }));

  const total = page.items.length;
  const active = page.items.filter((o) => o.status === "active").length;
  const suspended = page.items.filter((o) => o.status === "suspended").length;
  const countries = new Set(
    page.items.map((o) => o.countryCode).filter(Boolean)
  ).size;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Organisations"
        title="Organizations"
        description="Clubs, leagues and associations on the platform. Each one has its own leagues, seasons, teams and admins."
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

      <div className="space-y-2">
        <UrlFilters
          searchParam="search"
          searchPlaceholder="Search organizations by name, legal name or slug"
          selects={[
            {
              param: "status",
              label: "Status",
              allLabel: "All statuses",
              options: [
                { value: "active", label: "Active" },
                { value: "suspended", label: "Suspended" },
                { value: "archived", label: "Archived" }
              ]
            },
            { param: "type", label: "Type", allLabel: "All types", options: typeOptions },
            { param: "country", label: "Country", allLabel: "All countries", options: countryOptions }
          ]}
        />
        <p className="text-[12px] text-fg-muted">
          Showing {shown.length} of {total} organizations
        </p>
      </div>

      {loadFailed ? (
        <Alert tone="error">
          Could not load organizations. This is a server problem on our side, not your data. Reload to try again.
        </Alert>
      ) : total === 0 ? (
        <EmptyOrgs />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No organizations match these filters"
          description="Clear the search or pick a different status, type or country."
        />
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
            {shown.map((o) => (
              <TR key={o.id}>
                <TD className="font-medium">
                  <Link
                    href={`/organizations/${o.id}`}
                    className="hover:underline"
                  >
                    {o.displayName}
                  </Link>
                  {sp.created === o.id ? (
                    <Badge tone="success" className="ml-2">
                      New
                    </Badge>
                  ) : null}
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
                  <LocalDate iso={o.createdAt} format="date" />
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
