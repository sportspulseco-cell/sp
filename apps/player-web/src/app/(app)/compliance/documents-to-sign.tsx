"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Eyebrow } from "@sportspulse/ui";
import { WaiverCard, type WaiverDoc } from "@sportspulse/registration-funnel";
import type {
  MyRegistrationDocuments,
  RegistrationDocumentStatus
} from "@sportspulse/api-client";
import { compliance } from "@/lib/api/browser-api";

function toWaiverDoc(d: RegistrationDocumentStatus): WaiverDoc {
  return {
    documentId: d.key,
    key: d.key,
    kind: d.kind,
    name: d.title,
    description: null,
    versionId: d.documentVersionId ?? d.key,
    contentHtml: d.contentHtml,
    languageCode: "en",
    signMode: d.signMode,
    signed: d.signed,
    signedAt: d.signedAt
  };
}

/**
 * Required registration documents (liability waiver, code of conduct)
 * for each of the player's registrations, or a linked minor's, with a
 * Sign action. Same signature card and the same API writer as the
 * registration funnel (COMP-4). The signed state shown is the API's
 * answer to the sign call, not the click.
 */
export function DocumentsToSign({ items }: { items: MyRegistrationDocuments[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(items);
  useEffect(() => setRows(items), [items]);

  async function sign(
    registrationId: string,
    key: RegistrationDocumentStatus["key"],
    signatureName: string
  ) {
    const res = await compliance.signMyDocument({ registrationId, key, signatureName });
    setRows((prev) =>
      prev.map((r) =>
        r.registrationId === registrationId ? { ...r, documents: res.documents } : r
      )
    );
    // Refresh the banner counts from the server too.
    router.refresh();
  }

  return (
    <ul className="space-y-4">
      {rows.map((r) => {
        const unsigned = r.documents.filter((d) => !d.signed).length;
        return (
          <li
            key={r.registrationId}
            className="rounded-xl border border-border bg-surface-1 p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <Eyebrow>{r.orgName ?? "Registration"}</Eyebrow>
                <p className="mt-1 text-[14px] font-semibold tracking-tight text-fg">
                  {r.seasonName}
                </p>
                {r.signingFor === "minor" ? (
                  <p className="text-[12px] text-fg-muted">
                    For {r.subjectName}. You sign as their parent or guardian.
                  </p>
                ) : null}
              </div>
              {unsigned > 0 ? (
                <Badge mono tone="warning">
                  {unsigned} to sign
                </Badge>
              ) : (
                <Badge mono tone="success">
                  All signed
                </Badge>
              )}
            </div>
            {r.documents.length === 0 ? (
              <p className="mt-3 text-[12px] text-fg-muted">
                This registration does not ask for any documents.
              </p>
            ) : !r.signerName ? (
              <p className="mt-3 text-[12px] text-fg-muted">
                Your account has no legal name on file, so you cannot sign yet.
                Add it to your profile first.
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {r.documents.map((d) => (
                  <WaiverCard
                    key={d.key}
                    doc={toWaiverDoc(d)}
                    isRequired
                    isSigned={d.signed}
                    signedAt={d.signedAt}
                    fullName={r.signerName!}
                    onSign={(name) => sign(r.registrationId, d.key, name)}
                  />
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
