import { fetchAll } from "@sportspulse/api-client";
import { Alert, LocalDate } from "@sportspulse/ui";
import { FileSignature, CheckCircle2, FileQuestion, Layers } from "lucide-react";
import Link from "next/link";
import {
  FORM_PURPOSE_LABELS,
  FORM_PURPOSES,
  SYSTEM_ROLE_BY_CODE,
  type FormPurpose
} from "@sportspulse/kernel";
import { orgs, registration } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { KineticStrip } from "@/components/layout/kinetic-strip";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import {
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table
} from "@/components/ui/table";
import { CreateFormButton } from "@/components/forms/create-form-button";
import { FormsFilters } from "@/components/forms/forms-filters";
import { cn } from "@/lib/utils";

export const metadata = { title: "Forms — SportsPulse" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Source-of-truth list for every form schema in the system —
 * registration funnels, role-profile forms (used by /users invite),
 * team-application forms, and admin-built custom forms. Filter chips
 * narrow the view to one purpose; counts are computed server-side
 * across the unfiltered set.
 */
export default async function FormsPage({
  searchParams
}: {
  searchParams?: Promise<{
    purpose?: string;
    q?: string;
    org?: string;
    scope?: string;
    division?: string;
  }>;
}) {
  const sp = await searchParams;
  const filterPurpose =
    sp?.purpose && (FORM_PURPOSES as ReadonlyArray<string>).includes(sp.purpose)
      ? (sp.purpose as FormPurpose)
      : null;

  let loadFailed = false;
  const [allForms, orgList] = await Promise.all([
    // Every form, not the first page of 25.
    fetchAll((cursor) => registration.listForms({ limit: 100, cursor })).catch((e) => {
      // Show the failure; an empty list here read as "No forms yet".
      console.error("[forms] listForms failed", e);
      loadFailed = true;
      return { items: [], nextCursor: null };
    }),
    orgs.list({ limit: 100 }).catch(() => ({ items: [], nextCursor: null }))
  ]);
  const orgMap = new Map(orgList.items.map((o) => [o.id, o.displayName]));

  const q = sp?.q?.trim().toLowerCase() ?? "";
  const filtered = allForms.items.filter(
    (f) =>
      (!filterPurpose || f.purpose === filterPurpose) &&
      (!q || f.name.toLowerCase().includes(q)) &&
      (!sp?.org || f.orgId === sp.org) &&
      (!sp?.scope || f.scope === sp.scope) &&
      (!sp?.division || (f.scope === "division" && f.scopeId === sp.division))
  );
  // Divisions that actually have a form, by name (PPHL asked for an org
  // and a division filter on this page).
  const divisionOptions = [
    ...new Map(
      allForms.items
        .filter((f) => f.scope === "division" && f.scopeId)
        .map((f) => [f.scopeId!, f.scopeName ?? "Unnamed division"] as const)
    ).entries()
  ]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Per-purpose counts for the filter chips.
  const counts = FORM_PURPOSES.reduce<Record<string, number>>((acc, p) => {
    acc[p] = allForms.items.filter((f) => f.purpose === p).length;
    return acc;
  }, {});

  const total = allForms.items.length;
  const published = allForms.items.filter((f) => f.activeVersionId).length;
  const drafts = total - published;
  const orgsCovered = new Set(allForms.items.map((f) => f.orgId)).size;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Registration"
        title="Registration forms"
        description="The forms players and teams fill in to register for a season: questions, waivers, prices. Publish a form to open registration."
        action={<CreateFormButton orgs={orgList.items} defaultOrgId={sp?.org} />}
      />
      <KineticStrip
        cards={[
          { label: "Total forms", value: total, icon: <FileSignature className="h-3.5 w-3.5" strokeWidth={1.75} />, tone: "idle" },
          {
            label: "Published",
            value: published,
            icon: <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.75} />,
            tone: published > 0 ? "ok" : "idle",
            hint:
              total > 0
                ? `${Math.round((published / total) * 100)}% live`
                : undefined
          },
          {
            label: "Drafts",
            value: drafts,
            icon: <FileQuestion className="h-3.5 w-3.5" strokeWidth={1.75} />,
            tone: drafts > 0 ? "warn" : "idle"
          },
          {
            label: "Orgs covered",
            value: orgsCovered,
            icon: <Layers className="h-3.5 w-3.5" strokeWidth={1.75} />,
            tone: "info"
          }
        ]}
      />

      <nav className="flex flex-wrap gap-2 border-b border-border pb-3">
        <FilterChip
          label="All"
          count={allForms.items.length}
          active={!filterPurpose}
          href="/forms"
        />
        {FORM_PURPOSES.map((p) => (
          <FilterChip
            key={p}
            label={FORM_PURPOSE_LABELS[p]}
            count={counts[p] ?? 0}
            active={filterPurpose === p}
            href={`/forms?purpose=${p}`}
          />
        ))}
      </nav>

      <div className="space-y-2">
        <FormsFilters
          orgs={orgList.items
            .filter((o) => allForms.items.some((f) => f.orgId === o.id))
            .map((o) => ({ id: o.id, name: o.displayName }))}
          divisions={divisionOptions}
        />
        <p className="text-[12px] text-fg-muted">
          Showing {filtered.length} of {allForms.items.length} forms
        </p>
      </div>

      {loadFailed ? (
        <Alert tone="error">
          Could not load forms. This is a server problem on our side, not your data. Reload to try again.
        </Alert>
      ) : filtered.length === 0 && (q || sp?.org || sp?.scope || sp?.division) ? (
        // Forms exist but none match: say so, instead of "No forms yet".
        <EmptyState
          icon={FileSignature}
          title="No forms match these filters"
          description="Clear the search or pick a different organisation, division or scope."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={FileSignature}
          title={
            filterPurpose
              ? `No ${FORM_PURPOSE_LABELS[filterPurpose]} forms yet`
              : "No forms yet"
          }
          description={
            filterPurpose === "role_profile"
              ? "Role-profile forms are surfaced when admins invite a user — the new user fills it out at first sign-in."
              : filterPurpose === "season_registration"
                ? "Season-registration forms drive the /registration multistep wizard. Pick or create one to begin."
                : "Create the first form for any organization."
          }
          action={<CreateFormButton orgs={orgList.items} defaultOrgId={sp?.org} />}
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Org</TH>
              <TH>Purpose</TH>
              <TH>Applies to</TH>
              <TH>Scope</TH>
              <TH>Status</TH>
              <TH>Updated</TH>
            </TR>
          </THead>
          <TBody>
            {filtered.map((f) => (
              <TR key={f.id}>
                <TD className="font-medium">
                  <Link href={`/forms/${f.id}`} className="hover:underline">
                    {f.name}
                  </Link>
                  {f.description ? (
                    <p className="mt-0.5 text-[12px] text-fg-muted">
                      {f.description}
                    </p>
                  ) : null}
                </TD>
                <TD className="text-fg-muted">
                  {orgMap.get(f.orgId) ?? "Unknown org"}
                </TD>
                <TD>
                  <Badge
                    mono
                    tone={purposeTone(f.purpose)}
                  >
                    {FORM_PURPOSE_LABELS[f.purpose] ?? f.purpose}
                  </Badge>
                </TD>
                <TD className="text-[12px] text-fg-muted">
                  {f.appliesToRoles.length === 0 ? (
                    <span className="italic text-fg-muted">All roles</span>
                  ) : (
                    f.appliesToRoles
                      .map((c) => SYSTEM_ROLE_BY_CODE[c]?.name ?? c)
                      .join(", ")
                  )}
                </TD>
                <TD>
                  <Badge mono>{f.scope}</Badge>
                  {f.scope !== "org" ? (
                    <p className="mt-1 text-[12px] text-fg-muted">
                      {f.scopeName ?? `Unnamed ${f.scope}`}
                    </p>
                  ) : null}
                </TD>
                <TD>
                  {/* The version id meant nothing to admins; say what it means. */}
                  {f.activeVersionId ? (
                    <Badge tone="success" mono>
                      PUBLISHED
                    </Badge>
                  ) : (
                    <Badge tone="warning" mono>
                      DRAFT
                    </Badge>
                  )}
                </TD>
                <TD className="text-fg-muted">
                  <LocalDate iso={f.updatedAt} format="date" />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}

function FilterChip({
  label,
  count,
  active,
  href
}: {
  label: string;
  count: number;
  active: boolean;
  href: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full border px-3 font-mono text-[10px] uppercase tracking-widest transition-colors",
        active
          ? "border-accent bg-accent/10 text-accent"
          : "border-border bg-bg-subtle text-fg-muted hover:border-fg-muted hover:text-fg"
      )}
    >
      {label}
      <span
        className={cn(
          "rounded-full px-1.5 py-0.5 text-[9px] tabular-nums",
          active ? "bg-accent/15 text-accent" : "bg-fg-muted/15 text-fg-muted"
        )}
      >
        {count}
      </span>
    </Link>
  );
}

function purposeTone(
  p: string
): "info" | "success" | "warning" | "neutral" {
  if (p === "season_registration") return "info";
  if (p === "role_profile") return "success";
  if (p === "team_application") return "warning";
  return "neutral";
}
