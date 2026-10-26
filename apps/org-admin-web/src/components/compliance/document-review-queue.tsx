"use client";

import { DocumentReviewQueue as SharedDocumentReviewQueue } from "@sportspulse/admin-pages";
import type { ComplianceDocumentQueuePage } from "@sportspulse/api-client";
import { compliance } from "@/lib/api/browser-api";

/**
 * org-admin binding of the shared review queue (COMP-1). Same component
 * and endpoints as sa-web; the API limits it to the org's own seasons
 * and registrations. No person page in this console, so names are text.
 */
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
      api={{
        list: (q) => compliance.listDocumentSubmissions(q),
        decide: (id, body) => compliance.decideDocumentSubmission(id, body),
        fileUrl: (id) => compliance.documentSubmissionFile(id),
        licenceCheck: (id, body) => compliance.licenceCheck(id, body)
      }}
    />
  );
}
