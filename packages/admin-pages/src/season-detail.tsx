import type { ReactNode } from "react";
import { ArrowLeft, CalendarRange } from "lucide-react";
import Link from "next/link";
import { Badge, Eyebrow, IconTile } from "@sportspulse/ui";
import type { Division, League, Season } from "@sportspulse/api-client";
import { Field } from "./field";

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

/**
 * Read-only season detail. Pure presentational. Each app fetches
 * season + parentLeague + divisions + setupHref + passes them in,
 * plus optional status-control + role-admin extras.
 */
export function SeasonDetail({
  season,
  parentLeague,
  divisions,
  backHref,
  leagueHrefBase,
  divisionHrefBase,
  divisionsListHref,
  setupHref,
  statusControl,
  extras
}: {
  season: Season;
  parentLeague: League | null;
  divisions: Division[];
  /** Default `/seasons`. */
  backHref?: string;
  /** Default `/leagues`. */
  leagueHrefBase?: string;
  /** Default `/divisions`. */
  divisionHrefBase?: string;
  /** Default `/divisions?seasonId=...`. */
  divisionsListHref?: string;
  /** Where "Open registration setup →" points (forms list or specific form). */
  setupHref?: string;
  /** Status dropdown — pass a <SeasonStatusControl/> bound to the
   *  app's changeStatus callback. Omit to render no control. */
  statusControl?: ReactNode;
  /** App-specific bottom slot (e.g. sa-web's role-assignments). */
  extras?: ReactNode;
}) {
  const cfg = (season.config ?? {}) as {
    requireUsaHockeyId?: boolean;
    requireLiabilityWaiver?: boolean;
    allowFreeAgent?: boolean;
    parentalConsentRequired?: boolean;
    maxRosterSize?: number;
  };

  const backTo = backHref ?? "/seasons";
  const leagueHref = leagueHrefBase ?? "/leagues";
  const divisionHref = divisionHrefBase ?? "/divisions";
  const divisionsListTo =
    divisionsListHref ?? `/divisions?seasonId=${season.id}`;

  return (
    <div className="space-y-8">
      <Link
        href={backTo}
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
                href={`${leagueHref}/${parentLeague.id}`}
                className="font-mono text-[10px] uppercase tracking-widest text-accent hover:underline"
              >
                {parentLeague.name} →
              </Link>
            ) : null}
          </div>
        </div>
        <div className="ml-auto flex flex-col items-end gap-2">
          {statusControl}
          {setupHref ? (
            <Link
              href={setupHref}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-3 font-mono text-[10px] uppercase tracking-widest text-fg hover:border-fg-muted"
            >
              Open registration setup →
            </Link>
          ) : null}
        </div>
      </header>

      <section className="rounded-xl border border-border bg-surface-1 p-5">
        <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          // Season identity
        </p>
        <dl className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Name" tag="seasons.name">{season.name}</Field>
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
            href={divisionsListTo}
            className="font-mono text-[10px] uppercase tracking-widest text-accent hover:underline"
          >
            View all →
          </Link>
        </header>
        {divisions.length === 0 ? (
          <p className="mt-3 text-[12px] text-fg-muted">
            No divisions under this season yet. Create one via Org setup.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {divisions.slice(0, 8).map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-3 py-2.5"
              >
                <Link
                  href={`${divisionHref}/${d.id}`}
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

      {extras}
    </div>
  );
}
