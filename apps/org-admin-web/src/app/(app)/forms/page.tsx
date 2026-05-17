import { ExternalLink, FileSignature } from "lucide-react";
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

const SUPERADMIN_URL =
  process.env.NEXT_PUBLIC_SUPERADMIN_URL ?? "https://sp-superadmin.vercel.app";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA");
}

/**
 * Org-admin forms list. The form BUILDER itself is a super-admin-only
 * feature (god-app pattern per CLAUDE.md) — but org-admin users own
 * the season their form runs against, so they need a place to see
 * what's published and link out for edits.
 *
 * Was a pure dead-end before BUG-043 fix (external link to sp-superadmin
 * /forms which org_admin couldn't even sign into).
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
        description="Forms bound to your org's seasons. Editing the schema runs through the super-admin form builder."
      />

      {formsPage.items.length === 0 ? (
        <EmptyState
          icon={FileSignature}
          title="No registration forms yet"
          description="Forms are created by a super-admin against one of your org's seasons. Once a form is bound, it shows up here."
        />
      ) : (
        <div className="rounded-xl border border-border bg-surface-1">
          <header className="flex items-center justify-between border-b border-border px-5 py-3">
            <Eyebrow>// Published forms</Eyebrow>
            <a
              href={`${SUPERADMIN_URL}/forms`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-fg-muted hover:text-fg"
              title="Form schema editing happens in the super-admin builder (requires super_admin role)."
            >
              Edit in super-admin
              <ExternalLink className="h-3 w-3" strokeWidth={1.75} />
            </a>
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
                    <div className="flex flex-col leading-tight">
                      <span className="font-medium text-fg">{f.name}</span>
                      {f.description ? (
                        <span className="text-[11px] text-fg-muted">
                          {f.description}
                        </span>
                      ) : null}
                    </div>
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
