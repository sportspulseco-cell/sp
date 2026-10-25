"use client";

import { DocumentReviewQueue as SharedDocumentReviewQueue } from "@sportspulse/admin-pages";
import type { ComplianceDocumentQueuePage } from "@/lib/api/types";
import { compliance } from "@/lib/api/browser-api";

/** sa-web binding of the shared review queue (COMP-1) to its browser SDK. */
export function DocumentReviewQueue({
  initial,
  initialError
}: {
  initial: ComplianceDocumentQueuePage | null;
  initialError: { status: number | null; message: string } | null;
}) {
  return (
    <SharedDocumentReviewQueue
      initial={initial}
      initialError={initialError}
      personHref={(personId) => `/persons/${personId}`}
      api={{
        list: (q) => compliance.listDocumentSubmissions(q),
        decide: (id, body) => compliance.decideDocumentSubmission(id, body),
        fileUrl: (id) => compliance.documentSubmissionFile(id)
      }}
    />
  );
}
