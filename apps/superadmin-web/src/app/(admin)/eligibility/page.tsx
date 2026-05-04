import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { compliance, iam, leagueMgmt } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge, statusTone } from "@/components/ui/badge";
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
import type { EligibilityStatus } from "@/lib/api/types";

export const metadata = { title: "Eligibility — SportsPulse" };

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

  const [filteredPage, allPage, persons, seasonsPage] = await Promise.all([
    compliance
      .listEligibility({ status, limit: 100 })
      .catch(() => ({ items: [], nextCursor: null })),
    status
      ? compliance
          .listEligibility({ limit: 200 })
          .catch(() => ({ items: [], nextCursor: null }))
      : Promise.resolve(null),
    iam.listPersons({ limit: 200 }).catch(() => ({ items: [], nextCursor: null })),
    leagueMgmt.listSeasons().catch(() => ({ items: [], nextCursor: null }))
  ]);

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
        eyebrow="COMPLIANCE"
        title="Eligibility"
        description="Per-person, per-season eligibility decisions. Records snapshot rule evaluation at the time of registration; admins can re-evaluate or waive."
        action={
          <CreateEligibilityButton
            persons={persons.items}
            seasons={seasonsPage.items}
          />
        }
      />

      {/* Status overview */}
      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {(
          [
            { label: "Eligible", value: counts.eligible, status: "eligible" as const },
            { label: "Pending", value: counts.pending, status: "pending" as const },
            { label: "Ineligible", value: counts.ineligible, status: "ineligible" as const },
            { label: "Waived", value: counts.waived, status: "waived" as const }
          ] as const
        ).map(({ label, value, status: s }) => (
          <Link
            key={s}
            href={`/eligibility?status=${s}`}
            className="group block rounded-xl border border-border bg-surface-1 p-5 transition-colors duration-fast ease-ease hover:border-border-strong"
          >
            <div className="flex items-center justify-between">
              <Eyebrow>{label}</Eyebrow>
              <IconTile icon={ShieldCheck} tint={tintFor(s)} size="sm" />
            </div>
            <StatNumber value={value} size="md" className="mt-5" />
          </Link>
        ))}
      </section>

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

      {filteredPage.items.length === 0 ? (
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
                    {personMap.get(e.personId) ?? e.personId.slice(0, 8)}
                  </Link>
                </TD>
                <TD>
                  <Badge tone={statusTone(e.status)} mono>
                    {e.status}
                  </Badge>
                </TD>
                <TD className="text-fg-muted">
                  {e.seasonId
                    ? (seasonMap.get(e.seasonId) ?? e.seasonId.slice(0, 8))
                    : "—"}
                </TD>
                <TD className="max-w-xs truncate text-fg-muted">
                  {e.waiverReason ?? "—"}
                </TD>
                <TD className="font-mono text-[11px] text-fg-muted">
                  {new Date(e.evaluatedAt).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit"
                  })}
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
