import { ArrowLeft, Layers } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { adminTransfers, leagueMgmt } from "@/lib/api/server-api";
import { Badge, statusTone } from "@/components/ui/badge";
import { Eyebrow } from "@/components/ui/eyebrow";
import { IconTile } from "@/components/ui/icon-tile";
import { ResourceAdminsSection } from "@/components/layout/resource-admins-section";

export const metadata = { title: "Division — SportsPulse" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

const TIEBREAKER_LABELS: Record<string, string> = {
  wins: "Wins",
  head_to_head: "Head-to-head",
  goal_diff: "Goal differential",
  goals_for: "Goals for",
  goals_against: "Goals against",
  coin_flip: "Coin flip"
};

const SERIES_LABELS: Record<string, string> = {
  best_of_1: "Single game (best of 1)",
  best_of_3: "Best of 3",
  best_of_5: "Best of 5",
  best_of_7: "Best of 7"
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

/**
 * View-only division detail. Source of truth for editing is /org-setup
 * Phase 3 (Divisions). Surfaces every field the wizard captures from
 * the JSONB ruleSetOverrides + playoffConfig.
 */
export default async function DivisionDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const division = await leagueMgmt.getDivision(id).catch(() => null);
  if (!division) notFound();

  const [parentSeason, divisionTeams] = await Promise.all([
    leagueMgmt.getSeason(division.seasonId).catch(() => null),
    adminTransfers.listDivisionTeams(id).catch(() => ({ items: [] }))
  ]);

  const rules = (division.ruleSetOverrides ?? {}) as {
    gameRules?: {
      numberOfPeriods?: number;
      periodLengthMin?: number;
      clockType?: string;
      overtimeRule?: string;
      bodyChecking?: string;
      minStartersToStart?: number;
      maxGuestPlayersPerGame?: number;
      maxRosterSize?: number;
    };
    tiebreakers?: string[];
    ageRange?: { min?: number | null; max?: number | null; label?: string };
  };
  const playoff = (division.playoffConfig ?? {}) as {
    enabled?: boolean;
    playoffSpots?: number;
    startDate?: string;
    endDate?: string;
    seriesFormat?: string;
    bracketType?: string;
    homeIceRule?: string;
  };

  return (
    <div className="space-y-8">
      <Link
        href="/divisions"
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        All divisions
      </Link>

      <header className="flex items-start gap-5 border-b border-border pb-8">
        <IconTile icon={Layers} tint="cyan" size="lg" />
        <div className="space-y-2">
          <Eyebrow dot>DIVISION · {division.id.slice(0, 8)}</Eyebrow>
          <h1 className="text-[36px] font-semibold leading-[1.05] tracking-tighter text-fg">
            {division.name}
          </h1>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {division.tier ? <Badge mono>{division.tier}</Badge> : null}
            <Badge mono>{division.genderEligibility}</Badge>
            <Badge tone={statusTone(division.status)} mono>
              {division.status}
            </Badge>
            {parentSeason ? (
              <Link
                href={`/seasons/${parentSeason.id}`}
                className="font-mono text-[10px] uppercase tracking-widest text-accent hover:underline"
              >
                {parentSeason.name} →
              </Link>
            ) : null}
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
        <dl className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Division name" tag="divisions.name">
            {division.name}
          </Field>
          <Field label="Tier" tag="divisions.tier" mono>
            {division.tier ?? "—"}
          </Field>
          <Field label="Gender eligibility" tag="divisions.gender_eligibility" mono>
            {division.genderEligibility}
          </Field>
          <Field label="Min age" tag="ageRange.min" mono>
            {rules.ageRange?.min ?? "—"}
          </Field>
          <Field label="Max age" tag="ageRange.max" mono>
            {rules.ageRange?.max ?? "—"}
          </Field>
          <Field label="Age group label" tag="ageRange.label">
            {rules.ageRange?.label ?? "—"}
          </Field>
          <Field label="Max teams" tag="divisions.max_teams" mono>
            {division.maxTeams ?? "—"}
          </Field>
          <Field label="Status" tag="divisions.status" mono>
            {division.status}
          </Field>
        </dl>
      </section>

      <section className="rounded-xl border border-border bg-surface-1 p-5">
        <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          // Game rules
          <span className="ml-2 normal-case text-fg">
            (divisions.ruleSetOverrides JSONB)
          </span>
        </p>
        <dl className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Number of periods" mono>
            {rules.gameRules?.numberOfPeriods ?? "—"}
          </Field>
          <Field label="Period length (min)" mono>
            {rules.gameRules?.periodLengthMin ?? "—"}
          </Field>
          <Field label="Clock type" mono>
            {rules.gameRules?.clockType ?? "—"}
          </Field>
          <Field label="Overtime" mono>
            {rules.gameRules?.overtimeRule
              ? rules.gameRules.overtimeRule.replace(/_/g, " ")
              : "—"}
          </Field>
          <Field label="Body checking" mono>
            {rules.gameRules?.bodyChecking
              ? rules.gameRules.bodyChecking.replace(/_/g, " ")
              : "—"}
          </Field>
          <Field label="Min skaters to start" mono>
            {rules.gameRules?.minStartersToStart ?? "—"}
          </Field>
          <Field label="Max guest players per game" mono>
            {rules.gameRules?.maxGuestPlayersPerGame ?? "—"}
          </Field>
          <Field label="Max roster size" mono>
            {rules.gameRules?.maxRosterSize ?? "—"}
          </Field>
        </dl>
      </section>

      <section className="rounded-xl border border-border bg-surface-1 p-5">
        <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          // Tiebreaker order
        </p>
        {rules.tiebreakers && rules.tiebreakers.length > 0 ? (
          <ol className="mt-3 space-y-1.5">
            {rules.tiebreakers.map((code, i) => (
              <li key={code} className="flex items-center gap-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent font-mono text-[11px] text-bg">
                  {i + 1}
                </span>
                <span className="text-[13px] text-fg">
                  {TIEBREAKER_LABELS[code] ?? code}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-[12px] text-fg-muted">Not configured.</p>
        )}
      </section>

      <section className="rounded-xl border border-border bg-surface-1 p-5">
        <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          // Post-season
          <span className="ml-2 normal-case text-fg">
            (divisions.playoffConfig JSONB)
          </span>
        </p>
        {playoff.enabled ? (
          <dl className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Playoffs enabled" mono>
              Yes
            </Field>
            <Field label="Spots" tag="playoffSpots" mono>
              Top {playoff.playoffSpots ?? "—"}
            </Field>
            <Field label="Start date" tag="startDate" mono>
              {fmtDate(playoff.startDate)}
            </Field>
            <Field label="End date" tag="endDate" mono>
              {fmtDate(playoff.endDate)}
            </Field>
            <Field label="Series format" tag="seriesFormat" mono>
              {playoff.seriesFormat
                ? SERIES_LABELS[playoff.seriesFormat] ?? playoff.seriesFormat
                : "—"}
            </Field>
            <Field label="Bracket type" tag="bracketType" mono>
              {playoff.bracketType?.replace(/_/g, " ") ?? "—"}
            </Field>
            <Field label="Home ice rule" tag="homeIceRule" mono>
              {playoff.homeIceRule?.replace(/_/g, " ") ?? "—"}
            </Field>
          </dl>
        ) : (
          <p className="mt-2 text-[12px] text-fg-muted">
            Playoffs disabled for this division.
          </p>
        )}
      </section>

      <section className="rounded-xl border border-border bg-surface-1 p-6">
        <Eyebrow>// teams registered in this division</Eyebrow>
        <p className="mt-1 text-[13px] text-fg-muted">
          Captains apply via{" "}
          <code className="font-mono">/captain/register</code>; once a
          league/org/super admin approves the application, the team
          shows here.
        </p>
        {divisionTeams.items.length === 0 ? (
          <p className="mt-4 rounded-md border border-dashed border-border bg-bg-subtle px-3 py-6 text-center text-[13px] text-fg-muted">
            No approved teams yet. Pending applications live at{" "}
            <Link
              href={`/seasons/${division.seasonId}/applications`}
              className="text-accent hover:underline"
            >
              the season's applications queue
            </Link>
            .
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-md border border-border bg-bg-subtle">
            {divisionTeams.items.map((t) => {
              const pct = t.thresholdCents
                ? Math.min(
                    100,
                    Math.round((t.collectedCents / t.thresholdCents) * 100)
                  )
                : 0;
              return (
                <li
                  key={t.entryId}
                  className="grid grid-cols-1 gap-2 px-4 py-3 md:grid-cols-[1fr_auto_auto_auto] md:items-center"
                >
                  <div>
                    <Link
                      href={`/teams/${t.teamId}`}
                      className="font-medium text-fg hover:underline"
                    >
                      {t.teamName}
                    </Link>
                    {t.teamShortName && (
                      <span className="ml-2 font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                        {t.teamShortName}
                      </span>
                    )}
                  </div>
                  <Badge tone={statusTone(t.entryStatus)}>
                    {t.entryStatus.replace(/_/g, " ")}
                  </Badge>
                  <span className="font-mono text-[11px] text-fg-muted tabular-nums">
                    {pct}% confirmed
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                    applied {new Date(t.appliedAt).toLocaleDateString()}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <ResourceAdminsSection
        scopeType="division"
        scopeId={division.id}
        resourceLabel={division.name}
        allowedRoleCodes={["division_admin"]}
        description="Division admins manage teams, lineups, and games inside this division."
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
