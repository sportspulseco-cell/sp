import { Star } from "lucide-react";
import { EmptyState } from "@sportspulse/ui";
import { iam } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Free agents — SportsPulse" };

export default async function FreeAgentPoolPage() {
  const scope = await iam.meScope().catch(() => null);
  const isCaptain = scope?.roleCodes.includes("captain") ?? false;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="// Captain console"
        title="Free agents"
        description="Browse + claim players from the league's free-agent pool. The pool table already exists; the SDK surface for captain claims ships next."
      />
      <EmptyState
        icon={Star}
        title={isCaptain ? "Free-agent pool browser coming soon" : "Captain role required"}
        description={
          isCaptain
            ? "free_agent_pool_entries already lives in the database — the captain-side browser + claim flow lands in the next slice."
            : "Ask your league admin to assign captain to your account."
        }
      />
    </div>
  );
}
