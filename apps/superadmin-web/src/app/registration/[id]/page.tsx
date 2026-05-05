import { notFound } from "next/navigation";
import type { PublicSeasonContext } from "@/lib/api/sdk";
import { RegistrationFunnel } from "@/components/registration-funnel/registration-funnel";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

/**
 * Public registration funnel — Workflow 1 v2.
 *
 * Anonymous landing page. Anyone with the season's URL lands here:
 *   /registration/{seasonId}
 *
 * The funnel renders four entry paths (team / individual / free agent /
 * captain invite) per the spec. The form schema, pricing tiers, and
 * season window all come from the public API and drive the UI live.
 *
 * (Slug routing — `/registration/{slug}` — lands when we add a
 * `seasons.slug` column. ID-based URLs work today and the funnel itself
 * doesn't care which lookup style the page used.)
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

export default async function PublicRegistrationPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getContext(id);
  if (!ctx) notFound();

  return (
    <div className="min-h-screen bg-bg text-fg">
      <RegistrationFunnel context={ctx} />
    </div>
  );
}
