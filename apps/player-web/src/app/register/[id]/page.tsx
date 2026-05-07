import { notFound } from "next/navigation";
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

async function getContext(seasonId: string): Promise<PublicSeasonContext | null> {
  try {
    const res = await fetch(
      `${API}/public/registration/seasons/${seasonId}`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    return (await res.json()) as PublicSeasonContext;
  } catch {
    return null;
  }
}

export default async function PlayerRegisterPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getContext(id);
  if (!ctx) notFound();

  return (
    <div className="min-h-screen bg-bg text-fg">
      <FunnelClient context={ctx} />
    </div>
  );
}
