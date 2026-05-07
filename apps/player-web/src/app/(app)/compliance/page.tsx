import {
  AlertCircle,
  Check,
  ShieldCheck
} from "lucide-react";
import { Badge, EmptyState, Eyebrow } from "@sportspulse/ui";
import type { EligibilityRecord } from "@sportspulse/api-client";
import { compliance, iam } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Compliance — SportsPulse" };

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

const STATUS_COPY: Record<
  EligibilityRecord["status"],
  { label: string; tone: "success" | "warning" | "danger" | "neutral" | "info"; description: string }
> = {
  eligible: {
    label: "Eligible",
    tone: "success",
    description: "Cleared to play."
  },
  pending: {
    label: "Pending",
    tone: "warning",
    description: "Verification in progress — admin will follow up if anything is missing."
  },
  ineligible: {
    label: "Ineligible",
    tone: "danger",
    description: "Action required before you can play. Contact your admin."
  },
  waived: {
    label: "Waived",
    tone: "info",
    description: "An admin has issued a waiver for this requirement."
  },
  expired: {
    label: "Expired",
    tone: "danger",
    description: "Renew this requirement to continue playing."
  }
};

export default async function CompliancePage() {
  const scope = await iam.meScope().catch(() => null);
  const personId = scope?.personId ?? null;

  const eligibilityPage = personId
    ? await compliance
        .listEligibility({ personId, limit: 50 })
        .catch(() => ({ items: [], nextCursor: null }))
    : { items: [], nextCursor: null };

  const items: EligibilityRecord[] = eligibilityPage.items;

  // Sort: blocking issues (ineligible / expired) first, then warning,
  // then green.
  const tier = (s: EligibilityRecord["status"]) =>
    s === "ineligible" || s === "expired" ? 0 : s === "pending" ? 1 : 2;
  const sorted = items
    .slice()
    .sort(
      (a: EligibilityRecord, b: EligibilityRecord) =>
        tier(a.status) - tier(b.status)
    );

  const blocking = items.filter(
    (i: EligibilityRecord) =>
      i.status === "ineligible" || i.status === "expired"
  );
  const pending = items.filter(
    (i: EligibilityRecord) => i.status === "pending"
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="// Compliance"
        title="Compliance"
        description="Status of every eligibility requirement, waiver, and document on file."
      />

      {/* Overall banner */}
      {blocking.length > 0 ? (
        <div className="flex items-start gap-3 rounded-md bg-rose-500/10 px-4 py-3 text-rose-700 dark:text-rose-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
          <div>
            <p className="text-[13px] font-medium">
              {blocking.length} item
              {blocking.length === 1 ? "" : "s"} blocking participation
            </p>
            <p className="mt-0.5 text-[12px] opacity-80">
              Resolve the blocking items below to be cleared to play.
            </p>
          </div>
        </div>
      ) : pending.length > 0 ? (
        <div className="flex items-start gap-3 rounded-md bg-amber-500/10 px-4 py-3 text-amber-700 dark:text-amber-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
          <div>
            <p className="text-[13px] font-medium">
              {pending.length} item
              {pending.length === 1 ? "" : "s"} pending verification
            </p>
            <p className="mt-0.5 text-[12px] opacity-80">
              Your admin is reviewing — you don't need to do anything right now.
            </p>
          </div>
        </div>
      ) : items.length > 0 ? (
        <div className="flex items-start gap-3 rounded-md bg-emerald-500/10 px-4 py-3 text-emerald-700 dark:text-emerald-300">
          <Check className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.25} />
          <div>
            <p className="text-[13px] font-medium">
              All clear — you're fully compliant.
            </p>
            <p className="mt-0.5 text-[12px] opacity-80">
              Nothing needs your attention right now.
            </p>
          </div>
        </div>
      ) : null}

      {sorted.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="No requirements yet"
          description="Once you register for a season, eligibility checks for waivers, USA Hockey ID, parental consent, and birthdate verification will land here."
        />
      ) : (
        <ul className="space-y-3">
          {sorted.map((rec: EligibilityRecord) => {
            const meta = STATUS_COPY[rec.status];
            const ruleName =
              (rec.ruleEvaluation as { name?: string })?.name ??
              rec.governingBodyId?.slice(0, 8) ??
              "Eligibility check";
            return (
              <li
                key={rec.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-surface-1 p-5"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <Eyebrow>// {ruleName}</Eyebrow>
                    <Badge mono tone={meta.tone}>
                      {meta.label}
                    </Badge>
                  </div>
                  <p className="text-[13px] text-fg">{meta.description}</p>
                  {rec.waiverReason ? (
                    <p className="text-[12px] text-fg-muted">
                      Reason: {rec.waiverReason}
                    </p>
                  ) : null}
                  <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                    Effective {fmtDate(rec.effectiveFrom)}
                    {rec.effectiveTo
                      ? ` → ${fmtDate(rec.effectiveTo)}`
                      : ""}{" "}
                    · Last evaluated {fmtDate(rec.evaluatedAt)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
