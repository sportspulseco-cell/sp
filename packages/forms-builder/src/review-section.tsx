import { formatMoney } from "@sportspulse/kernel";
import { AlertTriangle, ExternalLink } from "lucide-react";
import type {
  Division,
  EmailTemplate,
  FormVersion,
  PricingTier,
  RegistrationForm,
  Season
} from "@sportspulse/api-client";
import {
  SEASON_REGISTRATION_TYPE_LABELS,
  seasonRegistrationType
} from "@sportspulse/kernel";
import { SectionHeader } from "./section-header";
import { ReviewActions } from "./review-actions";

// Season start/end are calendar dates (YYYY-MM-DD): format them in UTC so
// no viewer sees the day before. Registration open/close are instants:
// format them in the season's time zone. REG-11: a close at 23:59 Eastern
// (04:59Z next day) was shown one day late.
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  });
}

function fmtDateShort(iso: string | null, timeZone?: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: timeZone || "America/New_York"
    });
  } catch {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
}


/**
 * Review & publish section. 6-tile summary grid + issue list +
 * registration links + Publish action.
 */
export function ReviewSection({
  form,
  season,
  tiers,
  divisions,
  tierAssignments,
  templates,
  versions,
  uncoveredDivisions,
  playerWebUrl
}: {
  form: RegistrationForm;
  season: Season | null;
  tiers: PricingTier[];
  divisions: Division[];
  tierAssignments: Record<string, string[]>;
  templates: EmailTemplate[];
  versions: FormVersion[];
  uncoveredDivisions: Division[];
  /**
   * This environment's player app origin, read from the API
   * (publicRegistration.appLinks, PLAYER_WEB_URL). Null when the API
   * could not be reached: no link is shown rather than a guess.
   */
  playerWebUrl: string | null;
}) {
  const standardTiers = tiers.filter((t) => !t.customUrlSlug);
  const customTiers = tiers.filter((t) => !!t.customUrlSlug);
  const standardTier = standardTiers[0];

  const assignedDivisionIds = new Set<string>();
  for (const ids of Object.values(tierAssignments)) {
    for (const did of ids) assignedDivisionIds.add(did);
  }
  const assignedNames = divisions
    .filter((d) => assignedDivisionIds.has(d.id))
    .map((d) => d.name);

  const activeVersion =
    versions.find((v) => v.id === form.activeVersionId) ?? null;
  const questions =
    (activeVersion?.schema as { questions?: { conditional?: unknown }[] } | null)?.questions ?? [];
  const conditionalCount = questions.filter((q) => !!q.conditional).length;

  // The real public funnel (player-web /register/<seasonId>). The old
  // powerplayhockeyleague.com/registration/<slug> links were not routes
  // anywhere (REG-13), and a build-time env var with a production
  // fallback sent staging admins to production (REG-12). The origin now
  // comes from the API's PLAYER_WEB_URL, the one the emails use.
  const standardLink = !form.seasonId
    ? "Bind a season first"
    : playerWebUrl
      ? `${playerWebUrl}/register/${form.seasonId}`
      : "Player app address unavailable. Reload the page.";

  const issues: string[] = [];
  for (const d of uncoveredDivisions) {
    issues.push(`${d.name} division has no pricing tier assigned. Go to Divisions to fix.`);
  }
  if (!form.activeVersionId) {
    issues.push("No published form version yet — finish the Form builder section.");
  }
  if (templates.length === 0) {
    issues.push("No email templates configured. Add at least one in Email templates.");
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Review & publish"
        subtitle="Confirm everything looks right, then go live"
      />

      <section className="space-y-4 rounded-xl border border-border bg-surface-1 p-5">
        <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          // Summary
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Tile label="Season">
            <p className="text-[14px] font-medium text-fg">
              {season?.name ?? "—"}
            </p>
            <p className="font-mono text-[11px] text-fg-muted">
              {season?.startDate
                ? `${fmtDate(season.startDate)} – ${fmtDate(season.endDate)}`
                : "Not configured"}
            </p>
          </Tile>
          <Tile label="Registration window">
            <p className="text-[14px] font-medium text-fg">
              {season?.registrationOpensAt
                ? `${fmtDateShort(season.registrationOpensAt, season.timezone)} – ${fmtDateShort(season.registrationClosesAt, season.timezone)}`
                : "—"}
            </p>
            <p className="font-mono text-[11px] text-fg-muted">
              {/* REG-14: the season's registration type (seasons.config). */}
              {SEASON_REGISTRATION_TYPE_LABELS[
                seasonRegistrationType(season?.config as Record<string, unknown> | undefined)
              ]}
            </p>
          </Tile>
          <Tile label="Pricing">
            <p className="text-[14px] font-medium text-fg">
              {standardTiers.length} standard · {customTiers.length} custom
            </p>
            <p className="font-mono text-[11px] text-fg-muted">
              {standardTier
                ? `${formatMoney(standardTier.fullPriceCents, standardTier.currency)} full · ${formatMoney(standardTier.depositCents, standardTier.currency)} deposit`
                : "No tiers yet"}
            </p>
          </Tile>
          <Tile label="Divisions">
            <p className="text-[14px] font-medium text-fg truncate">
              {assignedNames.slice(0, 3).join(", ") || "None assigned"}
              {assignedNames.length > 3 ? ` +${assignedNames.length - 3}` : ""}
            </p>
            {uncoveredDivisions.length > 0 ? (
              <p className="font-mono text-[11px] text-amber-700 dark:text-amber-300">
                ⚠ {uncoveredDivisions.length} unassigned
              </p>
            ) : (
              <p className="font-mono text-[11px] text-fg-muted">
                {divisions.length} total
              </p>
            )}
          </Tile>
          <Tile label="Form questions">
            <p className="text-[14px] font-medium text-fg">
              {questions.length} question{questions.length === 1 ? "" : "s"}
            </p>
            <p className="font-mono text-[11px] text-fg-muted">
              {conditionalCount} with conditional logic
            </p>
          </Tile>
          <Tile label="Email templates">
            <p className="text-[14px] font-medium text-fg">
              {templates.filter((t) => t.isActive).length} configured
            </p>
            <p className="font-mono text-[11px] text-fg-muted truncate">
              {templates
                .filter((t) => t.isActive)
                .map((t) =>
                  t.eventType
                    .split("_")
                    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
                    .join(" ")
                )
                .slice(0, 4)
                .join(" · ") || "None"}
            </p>
          </Tile>
        </div>

        {issues.length > 0 ? (
          <div className="flex items-start gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-4 text-amber-800 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
            <div className="space-y-0.5">
              <p className="text-[13px] font-medium">
                {issues.length} issue{issues.length === 1 ? "" : "s"} to resolve before publishing
              </p>
              <ul className="text-[12px] opacity-90 list-disc pl-5">
                {issues.map((iss, i) => (
                  <li key={i}>{iss}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
      </section>

      <section className="space-y-4 rounded-xl border border-border bg-surface-1 p-5">
        <p className="text-[14px] font-semibold tracking-tight text-fg">
          Registration links
        </p>

        <LinkRow label="Registration link" value={standardLink} />

        {customTiers.length > 0 ? (
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
              Custom tier links
            </p>
            <ul className="mt-1 space-y-1.5">
              {customTiers.map((t) => (
                <li
                  key={t.id}
                  className="flex flex-wrap items-center justify-between gap-2 text-[12px]"
                >
                  <span className="text-fg">{t.name}</span>
                  <span className="text-fg-muted">
                    Separate tier links are not live yet. Players pick this
                    tier inside the registration link.
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <ReviewActions
          formId={form.id}
          publishable={issues.length === 0}
          hasActiveVersion={!!form.activeVersionId}
        />
      </section>
    </div>
  );
}

function Tile({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border bg-bg-subtle p-4">
      <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        {label}
      </p>
      <div className="mt-1.5 space-y-0.5">{children}</div>
    </div>
  );
}

function LinkRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        {label}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <code className="flex-1 truncate rounded-md border border-border bg-bg-subtle px-3 py-2 font-mono text-[12px] text-blue-600 dark:text-blue-300">
          {value}
        </code>
        <CopyButton value={value} />
      </div>
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  // Only real URLs get an Open button; "Bind a season first" is a hint.
  if (!/^https?:\/\//.test(value)) return null;
  return (
    <a
      href={value}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-3 font-mono text-[10px] uppercase tracking-widest text-fg hover:border-fg-muted"
    >
      <ExternalLink className="h-3 w-3" strokeWidth={1.75} />
      Open
    </a>
  );
}
