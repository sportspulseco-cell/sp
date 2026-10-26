"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, FileCheck2, Loader2 } from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Dialog,
  EmptyState,
  LoadError,
  LocalDate,
  Select,
  Skeleton,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  useLocalDate
} from "@sportspulse/ui";
import {
  COMPLIANCE_DOCUMENT_KIND_LABELS,
  COMPLIANCE_DOCUMENT_STATUS_LABELS,
  COMPLIANCE_DECISION_REASON_MAX,
  formatCalendarDate,
  type ComplianceDocumentDecision,
  type ComplianceDocumentStatus
} from "@sportspulse/kernel";
import type {
  AdminComplianceDocument,
  ComplianceDocumentQueuePage,
  ComplianceFileLink,
  LicenceIdCheck
} from "@sportspulse/api-client";
import { LICENCE_CHECK_FIELD_LABELS } from "@sportspulse/kernel";
import { LicenceScan } from "./licence-scan";

/** Transport injected by the consuming app (sa-web / org-admin-web). Scope is enforced by the API. */
export interface DocumentReviewApi {
  list: (q: { status?: ComplianceDocumentStatus; cursor?: string }) => Promise<ComplianceDocumentQueuePage>;
  decide: (
    id: string,
    body: { decision: ComplianceDocumentDecision; reason?: string | null }
  ) => Promise<{ alreadyDecided: boolean; notified: number; submission: AdminComplianceDocument }>;
  fileUrl: (id: string) => Promise<ComplianceFileLink>;
  /** UC-29 licence barcode check. Without it the scan section is hidden. */
  licenceCheck?: (
    id: string,
    body: { barcodeText: string; method: "camera" | "photo" }
  ) => Promise<{ check: LicenceIdCheck }>;
}

type Filter = ComplianceDocumentStatus | "all";

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "pending", label: COMPLIANCE_DOCUMENT_STATUS_LABELS.pending },
  { key: "resubmit_requested", label: COMPLIANCE_DOCUMENT_STATUS_LABELS.resubmit_requested },
  { key: "rejected", label: COMPLIANCE_DOCUMENT_STATUS_LABELS.rejected },
  { key: "approved", label: COMPLIANCE_DOCUMENT_STATUS_LABELS.approved },
  { key: "all", label: "All documents" }
];

/** "Mar 4, 2008 (18)" from a YYYY-MM-DD date of birth. */
function dobLabel(dob: string | null): string {
  if (!dob) return "Not on file";
  const [y, m, d] = dob.split("-").map(Number);
  if (!y || !m || !d) return dob;
  const now = new Date();
  let age = now.getUTCFullYear() - y;
  if (now.getUTCMonth() + 1 < m || (now.getUTCMonth() + 1 === m && now.getUTCDate() < d)) age -= 1;
  return `${formatCalendarDate(dob)} (${age})`;
}

function divisionRule(d: AdminComplianceDocument): string | null {
  if (!d.divisionName) return null;
  const parts: string[] = [d.divisionName];
  if (d.ageGroupLabel) {
    const years =
      d.birthYearMin && d.birthYearMax
        ? `born ${d.birthYearMin} to ${d.birthYearMax}`
        : d.birthYearMin
          ? `born ${d.birthYearMin} or later`
          : d.birthYearMax
            ? `born ${d.birthYearMax} or earlier`
            : null;
    parts.push(years ? `${d.ageGroupLabel}, ${years}` : d.ageGroupLabel);
  }
  if (d.divisionGender && d.divisionGender !== "open") parts.push(d.divisionGender);
  return parts.join(" · ");
}

function forLabel(d: AdminComplianceDocument): string {
  return [d.seasonName ?? "No season", d.orgName].filter(Boolean).join(" · ");
}

function sizeLabel(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Review queue for player-uploaded ID and eligibility documents
 * (COMP-1, UC-29). Lists what the API returns for the caller's scope;
 * "Review" opens the file, the date of birth and the division rule next
 * to the three decisions. A decision updates the row from the API's
 * answer, in place. Shared by sa-web (/eligibility) and org-admin-web
 * (/registrations).
 */
export function DocumentReviewQueue({
  api,
  initial,
  initialError,
  personHref
}: {
  api: DocumentReviewApi;
  /** First page for the "pending" filter, loaded by the page on the server. */
  initial: ComplianceDocumentQueuePage | null;
  initialError?: { status: number | null; message: string } | null;
  /** Link to the person's page in this console, when there is one. */
  personHref?: (personId: string) => string | null;
}) {
  const [filter, setFilter] = useState<Filter>("pending");
  const [page, setPage] = useState<ComplianceDocumentQueuePage | null>(initial);
  const [error, setError] = useState(initialError ?? null);
  const [loading, setLoading] = useState(false);
  const [reviewing, setReviewing] = useState<AdminComplianceDocument | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  // State starts from the server's first page and is then owned here:
  // a later server refresh must not drop a row the admin just decided.

  async function load(next: Filter, cursor?: string) {
    setLoading(true);
    setFlash(null);
    try {
      const res = await api.list({ status: next === "all" ? undefined : next, cursor });
      setPage((prev) => (cursor && prev ? { ...res, items: [...prev.items, ...res.items] } : res));
      setError(null);
    } catch (e) {
      const err = e as Error & { status?: number };
      setError({ status: typeof err.status === "number" ? err.status : null, message: err.message });
    } finally {
      setLoading(false);
    }
  }

  function onDecided(updated: AdminComplianceDocument, previous: ComplianceDocumentStatus, msg: string) {
    setPage((prev) => {
      if (!prev) return prev;
      const counts = { ...prev.counts };
      if (previous !== updated.status) {
        counts[previous] = Math.max(0, (counts[previous] ?? 0) - 1);
        counts[updated.status] = (counts[updated.status] ?? 0) + 1;
      }
      return { ...prev, counts, items: prev.items.map((i) => (i.id === updated.id ? updated : i)) };
    });
    setFlash(msg);
    setReviewing(null);
  }

  const waiting = page?.counts.pending ?? 0;
  const total = page ? Object.values(page.counts).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-semibold tracking-tight text-fg">Documents to review</h2>
          <p className="mt-1 text-[13px] text-fg-muted">
            {page
              ? `${waiting} waiting for review · ${total} uploaded in your scope`
              : "IDs and eligibility documents players upload."}
          </p>
        </div>
        <div className="w-56">
          <label htmlFor="document-queue-filter" className="sr-only">
            Show
          </label>
          <Select
            id="document-queue-filter"
            value={filter}
            disabled={loading}
            onChange={(e) => {
              const next = e.target.value as Filter;
              setFilter(next);
              void load(next);
            }}
          >
            {FILTERS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
                {page && f.key !== "all" ? ` (${page.counts[f.key] ?? 0})` : ""}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {flash ? (
        <Alert tone="success" role="status">
          {flash}
        </Alert>
      ) : null}

      {error ? (
        <LoadError what="the documents to review" status={error.status} message={error.message} />
      ) : !page ? (
        <div role="status" aria-label="Loading documents" className="space-y-2"><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
      ) : page.items.length === 0 ? (
        <EmptyState
          icon={FileCheck2}
          title={filter === "pending" ? "Nothing waiting for review" : "No documents here"}
          description="Players upload IDs and eligibility documents from Waivers & documents in the player app. They appear here for the seasons you run."
        />
      ) : (
        <div className="space-y-3">
          <Table>
            <THead>
              <TR>
                <TH>Person</TH>
                <TH>Document</TH>
                <TH>For</TH>
                <TH>Uploaded</TH>
                <TH>Status</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {page.items.map((d) => {
                const href = personHref?.(d.personId) ?? null;
                return (
                  <TR key={d.id} data-submission-id={d.id} className="align-top">
                    <TD>
                      {href ? (
                        <a href={href} className="font-medium text-fg hover:underline">
                          {d.personName}
                        </a>
                      ) : (
                        <span className="font-medium text-fg">{d.personName}</span>
                      )}
                      <p className="text-[12px] text-fg-muted">Born {dobLabel(d.dobDate)}</p>
                    </TD>
                    <TD className="text-fg">{COMPLIANCE_DOCUMENT_KIND_LABELS[d.kind]}</TD>
                    <TD className="text-fg-muted">{forLabel(d)}</TD>
                    <TD className="text-fg-muted">
                      <LocalDate iso={d.createdAt} format="date" />
                      {d.submittedByOther && d.submittedByName ? (
                        <p className="text-[12px]">by {d.submittedByName}</p>
                      ) : null}
                    </TD>
                    <TD>
                      <Badge status={d.status} domain="compliance">
                        {COMPLIANCE_DOCUMENT_STATUS_LABELS[d.status]}
                      </Badge>
                      {d.latestDecision?.reason ? (
                        <p className="mt-1 max-w-[240px] text-[12px] text-fg-muted">{d.latestDecision.reason}</p>
                      ) : null}
                    </TD>
                    <TD className="text-right">
                      <Button size="sm" variant={d.status === "pending" ? "primary" : "outline"} onClick={() => setReviewing(d)}>
                        Review
                      </Button>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
          {page.nextCursor ? (
            <div>
              <Button
                size="sm"
                variant="outline"
                disabled={loading}
                onClick={() => void load(filter, page.nextCursor ?? undefined)}
              >
                {loading ? "Loading…" : "Show more"}
              </Button>
            </div>
          ) : null}
        </div>
      )}

      {reviewing ? (
        <ReviewDialog
          doc={reviewing}
          api={api}
          onClose={() => setReviewing(null)}
          onDecided={onDecided}
        />
      ) : null}
    </div>
  );
}

function ReviewDialog({
  doc,
  api,
  onClose,
  onDecided
}: {
  doc: AdminComplianceDocument;
  api: DocumentReviewApi;
  onClose: () => void;
  onDecided: (updated: AdminComplianceDocument, previous: ComplianceDocumentStatus, msg: string) => void;
}) {
  const [link, setLink] = useState<ComplianceFileLink | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<ComplianceDocumentDecision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [idChecks, setIdChecks] = useState<LicenceIdCheck[]>(doc.idChecks ?? []);
  const rule = useMemo(() => divisionRule(doc), [doc]);
  const localDate = useLocalDate();
  // The consuming app builds `api` inline; keep the latest without
  // re-running the link fetch (each fetch is an audited file view).
  const apiRef = useRef(api);
  apiRef.current = api;

  useEffect(() => {
    let live = true;
    apiRef.current
      .fileUrl(doc.id)
      .then((l) => live && setLink(l))
      .catch((e: Error) => live && setLinkError(e.message));
    return () => {
      live = false;
    };
  }, [doc.id]);

  async function decide(decision: ComplianceDocumentDecision) {
    setError(null);
    const trimmed = reason.trim();
    if (decision !== "approved" && !trimmed) {
      setError(
        decision === "rejected"
          ? "Give the player a reason for the rejection."
          : "Tell the player what to fix in the new upload."
      );
      return;
    }
    setBusy(decision);
    try {
      const res = await api.decide(doc.id, { decision, reason: trimmed || null });
      const label = COMPLIANCE_DOCUMENT_STATUS_LABELS[res.submission.status];
      const msg = res.alreadyDecided
        ? `${doc.personName}: already ${label.toLowerCase()}. Nothing changed.`
        : `${doc.personName}: ${label.toLowerCase()}. ${
            res.notified > 0
              ? `${res.notified} notification${res.notified === 1 ? "" : "s"} queued.`
              : "No notification could be queued."
          }`;
      onDecided(res.submission, doc.status, msg);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const isImage = link?.contentType.startsWith("image/") ?? doc.contentType.startsWith("image/");

  return (
    <Dialog
      open
      onClose={busy ? () => undefined : onClose}
      title={`${COMPLIANCE_DOCUMENT_KIND_LABELS[doc.kind]}: ${doc.personName}`}
      description={`Uploaded ${localDate(doc.createdAt, "dateTime")}${doc.submittedByOther && doc.submittedByName ? ` by ${doc.submittedByName}` : ""}.`}
      size="lg"
    >
      <div className="space-y-5">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
          <div>
            <dt className="text-fg-muted">Date of birth on file</dt>
            <dd className="text-fg">{dobLabel(doc.dobDate)}</dd>
          </div>
          <div>
            <dt className="text-fg-muted">For</dt>
            <dd className="text-fg">{forLabel(doc)}</dd>
          </div>
          <div>
            <dt className="text-fg-muted">Division rule</dt>
            <dd className="text-fg">{rule ?? "No division on this registration"}</dd>
          </div>
          <div>
            <dt className="text-fg-muted">Status</dt>
            <dd>
              <Badge status={doc.status} domain="compliance">
                {COMPLIANCE_DOCUMENT_STATUS_LABELS[doc.status]}
              </Badge>
            </dd>
          </div>
        </dl>

        <div className="rounded-md border border-border bg-surface-2 p-3">
          {linkError ? (
            <Alert tone="error">Could not get a link to the file: {linkError}</Alert>
          ) : !link ? (
            <p className="flex items-center gap-2 text-[13px] text-fg-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Getting a private link to the file…
            </p>
          ) : (
            <div className="space-y-3">
              {isImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={link.url}
                  alt={`${COMPLIANCE_DOCUMENT_KIND_LABELS[doc.kind]} uploaded for ${doc.personName}`}
                  className="max-h-80 w-auto rounded-md border border-border"
                />
              ) : null}
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[13px] font-medium text-fg underline"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Open the file ({sizeLabel(doc.sizeBytes)})
              </a>
              <p className="text-[12px] text-fg-muted">The link works for 5 minutes. Each opening is logged.</p>
            </div>
          )}
        </div>

        {doc.kind === "government_id" && api.licenceCheck ? (
          <LicenceScan
            api={{ licenceCheck: (body) => api.licenceCheck!(doc.id, body) }}
            onChecked={(c) => setIdChecks((prev) => [...prev, c])}
          />
        ) : null}

        {idChecks.length > 0 ? (
          <div>
            <p className="text-[12px] font-medium text-fg-muted">Licence checks</p>
            <ul className="mt-1 space-y-1 text-[12px] text-fg-muted" data-testid="licence-check-history">
              {idChecks.map((c) => (
                <li key={c.id}>
                  <LocalDate iso={c.checkedAt} format="dateTime" /> · {c.result === "match" ? "Matched the record" : "Did not match"}
                  {c.mismatchedFields.length
                    ? ` (${c.mismatchedFields.map((f) => LICENCE_CHECK_FIELD_LABELS[f].toLowerCase()).join("; ")})`
                    : ""}
                  {` · ${c.jurisdiction ?? ""} ending ${c.licenceLast4}`}
                  {c.checkedByName ? ` · ${c.checkedByName}` : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {doc.decisions.length > 0 ? (
          <div>
            <p className="text-[12px] font-medium text-fg-muted">Earlier decisions</p>
            <ul className="mt-1 space-y-1 text-[12px] text-fg-muted">
              {doc.decisions.map((h, i) => (
                <li key={`${h.decidedAt}-${i}`}>
                  <LocalDate iso={h.decidedAt} format="dateTime" /> · {COMPLIANCE_DOCUMENT_STATUS_LABELS[h.decision]}
                  {h.decidedByName ? ` by ${h.decidedByName}` : ""}
                  {h.reason ? `: ${h.reason}` : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="space-y-1.5">
          <label htmlFor="document-decision-reason" className="text-[13px] font-medium text-fg">
            Reason or note for the player
          </label>
          <textarea
            id="document-decision-reason"
            value={reason}
            maxLength={COMPLIANCE_DECISION_REASON_MAX}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus-visible:border-accent focus-visible:outline-none"
            placeholder="Required to reject or to ask for a new upload. Optional when approving."
          />
        </div>

        {error ? <Alert tone="error">{error}</Alert> : null}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => void decide("resubmit_requested")}>
            {busy === "resubmit_requested" ? "Saving…" : "Request a new upload"}
          </Button>
          <Button variant="destructive" size="sm" disabled={busy !== null} onClick={() => void decide("rejected")}>
            {busy === "rejected" ? "Saving…" : "Reject"}
          </Button>
          <Button size="sm" disabled={busy !== null} onClick={() => void decide("approved")}>
            {busy === "approved" ? "Saving…" : "Approve"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
