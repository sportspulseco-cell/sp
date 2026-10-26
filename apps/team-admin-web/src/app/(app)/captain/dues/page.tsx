import Link from "next/link";
import { Star } from "lucide-react";
import { EmptyState, PageHeader } from "@sportspulse/ui";
import { finance, loadMeScope } from "@/lib/api/server-api";
import { DuesScreen } from "./dues-screen";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Dues · Team Admin" };

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
export default async function CaptainDuesPage({
  searchParams
}: {
  searchParams: Promise<{ invoiceId?: string }>;
}) {
  const { invoiceId } = await searchParams;
  const scope = await loadMeScope();
  const isCaptain = scope?.roleCodes.includes("captain") ?? false;
  const myTeamId = scope?.teamIds[0] ?? null;
  if (!isCaptain || !myTeamId) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Captain console" title="Team dues" />
        <EmptyState
          icon={Star}
          title="Captain role required"
          description="Ask your league admin to assign captain to your account."
        />
      </div>
    );
  }

  // The team invoice email links here with ?invoiceId=; an unknown id
  // falls back to the team's first invoice.
  const breakdown = await finance
    .captainDuesBreakdown(myTeamId, invoiceId)
    .catch(() => (invoiceId ? finance.captainDuesBreakdown(myTeamId).catch(() => null) : null));

  if (!breakdown || !breakdown.masterInvoiceId) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Captain console"
          title="Team dues"
          description="Dues appear here once your team's invoice for the season exists."
        />
        <EmptyState
          icon={Star}
          title="No team invoice yet"
          description="When the league approves your team, the Register the team page walks you through roster and dues. If your league confirmed the team directly, ask your league admin how the team pays."
          action={
            <Link href="/captain/register" className="text-[13px] font-medium text-fg underline underline-offset-2">
              Open Register the team
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Captain console"
        title="Team dues"
        description="Split the team invoice among your players, then track what each has paid. Remind unpaid players or cover their balance in one charge."
      />
      <DuesScreen teamId={myTeamId} initial={breakdown} />
    </div>
  );
}
