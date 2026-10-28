import { formatMoney } from "@sportspulse/kernel";
import type { ReactNode } from "react";
import { Badge, PageHeader, Reveal, statusTone, Eyebrow, IconTile } from "@sportspulse/ui";
import { ArrowLeft, Network } from "lucide-react";
import Link from "next/link";
import type { Team } from "@sportspulse/api-client";
import { Field } from "./field";

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
  extras,
  actions
}: {
  team: Team;
  /** Header actions (Edit team), injected per app. */
  actions?: ReactNode;
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
      <PageHeader
        eyebrow={<>TEAM · {team.ownerOrgName ?? "Unknown org"}</>}
        title={team.name}
        description={
          <>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {team.shortName ? <Badge mono>{team.shortName}</Badge> : null}
              <Badge mono>{team.sportCode}</Badge>
              <Badge status={team.status} />
            </div>
          </>
        }
        action={
          <>
            {actions ? <div className="shrink-0">{actions}</div> : null}
          </>
        }
      />

      <Reveal as="section" delay={0.05} className="rounded-xl border border-border bg-surface-1 p-5">
        <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          Identity
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
          <Field label="Captain" tag="teams.captain_user_id">
            {team.captainUserId ? (team.captainName ?? "Unknown user") : "—"}
          </Field>
          <Field
            label="Confirmation threshold"
            tag="teams.confirmation_threshold_cents"
            mono
          >
            {formatMoney(team.confirmationThresholdCents)}
          </Field>
        </dl>
      </Reveal>

      <Reveal as="section" delay={0.1} className="rounded-xl border border-border bg-surface-1 p-5">
        <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          Branding
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Logo" tag="teams.logo_url" mono>
            {team.logoUrl ? (
              <a
                href={team.logoUrl}
                target="_blank"
                rel="noreferrer"
                className="text-accent hover:underline"
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
      </Reveal>

      {extras}
    </div>
  );
}
