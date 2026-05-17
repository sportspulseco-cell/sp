import Link from "next/link";
import { FileSignature } from "lucide-react";
import {
  Badge,
  EmptyState,
  Eyebrow,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table
} from "@sportspulse/ui";
import { iam, orgAdminForms } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { getActiveOrgId } from "@/lib/active-org";

export const dynamic = "force-dynamic";
export const metadata = { title: "Forms - Org Admin" };

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA");
}

/**
 * Org-admin forms list. Form-builder editing now happens IN-APP via
 * the shared @sportspulse/forms-builder package mounted at
 * /forms/[id] — no super-admin URL exposed to org-admin users
 * anymore (BUG-043 close).
 */
export default async function FormsPage() {
  const scope = await iam.meScope().catch(() => null);
  const orgId = await getActiveOrgId(scope);

  const formsPage = orgId
    ? await orgAdminForms.list({ orgId }).catch(() => ({ items: [] }))
    : { items: [] };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="// Forms"
        title="Registration forms"
        description="Forms bound to your org's seasons. Click any row to edit."
      />

      {formsPage.items.length === 0 ? (
        <EmptyState
          icon={FileSignature}
          title="No registration forms yet"
          description="Once your platform admin (or your own org-admin via the builder below) creates a form against one of your org's seasons, it shows up here."
        />
      ) : (
        <div className="rounded-xl border border-border bg-surface-1">
          <header className="flex items-center justify-between border-b border-border px-5 py-3">
            <Eyebrow>// Published forms</Eyebrow>
            <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
              {formsPage.items.length} total
            </span>
          </header>
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Season</TH>
                <TH>Purpose</TH>
                <TH>Updated</TH>
              </TR>
            </THead>
            <TBody>
              {formsPage.items.map((f) => (
                <TR key={f.id}>
                  <TD>
                    <Link
                      href={`/forms/${f.id}`}
                      className="flex flex-col leading-tight hover:text-accent"
                    >
                      <span className="font-medium text-fg">{f.name}</span>
                      {f.description ? (
                        <span className="text-[11px] text-fg-muted">
                          {f.description}
                        </span>
                      ) : null}
                    </Link>
                  </TD>
                  <TD className="text-[12px] text-fg-muted">
                    {f.seasonName ?? "—"}
                  </TD>
                  <TD>
                    <Badge tone="neutral" mono>
                      {f.purpose.replace(/_/g, " ")}
                    </Badge>
                  </TD>
                  <TD className="text-[11px] text-fg-muted">
                    {fmtDate(f.updatedAt)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </div>
  );
}
