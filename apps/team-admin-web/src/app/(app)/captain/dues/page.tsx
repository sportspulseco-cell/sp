import { Star } from "lucide-react";
import { EmptyState } from "@sportspulse/ui";
import { finance, iam } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { DuesScreen } from "./dues-screen";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Dues — SportsPulse" };

/**
 * Workflow 7C §6.7 + Spec 2 Phase 3 — captain dues tracker.
 *
 * Reads the per-sub-invoice breakdown for the captain's team and
 * surfaces the two captain actions:
 *   - Remind all unpaid → queues notifications to each delinquent player
 *   - Cover outstanding → single mock-Stripe charge for the team's
 *     full unpaid balance; on success advances paid_cents on every
 *     sub-invoice + notifies each covered player
 */
export default async function CaptainDuesPage() {
  const scope = await iam.meScope().catch(() => null);
  const isCaptain = scope?.roleCodes.includes("captain") ?? false;
  const myTeamId = scope?.teamIds[0] ?? null;
  if (!isCaptain || !myTeamId) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="// Captain console" title="Team dues" />
        <EmptyState
          icon={Star}
          title="Captain role required"
          description="Ask your league admin to assign captain to your account."
        />
      </div>
    );
  }

  const breakdown = await finance
    .captainDuesBreakdown(myTeamId)
    .catch(() => null);

  if (!breakdown || !breakdown.masterInvoiceId) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="// Captain console"
          title="Team dues"
          description="No master invoice on file yet — once you complete the rollover wizard, dues collection appears here."
        />
        <EmptyState
          icon={Star}
          title="No dues to track"
          description="Run the rollover wizard from /captain/register to set up dues."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="// Captain console"
        title="Team dues"
        description="Track collection against the team's master invoice. Remind unpaid players or cover their outstanding balance in one charge."
      />
      <DuesScreen teamId={myTeamId} initial={breakdown} />
    </div>
  );
}
