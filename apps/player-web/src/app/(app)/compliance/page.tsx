import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  Check,
  ShieldCheck,
  Upload
} from "lucide-react";
import { Badge, EmptyState, Eyebrow, LoadError } from "@sportspulse/ui";
import { load, type EligibilityRecord } from "@sportspulse/api-client";
import { compliance, loadMeScope } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { UsaHockeyIdForm } from "./usa-hockey-id-form";
import { DocumentsToSign } from "./documents-to-sign";
import { UploadDocuments } from "./upload-documents";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Compliance — SportsPulse" };

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
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
  },
  expiring: {
    label: "Expiring soon",
    tone: "warning",
    description: "Renew before the season ends to stay eligible."
  },
  flagged: {
    label: "Under review",
    tone: "warning",
    description:
      "Flagged for admin review (e.g. duplicate ID). They'll resolve and notify you."
  }
};

export default async function CompliancePage() {
  const scope = await loadMeScope();
  const personId = scope?.personId ?? null;

  const eligibilityPage = personId
    ? await compliance
        .myEligibility()
        .catch(() => ({ items: [], nextCursor: null }))
    : { items: [], nextCursor: null };

  const items: EligibilityRecord[] = eligibilityPage.items;

  // Required registration documents (liability waiver, code of conduct)
  // with signed state, from the same rule the funnel and the pay gate
  // use (COMP-4). A failed load is shown as an error, never as "nothing
  // to sign".
  const docsResult = await load(compliance.myDocuments());
  const docItems = docsResult.ok ? docsResult.data.items : [];

  // Uploaded ID / eligibility documents and where they can go (COMP-3).
  const uploadsResult = await load(compliance.myDocumentUploads());
  const unsignedDocs = docItems.reduce(
    (n, r) => n + r.documents.filter((d) => !d.signed).length,
    0
  );

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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          eyebrow="My account"
          title="Waivers & documents"
          description="Status of every eligibility requirement, waiver, and document on file."
        />
        <UsaHockeyIdForm />
      </div>

      {/* Overall banner */}
      {blocking.length > 0 ? (
        <div className="flex items-start gap-3 rounded-md bg-[var(--tint-rose-bg)] px-4 py-3 text-[var(--tint-rose-fg)]">
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
      ) : unsignedDocs > 0 ? (
        <div className="flex items-start gap-3 rounded-md bg-[var(--tint-amber-bg)] px-4 py-3 text-[var(--tint-amber-fg)]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
          <div>
            <p className="text-[13px] font-medium">
              {unsignedDocs} document{unsignedDocs === 1 ? "" : "s"} to sign
            </p>
            <p className="mt-0.5 text-[12px] opacity-80">
              Your registration cannot be submitted until they are signed.
            </p>
          </div>
        </div>
      ) : pending.length > 0 ? (
        <div className="flex items-start gap-3 rounded-md bg-[var(--tint-amber-bg)] px-4 py-3 text-[var(--tint-amber-fg)]">
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
      ) : items.length > 0 || docItems.length > 0 ? (
        <div className="flex items-start gap-3 rounded-md bg-[var(--tint-emerald-bg)] px-4 py-3 text-[var(--tint-emerald-fg)]">
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

      {!docsResult.ok ? (
        <LoadError
          what="your waivers and documents"
          status={docsResult.status}
          message={docsResult.message}
        />
      ) : docItems.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-[14px] font-semibold tracking-tight text-fg">
            Registration waivers
          </h2>
          <DocumentsToSign items={docItems} />
        </section>
      ) : null}

      <section id="documents" className="space-y-3">
        <h2 className="text-[14px] font-semibold tracking-tight text-fg">
          ID and eligibility documents
        </h2>
        {uploadsResult.ok ? (
          <UploadDocuments
            items={uploadsResult.data.items}
            targets={uploadsResult.data.targets}
          />
        ) : (
          <LoadError
            what="your uploaded documents"
            status={uploadsResult.status}
            message={uploadsResult.message}
          />
        )}
      </section>

      {sorted.length === 0 && docItems.length > 0 ? null : sorted.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="No requirements yet"
          description="Once you register for a season, eligibility checks for waivers, USA Hockey ID, parental consent, and birthdate verification will land here."
        />
      ) : (
        <section className="space-y-3">
        {docItems.length > 0 ? (
          <h2 className="text-[14px] font-semibold tracking-tight text-fg">
            Eligibility
          </h2>
        ) : null}
        <ul className="space-y-3">
          {sorted.map((rec: EligibilityRecord) => {
            const meta = STATUS_COPY[rec.status];
            const ruleName =
              (rec.ruleEvaluation as { name?: string })?.name ??
              "Eligibility check";
            return (
              <li
                key={rec.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-surface-1 p-5"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <Eyebrow>{ruleName}</Eyebrow>
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
                {/* Per-rule action — for blocking statuses, the player
                    can resubmit via the onboarding wizard which holds
                    the role-profile + waiver flow. Per-rule upload
                    endpoints (USA Hockey ID, signed waivers) ship in
                    a follow-up; for now we route to the wizard. */}
                {rec.status === "ineligible" || rec.status === "expired" ? (
                  <Link
                    href="/onboarding"
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--tint-rose-fg)]/30 bg-[var(--tint-rose-bg)] px-3 font-mono text-[10px] uppercase tracking-widest text-[var(--tint-rose-fg)] hover:bg-[var(--tint-rose-bg)] dark:text-[var(--tint-rose-fg)]"
                  >
                    <Upload className="h-3.5 w-3.5" strokeWidth={1.75} />
                    Take action
                    <ArrowRight className="h-3 w-3" strokeWidth={2} />
                  </Link>
                ) : rec.status === "pending" ? (
                  <Link
                    href="/onboarding"
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--tint-amber-fg)]/30 bg-[var(--tint-amber-bg)] px-3 font-mono text-[10px] uppercase tracking-widest text-[var(--tint-amber-fg)] hover:bg-[var(--tint-amber-bg)] dark:text-[var(--tint-amber-fg)]"
                  >
                    Resubmit
                    <ArrowRight className="h-3 w-3" strokeWidth={2} />
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
        </section>
      )}
    </div>
  );
}
