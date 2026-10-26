import type { FormSubmissions } from "@sportspulse/api-client";
import { SubmissionsClient } from "@sportspulse/forms-builder";

/**
 * Submissions section: this form's submissions with their answers. The
 * page loads them once (the section pill shows the count); the client
 * owns the status filter, answers, CSV export and Approve / Reject.
 */
export function SubmissionsSection({
  formId,
  submissions
}: {
  formId: string;
  submissions: FormSubmissions;
}) {
  return <SubmissionsClient formId={formId} submissions={submissions} />;
}
