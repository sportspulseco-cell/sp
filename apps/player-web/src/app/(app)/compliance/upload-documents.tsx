"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, FileUp, Loader2 } from "lucide-react";
import { Alert, Badge, Button, Eyebrow, Select, useLocalDate } from "@sportspulse/ui";
import {
  COMPLIANCE_DOCUMENT_KINDS,
  COMPLIANCE_DOCUMENT_KIND_LABELS,
  COMPLIANCE_DOCUMENT_MAX_BYTES,
  COMPLIANCE_DOCUMENT_STATUS_LABELS,
  detectComplianceFileType,
  type ComplianceDocumentKind
} from "@sportspulse/kernel";
import type {
  ComplianceDocumentSubmission,
  ComplianceUploadTarget
} from "@sportspulse/api-client";
import { compliance } from "@/lib/api/browser-api";

/** Photos over this are shrunk in the browser before upload. */
const SHRINK_OVER_BYTES = 2 * 1024 * 1024;

function targetKey(t: { personId: string; orgId: string; seasonId: string | null; registrationId: string | null }) {
  return `${t.personId}|${t.orgId}|${t.seasonId ?? ""}|${t.registrationId ?? ""}`;
}

function targetLabel(t: ComplianceUploadTarget): string {
  const parts = [t.seasonName ?? "No season", t.orgName ?? null, t.teamName ?? null].filter(Boolean);
  return t.forMinor ? `${t.personName} · ${parts.join(" · ")}` : parts.join(" · ");
}

function mb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

/** Downscale a large photo to a JPEG that fits the limit. Returns the original when it cannot. */
async function shrinkImage(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.size <= SHRINK_OVER_BYTES) return file;
  try {
    const bitmap = await createImageBitmap(file);
    for (const [maxSide, quality] of [
      [2400, 0.85],
      [1800, 0.8],
      [1400, 0.75]
    ] as const) {
      const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/jpeg", quality));
      if (blob && blob.size <= COMPLIANCE_DOCUMENT_MAX_BYTES) return blob;
    }
  } catch {
    // Browser could not decode it (e.g. HEIC on desktop): send as is and let the size check speak.
  }
  return file;
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result ?? "");
      resolve(s.slice(s.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file"));
    reader.readAsDataURL(blob);
  });
}

/**
 * COMP-3: upload an ID or eligibility document for yourself or a minor
 * linked to you, and see what the admin decided. The season list comes
 * from the API (your open registrations and team seasons); the admins of
 * that season review the file. Every status shown is the API's answer.
 */
export function UploadDocuments({
  items,
  targets
}: {
  items: ComplianceDocumentSubmission[];
  targets: ComplianceUploadTarget[];
}) {
  const router = useRouter();
  const fmtDate = useLocalDate();
  const [rows, setRows] = useState(items);
  useEffect(() => setRows(items), [items]);

  // One option: it is the answer. Several: the player picks (no guessed default).
  const [targetValue, setTargetValue] = useState(targets.length === 1 ? targetKey(targets[0]!) : "");
  const [kind, setKind] = useState<ComplianceDocumentKind | "">("");
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [fallbackLink, setFallbackLink] = useState<{ id: string; url: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const target = targets.find((t) => targetKey(t) === targetValue) ?? null;
  const needsAttention = rows.filter((r) => r.status === "rejected" || r.status === "resubmit_requested");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!target) return setError("Choose the season this document is for.");
    if (!kind) return setError("Choose the type of document.");
    if (!file) return setError("Choose a file to upload.");
    setBusy(true);
    try {
      const blob = await shrinkImage(file);
      if (blob.size > COMPLIANCE_DOCUMENT_MAX_BYTES) {
        setError(
          `This file is ${mb(blob.size)} MB. The limit is 3 MB. Scan at a lower resolution, or upload a photo of the document instead.`
        );
        return;
      }
      const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
      if (!detectComplianceFileType(head)) {
        setError("That file is not a PDF, PNG, JPG or WebP. Upload a scan or a photo in one of those formats.");
        return;
      }
      const res = await compliance.uploadMyDocument({
        personId: target.personId,
        orgId: target.orgId,
        seasonId: target.seasonId,
        registrationId: target.registrationId,
        kind,
        dataBase64: await toBase64(blob)
      });
      const s = res.submission;
      setRows((prev) => [s, ...prev.filter((r) => r.id !== s.id)]);
      setNotice(
        res.alreadySubmitted
          ? `You already sent this file on ${fmtDate(s.createdAt)}. Its status is: ${COMPLIANCE_DOCUMENT_STATUS_LABELS[s.status]}.`
          : `Uploaded. Status: ${COMPLIANCE_DOCUMENT_STATUS_LABELS[s.status]}. An admin for ${s.seasonName ?? s.orgName ?? "your league"} will review it.`
      );
      setFile(null);
      setFileInputKey((k) => k + 1);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /** Pre-fill the form for a new upload of a sent-back document. */
  function uploadAgain(r: ComplianceDocumentSubmission) {
    const t = targets.find(
      (x) =>
        x.personId === r.personId &&
        x.orgId === r.orgId &&
        (x.seasonId ?? null) === (r.seasonId ?? null)
    );
    if (t) setTargetValue(targetKey(t));
    setKind(r.kind);
    setNotice(null);
    setError(t ? null : "That season is no longer open for uploads. Pick another one or contact your league admin.");
    cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    fileRef.current?.focus();
  }

  async function openFile(id: string) {
    setOpening(id);
    setFallbackLink(null);
    // Open the tab inside the click so the browser does not block it.
    const win = window.open("", "_blank");
    try {
      const link = await compliance.myDocumentUploadFile(id);
      if (win) {
        win.opener = null;
        win.location.href = link.url;
      } else {
        setFallbackLink({ id, url: link.url });
      }
    } catch (err) {
      win?.close();
      setError(`Could not open the file: ${(err as Error).message}`);
    } finally {
      setOpening(null);
    }
  }

  return (
    <div className="space-y-4">
      {needsAttention.length > 0 ? (
        <Alert tone="warning">
          {needsAttention.length} document{needsAttention.length === 1 ? " needs" : "s need"} a new upload.
          The admin&apos;s reason is shown below.
        </Alert>
      ) : null}

      <div ref={cardRef} className="rounded-xl border border-border bg-surface-1 p-5">
        <div className="flex items-center gap-2">
          <FileUp className="h-4 w-4 text-fg-muted" strokeWidth={1.75} />
          <h3 className="text-[14px] font-semibold tracking-tight text-fg">Upload a document</h3>
        </div>
        <p className="mt-1 text-[12px] text-fg-muted">
          A birth certificate, USA Hockey card, photo ID or a signed paper waiver. Only your league&apos;s admins can see it.
        </p>

        {targets.length === 0 ? (
          <p className="mt-4 text-[13px] text-fg-muted">
            You can upload a document once you have a registration or a place on a team. The admins of that season review it.
          </p>
        ) : (
          <form onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="upload-target" className="text-[13px] font-medium text-fg">
                For
              </label>
              <Select
                id="upload-target"
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value)}
                disabled={busy}
              >
                {targets.length > 1 ? <option value="">Choose a season</option> : null}
                {targets.map((t) => (
                  <option key={targetKey(t)} value={targetKey(t)}>
                    {targetLabel(t)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="upload-kind" className="text-[13px] font-medium text-fg">
                Document type
              </label>
              <Select
                id="upload-kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as ComplianceDocumentKind | "")}
                disabled={busy}
              >
                <option value="">Choose a type</option>
                {COMPLIANCE_DOCUMENT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {COMPLIANCE_DOCUMENT_KIND_LABELS[k]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="upload-file" className="text-[13px] font-medium text-fg">
                File
              </label>
              <input
                key={fileInputKey}
                ref={fileRef}
                id="upload-file"
                type="file"
                accept="application/pdf,image/png,image/jpeg,image/webp"
                disabled={busy}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-[13px] text-fg file:mr-3 file:rounded-md file:border file:border-border file:bg-surface-2 file:px-3 file:py-1.5 file:text-[13px] file:text-fg"
              />
              <p className="text-[12px] text-fg-muted">PDF, PNG, JPG or WebP, up to 3 MB. Large photos are made smaller before upload.</p>
            </div>
            {error ? (
              <div className="sm:col-span-2">
                <Alert tone="error">{error}</Alert>
              </div>
            ) : null}
            {notice ? (
              <div className="sm:col-span-2">
                <Alert tone="success" role="status">
                  {notice}
                </Alert>
              </div>
            ) : null}
            <div className="sm:col-span-2">
              <Button type="submit" disabled={busy || !target || !kind || !file}>
                {busy ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Uploading…
                  </>
                ) : (
                  "Upload"
                )}
              </Button>
            </div>
          </form>
        )}
      </div>

      {rows.length > 0 ? (
        <ul className="space-y-3" aria-label="Your uploaded documents">
          {rows.map((r) => (
            <li
              key={r.id}
              data-submission-id={r.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-surface-1 p-5"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Eyebrow>{COMPLIANCE_DOCUMENT_KIND_LABELS[r.kind]}</Eyebrow>
                  <Badge status={r.status} domain="compliance">
                    {COMPLIANCE_DOCUMENT_STATUS_LABELS[r.status]}
                  </Badge>
                </div>
                <p className="text-[13px] text-fg">
                  {[r.personName, r.seasonName ?? "No season", r.orgName].filter(Boolean).join(" · ")}
                </p>
                {r.latestDecision?.reason ? (
                  <p className="text-[12px] text-fg">
                    {r.latestDecision.decision === "approved" ? "Note" : "Reason"} from the admin: {r.latestDecision.reason}
                  </p>
                ) : null}
                <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                  Uploaded {fmtDate(r.createdAt)}
                  {r.latestDecision ? ` · Decided ${fmtDate(r.latestDecision.decidedAt)}` : ""}
                </p>
                {fallbackLink?.id === r.id ? (
                  <a href={fallbackLink.url} target="_blank" rel="noopener noreferrer" className="text-[12px] underline">
                    Open the file (link works for 5 minutes)
                  </a>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" variant="ghost" disabled={opening === r.id} onClick={() => void openFile(r.id)}>
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.75} />
                  {opening === r.id ? "Opening…" : "View file"}
                </Button>
                {r.status === "rejected" || r.status === "resubmit_requested" ? (
                  <Button type="button" size="sm" variant="outline" onClick={() => uploadAgain(r)}>
                    Upload a new file
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
