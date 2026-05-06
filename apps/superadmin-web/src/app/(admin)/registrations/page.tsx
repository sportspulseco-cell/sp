import { PageHeader } from "@/components/layout/page-header";
import { ReviewQueue } from "@/components/registrations/review-queue";

export const metadata = { title: "Registrations — SportsPulse" };

/**
 * Phase 5 admin review queue. Multi-select + bulk approve/reject/email,
 * per-row review dialog with override-flag flow. Backed by the v2
 * /registration-v2/admin/* endpoints; the kernel state machine guards
 * every transition.
 */
export default function RegistrationsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Registrations"
        description="Player + team registrations across all orgs. Phase 5 review queue (Workflow 1 v2 §8)."
      />
      <ReviewQueue />
    </div>
  );
}
