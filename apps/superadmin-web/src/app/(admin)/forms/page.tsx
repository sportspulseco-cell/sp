import { FileSignature } from "lucide-react";
import Link from "next/link";
import { FORM_PURPOSE_LABELS, SYSTEM_ROLE_BY_CODE } from "@sportspulse/kernel";
import { orgs, registration } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import {
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table
} from "@/components/ui/table";
import { CreateFormButton } from "@/components/forms/create-form-button";

export const metadata = { title: "Registration forms — SportsPulse" };

export default async function FormsPage() {
  const [forms, orgList] = await Promise.all([
    registration.listForms().catch(() => ({ items: [], nextCursor: null })),
    orgs.list({ limit: 100 }).catch(() => ({ items: [], nextCursor: null }))
  ]);
  const orgMap = new Map(orgList.items.map((o) => [o.id, o.displayName]));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="COMPLIANCE"
        title="Registration forms"
        description="Versioned forms used for player + team registration. Each form has zero-or-more versions; only the published one is active."
        action={<CreateFormButton orgs={orgList.items} />}
      />

      {forms.items.length === 0 ? (
        <EmptyState
          icon={FileSignature}
          title="No forms yet"
          description="Create the first registration form for any organization."
          action={<CreateFormButton orgs={orgList.items} />}
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Org</TH>
              <TH>Purpose</TH>
              <TH>Applies to</TH>
              <TH>Scope</TH>
              <TH>Active version</TH>
              <TH>Updated</TH>
            </TR>
          </THead>
          <TBody>
            {forms.items.map((f) => (
              <TR key={f.id}>
                <TD className="font-medium">
                  <Link href={`/forms/${f.id}`} className="hover:underline">
                    {f.name}
                  </Link>
                  {f.description ? (
                    <p className="mt-0.5 text-[12px] text-fg-muted">
                      {f.description}
                    </p>
                  ) : null}
                </TD>
                <TD className="text-fg-muted">
                  {orgMap.get(f.orgId) ?? f.orgId.slice(0, 8)}
                </TD>
                <TD>
                  <Badge mono tone={f.purpose === "season_registration" ? "neutral" : "info"}>
                    {FORM_PURPOSE_LABELS[f.purpose] ?? f.purpose}
                  </Badge>
                </TD>
                <TD className="text-[12px] text-fg-muted">
                  {f.appliesToRoles.length === 0 ? (
                    <span className="italic text-fg-muted">All roles</span>
                  ) : (
                    f.appliesToRoles
                      .map((c) => SYSTEM_ROLE_BY_CODE[c]?.name ?? c)
                      .join(", ")
                  )}
                </TD>
                <TD>
                  <Badge mono>{f.scope}</Badge>
                </TD>
                <TD>
                  {f.activeVersionId ? (
                    <span className="font-mono text-[11px] text-fg">
                      {f.activeVersionId.slice(0, 8)}
                    </span>
                  ) : (
                    <Badge tone="warning" mono>
                      DRAFT
                    </Badge>
                  )}
                </TD>
                <TD className="text-fg-muted">
                  {new Date(f.updatedAt).toLocaleDateString()}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
