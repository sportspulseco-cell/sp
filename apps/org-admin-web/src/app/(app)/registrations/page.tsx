/* Hallmark · page: list (registrations) · genre: editorial · theme: project
 * pre-emit critique: P5 H4 E5 S4 R5 V4
 */
import { ScrollText } from "lucide-react";
import { EmptyState, SectionRail } from "@sportspulse/ui";
import { load } from "@sportspulse/api-client";
import { compliance, loadMeScope, registrationV2Admin } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { getActiveOrgId } from "@/lib/active-org";
import { RegistrationsTable } from "./registrations-table";
import { FreeAgentPoolSection } from "./free-agent-pool-section";
import { DocumentReviewQueue } from "@/components/compliance/document-review-queue";

export const dynamic = "force-dynamic";
export const metadata = { title: "Registrations - Org Admin" };

const PENDING_PREFIX = "pending_";

export default async function RegistrationsPage() {
  const scope = await loadMeScope();
  const orgId = await getActiveOrgId(scope);

  const page = orgId
    ? await registrationV2Admin
        .listSubmissions({ orgId, limit: 200 })
        .catch(() => ({ items: [] }))
    : { items: [] };

  // COMP-1: uploaded ID / eligibility documents waiting for a decision.
  const documentsResult = await load(compliance.listDocumentSubmissions({ status: "pending" }));

  const pending = page.items.filter((r) => {
    const v = r.status as string;
    return v === "submitted" || v === "under_review" || v.startsWith(PENDING_PREFIX);
  }).length;

  return (
    <div className="space-y-12">
      <PageHeader
        eyebrow="Registrations"
        title="Registrations"
        description="Every registration submitted across your org's seasons. Approve or reject pending submissions inline; the super-admin queue still handles compliance-flag overrides."
      />

      <section className="space-y-6">
        <SectionRail
          index="01"
          label="Queue"
          subtitle="Each row is one submission from the public funnel. Pending entries surface first; act on them to advance the cohort to active rosters."
          meta={`${pending} pending · ${page.items.length} total`}
        />
        <div className="overflow-hidden rounded-xl border border-border bg-surface-1">
          {page.items.length === 0 ? (
            <div className="px-6 py-12">
              <EmptyState
                icon={ScrollText}
                title="No registrations yet"
                description="Submissions land here as soon as the public funnel takes them."
              />
            </div>
          ) : (
            <RegistrationsTable
              items={page.items.map((r) => {
                const m = (r.metadata ?? {}) as {
                  fullName?: string;
                  email?: string;
                  files?: Record<string, { fileName?: string }>;
                };
                return {
                  id: r.id,
                  name: m.fullName ?? null,
                  email: m.email ?? null,
                  season: r.seasonName ?? null,
                  status: r.status,
                  submittedAt: r.submittedAt,
                  // FR-3.4.5: files uploaded on the registration form.
                  files: Object.entries(m.files ?? {}).map(([key, f]) => ({
                    key,
                    fileName: f?.fileName ?? key
                  }))
                };
              })}
            />
          )}
        </div>
      </section>

      <section className="space-y-6">
        <SectionRail
          index="02"
          label="Documents"
          subtitle="IDs and eligibility documents players upload for your seasons. Approve, reject with a reason, or ask for a new upload; the player sees your decision."
        />
        <DocumentReviewQueue
          initial={documentsResult.ok ? documentsResult.data : null}
          initialError={
            documentsResult.ok
              ? null
              : { status: documentsResult.status, message: documentsResult.message }
          }
        />
      </section>

      <section className="space-y-6">
        <SectionRail
          index="03"
          label="Free agents"
          subtitle="Players looking for a team in your seasons. Assign one to a team to send them an offer; they join the roster when they accept."
        />
        <FreeAgentPoolSection />
      </section>
    </div>
  );
}
