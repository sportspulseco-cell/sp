/* Hallmark · page: list (forms) · genre: editorial · theme: project
 * pre-emit critique: P5 H4 E5 S4 R5 V4
 */
import Link from "next/link";
import { FileSignature } from "lucide-react";
import { Badge, EmptyState, LoadError, LocalDate, PageHeader, SectionRail, TBody, TD, TH, THead, TR, Table } from "@sportspulse/ui";
import { loadMeScope, orgAdminForms, orgs } from "@/lib/api/server-api";
import { CreateFormButton } from "@/components/forms/create-form-button";
import { getActiveOrgId } from "@/lib/active-org";
import { load } from "@sportspulse/api-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Forms · Org Admin" };

export default async function FormsPage() {
  const scope = await loadMeScope();
  const orgId = await getActiveOrgId(scope);

  const [formsResult, orgList] = await Promise.all([
    orgId
      ? load(orgAdminForms.list({ orgId }))
      : Promise.resolve(null),
    orgs.list({ limit: 100 }).catch(() => ({ items: [], nextCursor: null }))
  ]);
  const formsPage = formsResult?.ok ? formsResult.data : { items: [] };
  const activeOrg = orgId
    ? orgList.items.find((o) => o.id === orgId) ?? null
    : null;

  return (
    <div className="space-y-12">
      <PageHeader
        eyebrow="Registration"
        title="Registration forms"
        description="Forms bound to your org's seasons. Each form drives a chunk of the public registration funnel: questions, waivers, pricing tiers, and email templates."
        action={
          activeOrg ? (
            <CreateFormButton
              activeOrgId={activeOrg.id}
              activeOrgName={activeOrg.displayName}
            />
          ) : null
        }
      />

      <section className="space-y-6">
        <SectionRail
          index="01"
          label="Published"
          subtitle="Open one to edit its questions, divisions, pricing, and email templates. New forms can be created here directly. No platform admin handoff."
          meta={`${formsPage.items.length} total`}
        />
        <div className="overflow-hidden rounded-xl border border-border bg-surface-1">
          {formsResult && !formsResult.ok ? (
            <div className="p-6">
              <LoadError what="registration forms" status={formsResult.status} message={formsResult.message} />
            </div>
          ) : formsPage.items.length === 0 ? (
            <div className="px-6 py-12">
              <EmptyState
                icon={FileSignature}
                title="No registration forms yet"
                description="Create your first registration form for one of your org's seasons."
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Season</TH>
                  <TH>Purpose</TH>
                  <TH className="text-right">Updated</TH>
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
                    <TD className="text-right text-[11px] text-fg-muted">
                      <LocalDate iso={f.updatedAt} format="date" />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </div>
      </section>
    </div>
  );
}
