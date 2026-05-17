import { ArrowLeft, CalendarRange } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { leagueMgmt } from "@/lib/api/server-api";
import { Badge } from "@/components/ui/badge";
import { Eyebrow } from "@/components/ui/eyebrow";
import { IconTile } from "@/components/ui/icon-tile";
import { ResourceAdminsSection } from "@/components/layout/resource-admins-section";
import { SeasonStatusControl } from "@/components/seasons/season-status-control";

export const metadata = { title: "Season — SportsPulse" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

/**
 * View-only season detail. Source of truth for editing is /org-setup
 * Phase 2 (Season). All fields here mirror what the wizard captured.
 */
export default async function SeasonDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const season = await leagueMgmt.getSeason(id).catch(() => null);
  if (!season) notFound();

  const [parentLeague, divisionsPage] = await Promise.all([
    leagueMgmt.getLeague(season.leagueId).catch(() => null),
    leagueMgmt.listDivisions({ seasonId: season.id }).catch(() => ({ items: [] }))
  ]);

  const cfg = (season.config ?? {}) as {
    requireUsaHockeyId?: boolean;
    requireLiabilityWaiver?: boolean;
    allowFreeAgent?: boolean;
    parentalConsentRequired?: boolean;
    maxRosterSize?: number;
  };

  return (
    <div className="space-y-8">
      <Link
        href="/seasons"
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        All seasons
      </Link>

      <header className="flex items-start gap-5 border-b border-border pb-8">
        <IconTile icon={CalendarRange} tint="violet" size="lg" />
        <div className="space-y-2">
          <Eyebrow dot>SEASON · {season.id.slice(0, 8)}</Eyebrow>
          <h1 className="text-[36px] font-semibold leading-[1.05] tracking-tighter text-fg">
            {season.name}
          </h1>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Badge mono>{season.sportCode}</Badge>
            {parentLeague ? (
              <Link
                href={`/leagues/${parentLeague.id}`}
                className="font-mono text-[10px] uppercase tracking-widest text-accent hover:underline"
              >
                {parentLeague.name} →
              </Link>
            ) : null}
          </div>
        </div>
        <div className="ml-auto flex flex-col items-end gap-2">
          <SeasonStatusControl
            seasonId={season.id}
            currentStatus={season.status}
          />
          <Link
            href={`/registrations/seasons/${season.id}/setup`}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-3 font-mono text-[10px] uppercase tracking-widest text-fg hover:border-fg-muted"
          >
            Open registration setup →
          </Link>
        </div>
      </header>

      <section className="rounded-xl border border-border bg-surface-1 p-5">
        <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          // Season identity
        </p>
        <dl className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Name" tag="seasons.name">
            {season.name}
          </Field>
          <Field label="Sport" tag="seasons.sport_code" mono>
            {season.sportCode}
          </Field>
          <Field label="Time zone" tag="seasons.timezone" mono>
            {season.timezone}
          </Field>
          <Field label="Start date" tag="seasons.start_date" mono>
            {fmtDate(season.startDate)}
          </Field>
          <Field label="End date" tag="seasons.end_date" mono>
            {fmtDate(season.endDate)}
          </Field>
          <Field label="Status" tag="seasons.status" mono>
            {season.status.replace(/_/g, " ")}
          </Field>
        </dl>
      </section>

      <section className="rounded-xl border border-border bg-surface-1 p-5">
        <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          // Registration window
        </p>
        <dl className="mt-3 grid gap-4 sm:grid-cols-3">
          <Field label="Opens" tag="seasons.registration_opens_at" mono>
            {fmtDate(season.registrationOpensAt)}
          </Field>
          <Field label="Closes" tag="seasons.registration_closes_at" mono>
            {fmtDate(season.registrationClosesAt)}
          </Field>
          <Field label="Roster lock" tag="seasons.roster_lock_at" mono>
            {fmtDate(season.rosterLockAt)}
          </Field>
        </dl>
      </section>

      <section className="rounded-xl border border-border bg-surface-1 p-5">
        <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          // Eligibility &amp; roster rules
        </p>
        <dl className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field label="Max roster size" tag="config.maxRosterSize" mono>
            {cfg.maxRosterSize ?? "—"}
          </Field>
          <Field
            label="Require USA Hockey ID"
            tag="config.requireUsaHockeyId"
            mono
          >
            {cfg.requireUsaHockeyId ? "Yes" : "No"}
          </Field>
          <Field
            label="Require liability waiver"
            tag="config.requireLiabilityWaiver"
            mono
          >
            {cfg.requireLiabilityWaiver ? "Yes" : "No"}
          </Field>
          <Field
            label="Allow free agent registration"
            tag="config.allowFreeAgent"
            mono
          >
            {cfg.allowFreeAgent ? "Yes" : "No"}
          </Field>
          <Field
            label="Parental consent for minors"
            tag="config.parentalConsentRequired"
            mono
          >
            {cfg.parentalConsentRequired ? "Yes" : "No"}
          </Field>
        </dl>
      </section>

      <section className="rounded-xl border border-border bg-surface-1 p-5">
        <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border pb-3">
          <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            // Divisions in this season
          </p>
          <Link
            href={`/divisions?seasonId=${season.id}`}
            className="font-mono text-[10px] uppercase tracking-widest text-accent hover:underline"
          >
            View all →
          </Link>
        </header>
        {divisionsPage.items.length === 0 ? (
          <p className="mt-3 text-[12px] text-fg-muted">
            No divisions under this season yet. Create one via Org setup.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {divisionsPage.items.slice(0, 8).map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-3 py-2.5"
              >
                <Link
                  href={`/divisions/${d.id}`}
                  className="text-[13px] font-medium text-fg hover:underline"
                >
                  {d.name}
                </Link>
                <span className="font-mono text-[11px] text-fg-muted">
                  {d.tier ?? "—"} · {d.genderEligibility}
                </span>
                <span className="font-mono text-[11px] text-fg-muted">
                  Max teams: {d.maxTeams ?? "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ResourceAdminsSection
        scopeType="season"
        scopeId={season.id}
        resourceLabel={season.name}
        allowedRoleCodes={["season_admin", "registrar"]}
        description="Season admins manage registrations and roster locks for this season."
      />
    </div>
  );
}

function Field({
  label,
  tag,
  mono,
  children
}: {
  label: string;
  tag?: string;
  mono?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <dt className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          {label}
        </dt>
        {tag ? (
          <span className="rounded-full bg-accent/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-accent">
            {tag}
          </span>
        ) : null}
      </div>
      <dd
        className={
          mono ? "mt-1 font-mono text-[12px] text-fg" : "mt-1 text-[13px] text-fg"
        }
      >
        {children}
      </dd>
    </div>
  );
}
