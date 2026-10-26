import type { ReactNode } from "react";

import Link from "next/link";
import { Badge, PageHeader, Reveal } from "@sportspulse/ui";
import type { Division, League, Season } from "@sportspulse/api-client";
import { Field } from "./field";
import { SEASON_CONFIG_DEFAULTS } from "@sportspulse/kernel";

/** A season switch as set, or the default registration uses when it is not set. */
function yesNo(v: boolean | undefined, fallback: boolean): string {
  if (v === undefined) return `Default (${fallback ? "on" : "off"})`;
  return v ? "Yes" : "No";
}

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
  schedulingHref,
  statusControl,
  actions,
  extras,
  lifecycle
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
  /** Where "Schedule →" points — typically `/scheduling/<seasonId>/generate`. */
  schedulingHref?: string;
  /** Status dropdown — pass a <SeasonStatusControl/> bound to the
   *  app's changeStatus callback. Omit to render no control. */
  statusControl?: ReactNode;
  /** Header actions (edit, add a child record), injected per app. */
  actions?: ReactNode;
  /** App-specific bottom slot (e.g. sa-web's role-assignments). */
  extras?: ReactNode;
  /** The season lifecycle strip (SeasonFlow for this one season); shown first. */
  lifecycle?: ReactNode;
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
      <PageHeader
        eyebrow={<>SEASON · {parentLeague?.name ?? "Unknown league"}</>}
        title={season.name}
        description={
          <>
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
          </>
        }
        action={
          <>
            <div className="flex flex-col items-start gap-2 sm:items-end">
              {statusControl}
              {actions}
              {setupHref ? (
                <Link
                  href={setupHref}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-3 font-mono text-[10px] uppercase tracking-widest text-fg hover:border-fg-muted"
                >
                  Open registration setup →
                </Link>
              ) : null}
              {schedulingHref ? (
                <Link
                  href={schedulingHref}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-3 font-mono text-[10px] uppercase tracking-widest text-fg hover:border-fg-muted"
                >
                  Schedule →
                </Link>
              ) : null}
            </div>
          </>
        }
      />

      {lifecycle}

      <Reveal as="section" delay={0.05} className="rounded-xl border border-border bg-surface-1 p-5">
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
      </Reveal>

      <Reveal as="section" delay={0.1} className="rounded-xl border border-border bg-surface-1 p-5">
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
      </Reveal>

      <Reveal as="section" delay={0.15} className="rounded-xl border border-border bg-surface-1 p-5">
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
            {yesNo(cfg.requireUsaHockeyId, SEASON_CONFIG_DEFAULTS.requireUsaHockeyId)}
          </Field>
          <Field
            label="Require liability waiver"
            tag="config.requireLiabilityWaiver"
            mono
          >
            {yesNo(cfg.requireLiabilityWaiver, SEASON_CONFIG_DEFAULTS.requireLiabilityWaiver)}
          </Field>
          <Field
            label="Allow free agent registration"
            tag="config.allowFreeAgent"
            mono
          >
            {yesNo(cfg.allowFreeAgent, SEASON_CONFIG_DEFAULTS.allowFreeAgent)}
          </Field>
          <Field
            label="Parental consent for minors"
            tag="config.parentalConsentRequired"
            mono
          >
            {yesNo(cfg.parentalConsentRequired, SEASON_CONFIG_DEFAULTS.parentalConsentRequired)}
          </Field>
        </dl>
      </Reveal>

      <Reveal as="section" delay={0.2} className="rounded-xl border border-border bg-surface-1 p-5">
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
      </Reveal>

      {extras}
    </div>
  );
}
