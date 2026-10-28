import { ExternalLink } from "lucide-react";
import type { PublicSeasonContext } from "@sportspulse/registration-funnel";
import { ReviewQueue } from "@/components/registrations/review-queue";
import { publicRegistration, registration } from "@/lib/api/server-api";
import { PageHeader } from "@sportspulse/ui";
import { FreeAgentPoolSection } from "./free-agent-pool-section";
import { FunnelClient } from "../../registration/[id]/funnel-client";

export const metadata = { title: "Registrations · Super Admin" };
export const dynamic = "force-dynamic";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

async function getContext(seasonId: string): Promise<PublicSeasonContext | null> {
  try {
    const res = await fetch(`${API}/public/registration/seasons/${seasonId}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as PublicSeasonContext;
  } catch {
    return null;
  }
}

/**
 * The review queue first: who is waiting for a decision. Then players
 * without a team. Last, the sign-up exactly as players see it, folded
 * to one line (owner directive: the wizard stays on this page). The
 * totals strip and ticker above the queue pushed it below the fold
 * (doc/design/guided-ui.md).
 */
export default async function RegistrationsPage() {
  const [formsPage, appLinks] = await Promise.all([
    registration
      .listForms({ purpose: "season_registration" })
      .catch(() => ({ items: [], nextCursor: null })),
    // REG-12/13: this environment's player app, from the API.
    publicRegistration.appLinks().catch(() => null)
  ]);
  const playerWebUrl = appLinks?.playerWebUrl ?? null;
  const activeForm =
    formsPage.items
      .filter((f) => !!f.seasonId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
  const ctx = activeForm?.seasonId ? await getContext(activeForm.seasonId) : null;

  return (
    <div className="space-y-10">
      <PageHeader
        title="Registrations"
        description="Approve, ask for changes, or reject with a reason. Players without a team are listed under the queue."
        action={
          activeForm?.seasonId && playerWebUrl ? (
            <a
              // Absolute URL into this environment's player-web
              // (BUG-044a; REG-12: origin from the API, no production
              // fallback).
              href={`${playerWebUrl}/register/${activeForm.seasonId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-surface-1 px-4 text-sm font-medium text-fg transition-colors hover:bg-surface-2"
            >
              <ExternalLink className="h-4 w-4" strokeWidth={1.75} />
              Preview sign-up
            </a>
          ) : null
        }
      />

      <ReviewQueue />

      {/* FREE AGENTS — CAP-10: players without a team; assign = offer. */}
      <FreeAgentPoolSection />

      {ctx ? (
        <details className="group rounded-xl border border-border bg-surface-1">
          <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3 text-[14px] font-medium text-fg [&::-webkit-details-marker]:hidden">
            See the sign-up as players see it · {ctx.season.name}
            <span className="text-[13px] font-normal text-[--accent] group-open:hidden">Open</span>
          </summary>
          <div className="overflow-hidden border-t border-border bg-bg-subtle">
            <FunnelClient context={ctx} />
          </div>
        </details>
      ) : null}
    </div>
  );
}
