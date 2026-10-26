import { load, type LoadResult } from "@sportspulse/api-client";
import { notFound } from "next/navigation";
import { LoadError } from "@sportspulse/ui";
import type { PublicSeasonContext } from "@sportspulse/registration-funnel";
import { FunnelClient } from "./funnel-client";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

/**
 * Player-app registration funnel — same widget as superadmin-web's
 * /registration/[id], imported from @sportspulse/registration-funnel
 * so there is no duplicate logic per repo owner directive 2026-05-09
 * ("should go hand in hand").
 *
 * Anonymous — middleware whitelists /register so visitors without a
 * Supabase session can land here.
 */
export const dynamic = "force-dynamic";

async function getContext(
  seasonId: string,
  teamId: string | null
): Promise<LoadResult<PublicSeasonContext>> {
  // Keep the HTTP status: a 404 (no such season) and a server error
  // must render differently.
  return load(
    (async () => {
      const res = await fetch(
        `${API}/public/registration/seasons/${seasonId}${teamId ? `?team=${encodeURIComponent(teamId)}` : ""}`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        const err = new Error(`API ${res.status}`) as Error & { status?: number };
        err.status = res.status;
        throw err;
      }
      return (await res.json()) as PublicSeasonContext;
    })()
  );
}

export default async function PlayerRegisterPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  /** FR-3.4.1: ?team=<teamId> registers onto that team; ?invite=<token> is the captain invite followed. */
  searchParams: Promise<{ team?: string; invite?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const teamId = typeof sp.team === "string" && sp.team ? sp.team : null;
  const inviteToken = typeof sp.invite === "string" && sp.invite ? sp.invite : null;
  const ctxResult = await getContext(id, teamId);
  if (!ctxResult.ok) {
    if (ctxResult.status === 404) notFound();
    return (
      <div className="min-h-screen bg-bg p-6 text-fg">
        <LoadError
          what="this registration"
          status={ctxResult.status}
          message={ctxResult.message}
        />
      </div>
    );
  }
  const ctx = ctxResult.data;

  return (
    <div className="min-h-screen bg-bg text-fg">
      <FunnelClient context={ctx} inviteToken={inviteToken} />
    </div>
  );
}
