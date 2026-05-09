import Link from "next/link";
import { ExternalLink, FileSignature } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { ReviewQueue } from "@/components/registrations/review-queue";
import { registration } from "@/lib/api/server-api";

export const metadata = { title: "Registrations — SportsPulse" };
export const dynamic = "force-dynamic";

/**
 * Phase 5 admin review queue. Multi-select + bulk approve/reject/email,
 * per-row review dialog with override-flag flow. Backed by the v2
 * /registration-v2/admin/* endpoints; the kernel state machine guards
 * every transition.
 *
 * The 6-phase player-facing wizard lives at /registration/<seasonId>
 * and reads its schema from the form configured in /forms — surfaced
 * as quick links here so admins can preview the funnel without
 * needing to look up a season URL by hand.
 */
export default async function RegistrationsPage() {
  // Surface season-bound forms so admins can hop into the wizard
  // (the multistep funnel runs at /registration/<seasonId>).
  const formsPage = await registration
    .listForms({ purpose: "season_registration" })
    .catch(() => ({ items: [] }));
  const seasonForms = formsPage.items
    .filter((f) => !!f.seasonId)
    .slice(0, 6);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Registrations"
        description="Player + team submissions across all orgs. Multistep wizard runs at /registration/<seasonId> — forms are configured in /forms."
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
      ) : (
        <section className="rounded-xl border border-dashed border-border bg-bg-subtle p-6">
          <div className="flex items-start gap-3">
            <FileSignature
              className="mt-1 h-5 w-5 shrink-0 text-fg-muted"
              strokeWidth={1.75}
            />
            <div className="space-y-1">
              <p className="text-[14px] font-medium text-fg">
                No season-bound registration forms yet
              </p>
              <p className="text-[12px] text-fg-muted">
                The multistep registration wizard reads its schema from a form
                configured in /forms with a season bound. Create one via{" "}
                <Link href="/forms" className="underline">
                  /forms
                </Link>{" "}
                then bind a season in the Season setup section.
              </p>
            </div>
          </div>
        </section>
      )}

      <ReviewQueue />
    </div>
  );
}
