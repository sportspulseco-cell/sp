import type { Division, RegistrationForm } from "@sportspulse/api-client";
import { registration } from "@/lib/api/server-api";
import { SubmissionsClient } from "./submissions-client";

/**
 * Submissions section. Server fetches the current set so we can paint
 * status counts in the header (X total · Y pending · Z approved · ...).
 * The client component owns the filter dropdown + Approve/Reject/Email
 * row actions.
 */
export async function SubmissionsSection({
  form,
  divisions
}: {
  form: RegistrationForm;
  divisions: Division[];
}) {
  const page = await registration
    .listRegistrations({ orgId: form.orgId })
    .catch(() => ({ items: [], nextCursor: null }));

  return (
    <SubmissionsClient
      registrations={page.items}
      divisions={divisions}
    />
  );
}
