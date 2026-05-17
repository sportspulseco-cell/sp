import type { ReactNode } from "react";
import { ArrowLeft, Network } from "lucide-react";
import Link from "next/link";
import { Badge, Eyebrow, IconTile, statusTone } from "@sportspulse/ui";
import type { Team } from "@sportspulse/api-client";
import { Field } from "./field";

function fmtCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD"
  });
}

/**
 * Read-only team detail. Pure presentational — each app fetches
 * `team` via its own SDK binding and passes it in. The header +
 * identity + branding sections render the canonical Team type
 * fields; app-specific add-ons (sa-web's role-assignments panel,
 * org-admin's CaptainAssignment) go through the `extras` slot.
 */
export function TeamDetail({
  team,
  backHref,
  extras
}: {
  team: Team;
  /** Default `/teams`. */
  backHref?: string;
  /** App-specific bottom slot (role panel, captain widget, etc.). */
  extras?: ReactNode;
}) {
  const colors = (team.colors ?? {}) as {
    primary?: string;
    secondary?: string;
  };

  return (
    <div className="space-y-8">
      <Link
        href={backHref ?? "/teams"}
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        All teams
      </Link>

      <header className="flex items-start gap-5 border-b border-border pb-8">
        <IconTile icon={Network} tint="rose" size="lg" />
        <div className="space-y-2">
          <Eyebrow dot>TEAM · {team.id.slice(0, 8)}</Eyebrow>
          <h1 className="text-[40px] font-semibold leading-[1.05] tracking-tighter text-fg">
            {team.name}
          </h1>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {team.shortName ? <Badge mono>{team.shortName}</Badge> : null}
            <Badge mono>{team.sportCode}</Badge>
            <Badge tone={statusTone(team.status)} mono>
              {team.status}
            </Badge>
          </div>
        </div>
      </header>

      <section className="rounded-xl border border-border bg-surface-1 p-5">
        <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          // Identity
        </p>
        <dl className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Team name" tag="teams.name">
            {team.name}
          </Field>
          <Field label="Short name" tag="teams.short_name" mono>
            {team.shortName ?? "—"}
          </Field>
          <Field label="Sport" tag="teams.sport_code" mono>
            {team.sportCode}
          </Field>
          <Field label="Status" tag="teams.status" mono>
            {team.status}
          </Field>
          <Field label="Home rink" tag="externalIds.homeRink">
            {team.homeRink ?? "—"}
          </Field>
          <Field label="Captain" tag="teams.captain_user_id" mono>
            {team.captainUserId ? team.captainUserId.slice(0, 8) : "—"}
          </Field>
          <Field
            label="Confirmation threshold"
            tag="teams.confirmation_threshold_cents"
            mono
          >
            {fmtCents(team.confirmationThresholdCents)}
          </Field>
        </dl>
      </section>

      <section className="rounded-xl border border-border bg-surface-1 p-5">
        <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          // Branding
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Logo" tag="teams.logo_url" mono>
            {team.logoUrl ? (
              <a
                href={team.logoUrl}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 hover:underline dark:text-blue-300"
              >
                {team.logoUrl.length > 60
                  ? team.logoUrl.slice(0, 60) + "…"
                  : team.logoUrl}
              </a>
            ) : (
              "—"
            )}
          </Field>
          <Field label="Primary colour" tag="teams.colors.primary" mono>
            <span className="inline-flex items-center gap-2">
              {colors.primary ? (
                <span
                  className="inline-block h-4 w-4 rounded border border-border"
                  style={{ backgroundColor: colors.primary }}
                />
              ) : null}
              {colors.primary ?? "—"}
            </span>
          </Field>
          <Field label="Secondary colour" tag="teams.colors.secondary" mono>
            <span className="inline-flex items-center gap-2">
              {colors.secondary ? (
                <span
                  className="inline-block h-4 w-4 rounded border border-border"
                  style={{ backgroundColor: colors.secondary }}
                />
              ) : null}
              {colors.secondary ?? "—"}
            </span>
          </Field>
        </div>
      </section>

      {extras}
    </div>
  );
}
