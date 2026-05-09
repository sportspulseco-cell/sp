import { AlertTriangle, ExternalLink } from "lucide-react";
import type {
  Division,
  EmailTemplate,
  FormVersion,
  PricingTier,
  RegistrationForm,
  Season
} from "@sportspulse/api-client";
import { SectionHeader } from "./section-header";
import { ReviewActions } from "./review-actions";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function fmtDateShort(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric"
  });
}

function fmtMoney(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(cents / 100);
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
  uncoveredDivisions
}: {
  form: RegistrationForm;
  season: Season | null;
  tiers: PricingTier[];
  divisions: Division[];
  tierAssignments: Record<string, string[]>;
  templates: EmailTemplate[];
  versions: FormVersion[];
  uncoveredDivisions: Division[];
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

  const slug =
    season?.name?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") ?? form.id.slice(0, 8);
  const standardLink = `powerplayhockeyleague.com/registration/${slug}`;
  const splitPayLink = `${standardLink}/player`;

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
                ? `${fmtDateShort(season.registrationOpensAt)} – ${fmtDateShort(season.registrationClosesAt)}`
                : "—"}
            </p>
            <p className="font-mono text-[11px] text-fg-muted">
              {form.description?.replace(/_/g, " ") ?? "Team + individual"}
            </p>
          </Tile>
          <Tile label="Pricing">
            <p className="text-[14px] font-medium text-fg">
              {standardTiers.length} standard · {customTiers.length} custom
            </p>
            <p className="font-mono text-[11px] text-fg-muted">
              {standardTier
                ? `${fmtMoney(standardTier.fullPriceCents, standardTier.currency)} full · ${fmtMoney(standardTier.depositCents, standardTier.currency)} deposit`
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

        <LinkRow label="Standard link" value={standardLink} />
        <LinkRow label="Player split-pay link" value={splitPayLink} />

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
                  <span className="font-mono text-fg-muted truncate">
                    {standardLink}/custom/{t.customUrlSlug}
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
  // Server-rendered placeholder; the client island below intercepts.
  return (
    <a
      href={`https://${value}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-3 font-mono text-[10px] uppercase tracking-widest text-fg hover:border-fg-muted"
    >
      <ExternalLink className="h-3 w-3" strokeWidth={1.75} />
      Open
    </a>
  );
}
