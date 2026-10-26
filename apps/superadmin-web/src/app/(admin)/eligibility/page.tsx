import { fetchAll, load } from "@sportspulse/api-client";
import { Badge, LoadError, LocalDate } from "@sportspulse/ui";
import { ShieldCheck, Clock, ShieldAlert, ShieldOff } from "lucide-react";
import Link from "next/link";
import { compliance, iam, leagueMgmt } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { KineticStrip } from "@/components/layout/kinetic-strip";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/eyebrow";
import { IconTile, type Tint } from "@/components/ui/icon-tile";
import { StatNumber } from "@/components/ui/stat-number";
import {
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table
} from "@/components/ui/table";
import { WaiveEligibilityButton } from "@/components/eligibility/waive-eligibility-button";
import { CreateEligibilityButton } from "@/components/eligibility/create-eligibility-button";
import { ComplianceSweepBar } from "@/components/eligibility/compliance-sweep-bar";
import { DocumentReviewQueue } from "@/components/eligibility/document-review-queue";
import type { EligibilityStatus } from "@/lib/api/types";

export const metadata = { title: "Eligibility · Super Admin" };

const STATUS_FILTERS: Array<{
  key: EligibilityStatus | "all";
  label: string;
}> = [
  { key: "all", label: "All" },
  { key: "eligible", label: "Eligible" },
  { key: "pending", label: "Pending" },
  { key: "ineligible", label: "Ineligible" },
  { key: "waived", label: "Waived" },
  { key: "expired", label: "Expired" }
];

function tintFor(s: EligibilityStatus): Tint {
  if (s === "eligible") return "emerald";
  if (s === "pending") return "amber";
  if (s === "ineligible") return "rose";
  if (s === "waived") return "blue";
  return "neutral";
}

export default async function EligibilityPage({
  searchParams
}: {
  searchParams?: Promise<{ status?: EligibilityStatus }>;
}) {
  const sp = await searchParams;
  const status = sp?.status;

  const [filteredResult, allPage, persons, seasonsPage, documentsResult] = await Promise.all([
    load(compliance.listEligibility({ status, limit: 100 })),
    status
      ? compliance
          .listEligibility({ limit: 100 })
          .catch(() => ({ items: [], nextCursor: null }))
      : Promise.resolve(null),
    fetchAll((cursor) => iam.listPersons({ limit: 100, cursor })).catch(() => ({ items: [], nextCursor: null })),
    fetchAll((cursor) => leagueMgmt.listSeasons({ limit: 100, cursor })).catch(() => ({ items: [], nextCursor: null })),
    // COMP-1: uploaded ID / eligibility documents waiting for a decision.
    load(compliance.listDocumentSubmissions({ status: "pending" }))
  ]);
  if (!filteredResult.ok) {
    console.error("[eligibility] listEligibility failed", filteredResult.status, filteredResult.message);
  }
  const filteredPage = filteredResult.ok
    ? filteredResult.data
    : { items: [], nextCursor: null };

  const personMap = new Map(
    persons.items.map((p) => [
      p.id,
      p.preferredName ?? `${p.legalFirstName} ${p.legalLastName}`
    ])
  );
  const seasonMap = new Map(seasonsPage.items.map((s) => [s.id, s.name]));

  const allItems = (allPage ?? filteredPage).items;
  const counts = {
    eligible: allItems.filter((r) => r.status === "eligible").length,
    pending: allItems.filter((r) => r.status === "pending").length,
    ineligible: allItems.filter((r) => r.status === "ineligible").length,
    waived: allItems.filter((r) => r.status === "waived").length
  };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Registration"
        title="Eligibility"
        description="Who is cleared to play each season, based on age, documents and USA Hockey number. Review uploaded IDs, re-check or waive a player here."
        action={
          <CreateEligibilityButton
            persons={persons.items}
            seasons={seasonsPage.items}
          />
        }
      />

      <DocumentReviewQueue
        initial={documentsResult.ok ? documentsResult.data : null}
        initialError={
          documentsResult.ok
            ? null
            : { status: documentsResult.status, message: documentsResult.message }
        }
      />

      <ComplianceSweepBar
        seasons={seasonsPage.items.map((s) => ({ id: s.id, name: s.name }))}
        initialSeasonId={seasonsPage.items[0]?.id ?? null}
      />

      <KineticStrip
        cards={[
          {
            label: "Eligible",
            value: counts.eligible,
            icon: <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.75} />,
            tone: "ok"
          },
          {
            label: "Pending",
            value: counts.pending,
            icon: <Clock className="h-3.5 w-3.5" strokeWidth={1.75} />,
            tone: counts.pending > 0 ? "warn" : "idle"
          },
          {
            label: "Ineligible",
            value: counts.ineligible,
            icon: <ShieldOff className="h-3.5 w-3.5" strokeWidth={1.75} />,
            tone: counts.ineligible > 0 ? "live" : "idle"
          },
          {
            label: "Waived",
            value: counts.waived,
            icon: <ShieldAlert className="h-3.5 w-3.5" strokeWidth={1.75} />,
            tone: "info"
          }
        ]}
      />

      {/* Status filter pills */}
      <div className="flex flex-wrap items-center gap-1.5">
        {STATUS_FILTERS.map((f) => {
          const active = (status ?? "all") === f.key;
          const href =
            f.key === "all" ? "/eligibility" : `/eligibility?status=${f.key}`;
          return (
            <Link
              key={f.key}
              href={href}
              className={
                active
                  ? "rounded-full bg-fg px-3 py-1 text-[12px] font-medium text-bg"
                  : "rounded-full border border-border bg-surface-1 px-3 py-1 text-[12px] font-medium text-fg-muted hover:border-border-strong hover:text-fg"
              }
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      {!filteredResult.ok ? (
        <LoadError
          what="eligibility records"
          status={filteredResult.status}
          message={filteredResult.message}
        />
      ) : filteredPage.items.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="No eligibility records"
          description={
            status
              ? `Nothing currently in the ${status} bucket.`
              : "Records are created at registration time or manually for waivers."
          }
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Person</TH>
              <TH>Status</TH>
              <TH>Season</TH>
              <TH>Waiver reason</TH>
              <TH>Evaluated</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {filteredPage.items.map((e) => (
              <TR key={e.id}>
                <TD className="font-medium">
                  <Link
                    href={`/persons/${e.personId}`}
                    className="hover:underline"
                  >
                    {personMap.get(e.personId) ?? "Unknown player"}
                  </Link>
                </TD>
                <TD>
                  <Badge status={e.status} domain="compliance" />
                </TD>
                <TD className="text-fg-muted">
                  {e.seasonId
                    ? (seasonMap.get(e.seasonId) ?? "Unknown season")
                    : "—"}
                </TD>
                <TD className="max-w-xs truncate text-fg-muted">
                  {/* A reason only explains a standing waiver; an older one
                      left on a re-evaluated record must not read as current (COMP-17). */}
                  {e.status === "waived" ? (e.waiverReason ?? "—") : "—"}
                </TD>
                <TD className="font-mono text-[11px] text-fg-muted">
                  <LocalDate iso={e.evaluatedAt} format="dateTime" />
                </TD>
                <TD className="text-right">
                  {e.status !== "waived" ? (
                    <WaiveEligibilityButton id={e.id} />
                  ) : null}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
