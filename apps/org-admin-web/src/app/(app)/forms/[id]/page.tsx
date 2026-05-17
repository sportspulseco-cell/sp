import { AlertTriangle } from "lucide-react";
import { notFound } from "next/navigation";
import { EmptyState } from "@sportspulse/ui";
import type {
  Division,
  EmailTemplate,
  FormVersion,
  PricingTier,
  Season
} from "@sportspulse/api-client";
import {
  RegistrationSetupShell,
  PricingClient,
  EmailTemplatesClient,
  SubmissionsClient,
  ReviewSection,
  FormBuilderClient,
  SeasonSectionForm,
  DivisionsClient,
  type SectionKey,
  type SectionState
} from "@sportspulse/forms-builder";
import {
  iam,
  leagueMgmt,
  orgs,
  registration,
  registrationV2
} from "@/lib/api/server-api";
import { FormsBuilderProviderClient } from "./forms-builder-provider-client";
import { getActiveOrgId } from "@/lib/active-org";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Registration setup — Org Admin" };

const VALID_SECTIONS: SectionKey[] = [
  "season",
  "pricing",
  "divisions",
  "form_builder",
  "email_templates",
  "review",
  "submissions"
];

/**
 * Org-admin's mount of the canonical form-builder shell. Mirrors
 * sa-web's /forms/[id]/page.tsx — same fetch + same shared client
 * components — but routes through the /org-admin/* proxy controller
 * (path-rewritten in @/lib/api/client). BUG-043 close.
 *
 * Per CLAUDE.md the section-wrapper fetch logic is inlined here
 * rather than duplicated as per-app section/*.tsx files; each shared
 * client takes its data as props, no silo.
 */
export default async function OrgAdminFormSetupPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const sectionParam = (sp.section ?? "season") as SectionKey;
  const active = VALID_SECTIONS.includes(sectionParam) ? sectionParam : "season";

  const scope = await iam.meScope().catch(() => null);
  const activeOrgId = await getActiveOrgId(scope);

  const form = await registration.getForm(id).catch(() => null);
  if (!form) notFound();
  // Scope safety net — the proxy already enforces this, but a
  // defense-in-depth check here avoids leaking form metadata if the
  // proxy ever drifts.
  if (activeOrgId && form.orgId !== activeOrgId) notFound();

  const [season, org] = await Promise.all([
    form.seasonId
      ? leagueMgmt.getSeason(form.seasonId).catch(() => null)
      : Promise.resolve(null),
    orgs.get(form.orgId).catch(() => null)
  ]);

  const seasonId = form.seasonId;
  const [tiers, divisionsPage, templates, registrationsPage, versions] =
    await Promise.all([
      seasonId
        ? registrationV2.listPricingTiers({ seasonId }).catch(
            () => [] as PricingTier[]
          )
        : Promise.resolve([] as PricingTier[]),
      seasonId
        ? leagueMgmt.listDivisions({ seasonId }).catch(() => ({
            items: [] as Division[],
            nextCursor: null
          }))
        : Promise.resolve({ items: [] as Division[], nextCursor: null }),
      seasonId
        ? registrationV2.listEmailTemplates({ seasonId }).catch(
            () => [] as EmailTemplate[]
          )
        : Promise.resolve([] as EmailTemplate[]),
      registration
        .listRegistrations({ orgId: form.orgId })
        .catch(() => ({ items: [], nextCursor: null })),
      registration.listFormVersions(id).catch(() => [] as FormVersion[])
    ]);

  const tierAssignments =
    tiers.length > 0
      ? await registrationV2
          .tierDivisionsByTiers(tiers.map((t) => t.id))
          .catch(() => ({}) as Record<string, string[]>)
      : ({} as Record<string, string[]>);

  const coveredDivisionIds = new Set<string>();
  for (const ids of Object.values(tierAssignments)) {
    for (const did of ids) coveredDivisionIds.add(did);
  }
  const uncoveredDivisions = divisionsPage.items.filter(
    (d) => !coveredDivisionIds.has(d.id)
  );

  const seasonDone =
    !!seasonId &&
    !!season?.name &&
    !!season?.startDate &&
    !!season?.endDate &&
    !!season?.registrationOpensAt;
  const pricingDone = tiers.length > 0;
  const divisionsIssue = uncoveredDivisions.length;
  const formBuilderDone = (versions.length ?? 0) > 0 && !!form.activeVersionId;
  const emailTemplatesDone = templates.length > 0;

  const sections: SectionState[] = [
    { key: "season", index: 1, label: "Season setup", status: seasonDone ? "done" : "idle" },
    { key: "pricing", index: 2, label: "Pricing", status: pricingDone ? "done" : "idle" },
    {
      key: "divisions",
      index: 3,
      label: "Divisions",
      status:
        divisionsIssue > 0
          ? "issue"
          : divisionsPage.items.length > 0
            ? "done"
            : "idle",
      issueCount: divisionsIssue
    },
    {
      key: "form_builder",
      index: 4,
      label: "Form builder",
      status: formBuilderDone ? "done" : "idle"
    },
    {
      key: "email_templates",
      index: 5,
      label: "Email templates",
      status: emailTemplatesDone ? "done" : "idle"
    },
    { key: "review", index: 6, label: "Review & publish", status: "idle" }
  ];

  const orgName = org?.displayName ?? org?.legalName ?? "Organization";

  // Server entry: prior seasons for Season step's rollover card.
  let priorSeasons: Season[] = [];
  if (active === "season") {
    const priorPage = await leagueMgmt
      .listSeasons({ orgId: form.orgId })
      .catch(() => ({ items: [] as Season[], nextCursor: null }));
    priorSeasons = priorPage.items
      .filter((s) => s.id !== form.seasonId)
      .slice(0, 5);
  }

  const latestVersion =
    versions.find((v) => !v.locked) ??
    versions.find((v) => v.id === form.activeVersionId) ??
    versions[0] ??
    null;

  return (
    <FormsBuilderProviderClient>
      <RegistrationSetupShell
        formId={form.id}
        formName={form.name}
        seasonName={season?.name ?? null}
        seasonId={season?.id ?? null}
        orgName={orgName}
        active={active}
        sections={sections}
        submissionsCount={registrationsPage.items.length}
        draft={!form.activeVersionId}
        searchParams={sp}
      >
        {active === "season" ? (
          <SeasonSectionForm form={form} season={season} priorSeasons={priorSeasons} />
        ) : null}
        {active === "pricing" ? (
          season ? (
            <PricingClient
              formId={form.id}
              seasonId={season.id}
              tiers={tiers}
              divisions={divisionsPage.items}
            />
          ) : (
            <EmptyState
              icon={AlertTriangle}
              title="Bind this form to a season first"
              description="Pricing tiers are stored per (season, tier). Visit Season setup and pick a season before configuring pricing."
            />
          )
        ) : null}
        {active === "divisions" ? (
          season ? (
            <DivisionsClient
              formId={form.id}
              season={season}
              tiers={tiers}
              divisions={divisionsPage.items}
              tierAssignments={tierAssignments}
            />
          ) : (
            <EmptyState
              icon={AlertTriangle}
              title="Bind this form to a season first"
              description="Division settings are stored per season. Visit Season setup and pick a season before configuring divisions."
            />
          )
        ) : null}
        {active === "form_builder" ? (
          <FormBuilderClient
            formId={form.id}
            initialSchema={
              (latestVersion?.schema as Record<string, unknown> | undefined) ?? null
            }
            isLocked={!!latestVersion?.locked}
            hasActiveVersion={!!form.activeVersionId}
          />
        ) : null}
        {active === "email_templates" ? (
          season ? (
            <EmailTemplatesClient seasonId={season.id} templates={templates} />
          ) : (
            <EmptyState
              icon={AlertTriangle}
              title="Bind this form to a season first"
              description="Email templates are stored per (season, event_type). Visit Season setup before configuring them."
            />
          )
        ) : null}
        {active === "review" ? (
          <ReviewSection
            form={form}
            season={season}
            tiers={tiers}
            divisions={divisionsPage.items}
            tierAssignments={tierAssignments}
            templates={templates}
            versions={versions}
            uncoveredDivisions={uncoveredDivisions}
          />
        ) : null}
        {active === "submissions" ? (
          <SubmissionsClient
            registrations={registrationsPage.items}
            divisions={divisionsPage.items}
          />
        ) : null}
      </RegistrationSetupShell>
    </FormsBuilderProviderClient>
  );
}
