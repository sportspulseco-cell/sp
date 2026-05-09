import Link from "next/link";
import { ExternalLink, FileSignature, Wand2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { ReviewQueue } from "@/components/registrations/review-queue";
import { leagueMgmt, registration } from "@/lib/api/server-api";
import { TestWizardLauncher } from "./test-wizard-launcher";

export const metadata = { title: "Registrations — SportsPulse" };
export const dynamic = "force-dynamic";

/**
 * Phase 5 admin review queue + a "Test wizard" launcher panel so an
 * admin can hop straight into the multistep funnel without bouncing
 * through /forms — answering the user's "I want to test it from here"
 * directive.
 *
 * - If any form has a seasonId set, surface those rows with an
 *   "Open wizard" link.
 * - If none do, the launcher lists every season in scope. Clicking
 *   "Test wizard" creates a stub registration form bound to that
 *   season (if missing) and opens /registration/<seasonId>.
 *
 * Schema source of truth stays /forms — this is just an entry point.
 */
export default async function RegistrationsPage() {
  const [formsPage, seasonsPage] = await Promise.all([
    registration
      .listForms({ purpose: "season_registration" })
      .catch(() => ({ items: [], nextCursor: null })),
    leagueMgmt.listSeasons({}).catch(() => ({ items: [], nextCursor: null }))
  ]);

  const seasonForms = formsPage.items
    .filter((f) => !!f.seasonId)
    .slice(0, 6);
  const formsBySeasonId = new Map(
    formsPage.items.filter((f) => !!f.seasonId).map((f) => [f.seasonId!, f])
  );

  // Seasons sorted newest first; show every season in scope so admins
  // can pick whichever to test against.
  const seasons = (seasonsPage.items ?? [])
    .slice()
    .sort((a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? ""))
    .slice(0, 12);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Registrations"
        description="Player + team submissions across all orgs. Test the multistep wizard for any season directly below — schema comes from /forms."
      />

      {seasonForms.length > 0 ? (
        <section className="rounded-xl border border-border bg-surface-1 p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            // Live registration wizards
          </p>
          <p className="mt-1 text-[12px] text-fg-muted">
            Open the multistep wizard for any season-bound form. The schema
            comes straight from /forms — same source of truth as the /users
            invite profile flow.
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {seasonForms.map((f) => (
              <li
                key={f.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-bg-subtle px-3 py-2"
              >
                <div className="min-w-0">
                  <Link
                    href={`/forms/${f.id}`}
                    className="text-[13px] font-medium text-fg hover:underline"
                  >
                    {f.name}
                  </Link>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                    {f.activeVersionId ? "Live · v active" : "Draft"}
                  </p>
                </div>
                <Link
                  href={`/registration/${f.seasonId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-7 items-center gap-1.5 rounded-md border border-blue-500/40 bg-blue-500/10 px-2.5 font-mono text-[10px] uppercase tracking-widest text-blue-700 hover:bg-blue-500/15 dark:text-blue-300"
                >
                  <ExternalLink className="h-3 w-3" strokeWidth={1.75} />
                  Open wizard
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/*
       * Test-wizard launcher: every season in scope appears here.
       * Clicking the button auto-creates a stub form for that season
       * if one doesn't exist yet, then opens the wizard. No need to
       * bounce through /forms.
       */}
      {seasons.length > 0 ? (
        <section className="rounded-xl border border-border bg-surface-1 p-4">
          <div className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-fg-muted" strokeWidth={1.75} />
            <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
              // Test the wizard
            </p>
          </div>
          <p className="mt-1 text-[12px] text-fg-muted">
            Pick a season to launch the 6-phase wizard against it. We'll
            auto-create a stub form bound to the season if one doesn't exist
            yet, so you don't need to set up /forms first.
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {seasons.map((s) => {
              const existing = formsBySeasonId.get(s.id);
              return (
                <TestWizardLauncher
                  key={s.id}
                  season={{
                    id: s.id,
                    name: s.name,
                    orgId: s.orgId,
                    startDate: s.startDate,
                    endDate: s.endDate,
                    status: s.status
                  }}
                  existingFormId={existing?.id ?? null}
                />
              );
            })}
          </ul>
        </section>
      ) : (
        <section className="rounded-xl border border-dashed border-border bg-bg-subtle p-6">
          <div className="flex items-start gap-3">
            <FileSignature
              className="mt-1 h-5 w-5 shrink-0 text-fg-muted"
              strokeWidth={1.75}
            />
            <div className="space-y-1">
              <p className="text-[14px] font-medium text-fg">
                No seasons in scope yet
              </p>
              <p className="text-[12px] text-fg-muted">
                Create a season via{" "}
                <Link href="/org-setup" className="underline">
                  /org-setup
                </Link>{" "}
                — then come back here to launch the wizard.
              </p>
            </div>
          </div>
        </section>
      )}

      <ReviewQueue />
    </div>
  );
}
