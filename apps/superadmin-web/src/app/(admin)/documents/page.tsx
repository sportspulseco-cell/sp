import { FileSignature, CheckCircle2, Layers, Building2 } from "lucide-react";
import Link from "next/link";
import { compliance, orgs } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { KineticStrip } from "@/components/layout/kinetic-strip";
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
import { CreateDocumentButton } from "@/components/documents/create-document-button";

export const metadata = { title: "Compliance documents — SportsPulse" };

export default async function DocumentsPage() {
  const [docs, orgList] = await Promise.all([
    compliance
      .listDocuments({ limit: 100 })
      .catch(() => ({ items: [], nextCursor: null })),
    orgs.list({ limit: 100 }).catch(() => ({ items: [], nextCursor: null }))
  ]);
  const orgMap = new Map(orgList.items.map((o) => [o.id, o.displayName]));

  const total = docs.items.length;
  const published = docs.items.filter((d) => d.activeVersionId).length;
  const kinds = new Set(docs.items.map((d) => d.kind)).size;
  const orgsCovered = new Set(docs.items.map((d) => d.orgId)).size;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="compliance"
        title="Documents"
        description="Versioned waivers, consents, codes of conduct, parental forms. Each document has an active version that everyone signs against."
        action={<CreateDocumentButton orgs={orgList.items} />}
      />
      <KineticStrip
        cards={[
          { label: "Total docs", value: total, icon: <FileSignature className="h-3.5 w-3.5" strokeWidth={1.75} />, tone: "idle" },
          {
            label: "Published",
            value: published,
            icon: <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.75} />,
            tone: published > 0 ? "ok" : "idle"
          },
          { label: "Distinct kinds", value: kinds, icon: <Layers className="h-3.5 w-3.5" strokeWidth={1.75} />, tone: "info" },
          { label: "Orgs covered", value: orgsCovered, icon: <Building2 className="h-3.5 w-3.5" strokeWidth={1.75} />, tone: "idle" }
        ]}
      />

      {docs.items.length === 0 ? (
        <EmptyState
          icon={FileSignature}
          title="No documents yet"
          description="Create your first compliance document — waiver, code of conduct, media release, etc."
          action={<CreateDocumentButton orgs={orgList.items} />}
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Kind</TH>
              <TH>Org scope</TH>
              <TH>Active version</TH>
              <TH>Updated</TH>
            </TR>
          </THead>
          <TBody>
            {docs.items.map((d) => (
              <TR key={d.id}>
                <TD className="font-medium">
                  <Link href={`/documents/${d.id}`} className="hover:underline">
                    {d.name}
                  </Link>
                  {d.description ? (
                    <p className="mt-0.5 text-[12px] text-fg-muted">
                      {d.description}
                    </p>
                  ) : null}
                </TD>
                <TD>
                  <Badge mono>{d.kind.replace(/_/g, " ")}</Badge>
                </TD>
                <TD className="text-fg-muted">
                  {d.orgId ? (
                    (orgMap.get(d.orgId) ?? d.orgId.slice(0, 8))
                  ) : (
                    <span className="font-mono text-[10px] uppercase tracking-wide">
                      platform
                    </span>
                  )}
                </TD>
                <TD>
                  {d.activeVersionId ? (
                    <span className="font-mono text-[11px] text-fg">
                      {d.activeVersionId.slice(0, 8)}
                    </span>
                  ) : (
                    <Badge tone="warning" mono>
                      DRAFT
                    </Badge>
                  )}
                </TD>
                <TD className="text-fg-muted">
                  {new Date(d.updatedAt).toLocaleDateString()}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
