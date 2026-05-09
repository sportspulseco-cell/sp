import Link from "next/link";
import { ExternalLink, FileSignature } from "lucide-react";
import type { PublicSeasonContext } from "@sportspulse/registration-funnel";
import { PageHeader } from "@/components/layout/page-header";
import { ReviewQueue } from "@/components/registrations/review-queue";
import { registration } from "@/lib/api/server-api";
import { FunnelClient } from "../../registration/[id]/funnel-client";

export const metadata = { title: "Registrations — SportsPulse" };
export const dynamic = "force-dynamic";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

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

/**
 * /registrations has TWO integral parts (per repo owner directive):
 *   1. The submissions list (admin review queue) at the top.
 *   2. The actual multistep wizard inline below — schema comes from
 *      a /forms-configured form bound to a season. NOT a launcher,
 *      NOT a link out — the wizard renders right here.
 *
 * The wizard's Phase 2 (Details) renders the questions configured
 * via /forms/[id] Form-builder, so the source of truth stays /forms.
 *
 * If multiple season-bound forms exist, we pick the most-recently-
 * updated one. The header surfaces a deep-link to /forms/[id] for
 * editing + an "Open in new tab" of the public /registration/<id>.
 */
export default async function RegistrationsPage() {
  const formsPage = await registration
    .listForms({ purpose: "season_registration" })
    .catch(() => ({ items: [], nextCursor: null }));

  // Pick the freshest season-bound form to render the wizard against.
  const seasonForms = formsPage.items
    .filter((f) => !!f.seasonId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const activeForm = seasonForms[0] ?? null;
  const ctx = activeForm?.seasonId
    ? await getContext(activeForm.seasonId)
    : null;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Registrations"
        description="Player + team submissions across all orgs. The multistep wizard renders inline below — its schema comes from /forms."
      />

      <ReviewQueue />

      {/*
       * The wizard is an integral part of /registrations — not a
       * separate /registration/<id> route. It reads schema from the
       * /forms-configured form bound to a season.
       */}
      <section className="space-y-3">
        <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border pb-3">
          <div>
            <p className="text-[18px] font-semibold tracking-tight text-fg">
              Player registration wizard
            </p>
            <p className="mt-1 text-[12px] text-fg-muted">
              {ctx
                ? `Rendering against ${ctx.season.name} · schema from /forms`
                : "No season-bound form yet — configure one in /forms below"}
            </p>
          </div>
          {activeForm ? (
            <div className="flex items-center gap-2">
              <Link
                href={`/forms/${activeForm.id}`}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-3 font-mono text-[10px] uppercase tracking-widest text-fg hover:border-fg-muted"
              >
                <FileSignature className="h-3.5 w-3.5" strokeWidth={1.75} />
                Edit form in /forms
              </Link>
              {activeForm.seasonId ? (
                <Link
                  href={`/registration/${activeForm.seasonId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-blue-500/40 bg-blue-500/10 px-3 font-mono text-[10px] uppercase tracking-widest text-blue-700 hover:bg-blue-500/15 dark:text-blue-300"
                >
                  <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} />
                  Open in new tab
                </Link>
              ) : null}
            </div>
          ) : null}
        </header>

        {ctx ? (
          <div className="rounded-xl border border-border bg-bg-subtle">
            <FunnelClient context={ctx} />
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-bg-subtle p-6">
            <div className="flex items-start gap-3">
              <FileSignature
                className="mt-1 h-5 w-5 shrink-0 text-fg-muted"
                strokeWidth={1.75}
              />
              <div className="space-y-1">
                <p className="text-[14px] font-medium text-fg">
                  No registration form configured yet
                </p>
                <p className="text-[12px] text-fg-muted">
                  Run{" "}
                  <code className="font-mono">
                    pnpm --filter @sportspulse/db seed:registration-form-demo
                  </code>{" "}
                  to seed the demo Player registration form, OR head to{" "}
                  <Link href="/forms" className="underline">
                    /forms
                  </Link>{" "}
                  → create a form → bind it to a season in the Season setup
                  section.
                </p>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
