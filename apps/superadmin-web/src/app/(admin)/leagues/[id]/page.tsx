import { ArrowLeft, Trophy } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { leagueMgmt, orgs } from "@/lib/api/server-api";
import { Badge, statusTone } from "@/components/ui/badge";
import { Eyebrow } from "@/components/ui/eyebrow";
import { IconTile } from "@/components/ui/icon-tile";
import { ResourceAdminsSection } from "@/components/layout/resource-admins-section";

export const metadata = { title: "League — SportsPulse" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

const PRIVACY_LABEL: Record<string, string> = {
  public: "Public — visible in league directory",
  unlisted: "Unlisted — accessible via direct link only",
  private: "Private — login required to view anything"
};

/**
 * View-only league detail. Source of truth for editing is /org-setup
 * (per repo owner directive). All fields here mirror what the wizard
 * captured + are tagged with their DB columns for traceability.
 */
export default async function LeagueDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const league = await leagueMgmt.getLeague(id).catch(() => null);
  if (!league) notFound();

  const [org, governingBodies, seasonsPage] = await Promise.all([
    orgs.get(league.orgId).catch(() => null),
    leagueMgmt.listGoverningBodies({}).catch(() => []),
    leagueMgmt.listSeasons({ leagueId: league.id }).catch(() => ({ items: [] }))
  ]);

  const md = (league.metadata ?? {}) as {
    slug?: string;
    branding?: { logoUrl?: string | null; primaryColor?: string };
    privacy?: string;
    timezone?: string;
  };
  const govBody = governingBodies.find((b) => b.id === league.governingBodyId);

  return (
    <div className="space-y-8">
      <Link
        href="/leagues"
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        All leagues
      </Link>

      <header className="flex items-start gap-5 border-b border-border pb-8">
        <IconTile icon={Trophy} tint="amber" size="lg" />
        <div className="space-y-2">
          <Eyebrow dot>LEAGUE · {league.id.slice(0, 8)}</Eyebrow>
          <h1 className="text-[36px] font-semibold leading-[1.05] tracking-tighter text-fg">
            {league.name}
          </h1>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Badge mono>{league.sportCode}</Badge>
            <Badge mono>{league.format}</Badge>
            <Badge tone={statusTone(league.status)} mono>
              {league.status}
            </Badge>
            {md.privacy ? <Badge mono>{md.privacy}</Badge> : null}
          </div>
        </div>
        <Link
          href="/org-setup"
          className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-3 font-mono text-[10px] uppercase tracking-widest text-fg hover:border-fg-muted"
        >
          Edit in Org setup →
        </Link>
      </header>

      <section className="rounded-xl border border-border bg-surface-1 p-5">
        <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          // Identity
        </p>
        <dl className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field label="League name" tag="leagues.name">
            {league.name}
          </Field>
          <Field label="Slug" tag="metadata.slug" mono>
            {md.slug ?? "—"}
          </Field>
          <Field label="Sport" tag="leagues.sport_code" mono>
            {league.sportCode}
          </Field>
          <Field label="Format" tag="leagues.format" mono>
            {league.format}
          </Field>
          <Field label="Governing body" tag="leagues.governing_body_id">
            {govBody ? govBody.name : "Unsanctioned"}
          </Field>
          <Field label="Time zone" tag="metadata.timezone" mono>
            {md.timezone ?? "—"}
          </Field>
          <Field label="Organisation" tag="leagues.org_id">
            {org ? org.displayName ?? org.legalName : league.orgId.slice(0, 8)}
          </Field>
          <Field label="Status" tag="leagues.status" mono>
            {league.status}
          </Field>
        </dl>
      </section>

      <section className="rounded-xl border border-border bg-surface-1 p-5">
        <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          // Branding
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field label="Logo" tag="metadata.branding.logoUrl" mono>
            {md.branding?.logoUrl ? (
              <a
                href={md.branding.logoUrl}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 hover:underline dark:text-blue-300"
              >
                {md.branding.logoUrl.length > 60
                  ? md.branding.logoUrl.slice(0, 60) + "…"
                  : md.branding.logoUrl}
              </a>
            ) : (
              "—"
            )}
          </Field>
          <Field
            label="Primary colour"
            tag="metadata.branding.primaryColor"
            mono
          >
            <span className="inline-flex items-center gap-2">
              {md.branding?.primaryColor ? (
                <span
                  className="inline-block h-4 w-4 rounded border border-border"
                  style={{ backgroundColor: md.branding.primaryColor }}
                />
              ) : null}
              {md.branding?.primaryColor ?? "—"}
            </span>
          </Field>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface-1 p-5">
        <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          // Privacy
        </p>
        <p className="mt-2 text-[13px] text-fg">
          {md.privacy
            ? PRIVACY_LABEL[md.privacy] ?? md.privacy
            : "Not configured"}
        </p>
      </section>

      <section className="rounded-xl border border-border bg-surface-1 p-5">
        <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border pb-3">
          <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            // Seasons in this league
          </p>
          <Link
            href={`/seasons?leagueId=${league.id}`}
            className="font-mono text-[10px] uppercase tracking-widest text-accent hover:underline"
          >
            View all →
          </Link>
        </header>
        {seasonsPage.items.length === 0 ? (
          <p className="mt-3 text-[12px] text-fg-muted">
            No seasons under this league yet. Create one via Org setup.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {seasonsPage.items.slice(0, 5).map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 py-2.5"
              >
                <Link
                  href={`/seasons/${s.id}`}
                  className="text-[13px] font-medium text-fg hover:underline"
                >
                  {s.name}
                </Link>
                <span className="font-mono text-[11px] text-fg-muted">
                  {s.startDate} → {s.endDate}
                </span>
                <Badge mono tone={statusTone(s.status)}>
                  {s.status.replace(/_/g, " ")}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ResourceAdminsSection
        scopeType="league"
        scopeId={league.id}
        resourceLabel={league.name}
        allowedRoleCodes={[
          "league_admin",
          "registrar",
          "referee",
          "scorekeeper"
        ]}
        description="League admins manage divisions, teams, and schedules. Registrars review submissions; refs and scorekeepers run game-day."
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
