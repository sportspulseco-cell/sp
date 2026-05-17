import { notFound } from "next/navigation";
import type { Division, PricingTier, EmailTemplate } from "@sportspulse/api-client";
import {
  league,
  leagueMgmt,
  orgs,
  registration,
  registrationV2
} from "@/lib/api/server-api";
import {
  RegistrationSetupShell,
  type SectionKey,
  type SectionState
} from "@sportspulse/forms-builder";
import { FormsBuilderProviderClient } from "./forms-builder-provider-client";
import { SeasonSection } from "./sections/season-section";
import { PricingSection } from "./sections/pricing-section";
import { DivisionsSection } from "./sections/divisions-section";
import { FormBuilderSection } from "./sections/form-builder-section";
import { EmailTemplatesSection } from "./sections/email-templates-section";
import { ReviewSection } from "./sections/review-section";
import { SubmissionsSection } from "./sections/submissions-section";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Registration setup — SportsPulse" };

const VALID_SECTIONS: SectionKey[] = [
  "season",
  "pricing",
  "divisions",
  "form_builder",
  "email_templates",
  "review",
  "submissions"
];

export default async function FormSetupPage({
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

  const form = await registration.getForm(id).catch(() => null);
  if (!form) notFound();

  // Resolve season + org context for the chrome.
  const [season, org] = await Promise.all([
    form.seasonId
      ? leagueMgmt.getSeason(form.seasonId).catch(() => null)
      : Promise.resolve(null),
    orgs.get(form.orgId).catch(() => null)
  ]);

  // Pull the data needed to compute section status pills + Submissions count.
  const seasonId = form.seasonId;
  const [tiers, divisionsPage, templates, registrationsPage, versions] =
    await Promise.all([
      seasonId
        ? registrationV2.listPricingTiers({ seasonId }).catch(
            () => [] as PricingTier[]
          )
        : Promise.resolve([] as PricingTier[]),
      seasonId
        ? league.listDivisions({ seasonId }).catch(() => ({
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
      registration.listFormVersions(id).catch(() => [])
    ]);

  const tierAssignments =
    tiers.length > 0
      ? await registrationV2
          .tierDivisionsByTiers(tiers.map((t) => t.id))
          .catch(() => ({}) as Record<string, string[]>)
      : ({} as Record<string, string[]>);

  // Aggregate division IDs that are NOT covered by any tier — surfaces
  // as the "BHL 1 has no pricing tier assigned" warning in the mockup.
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
    {
      key: "season",
      index: 1,
      label: "Season setup",
      status: seasonDone ? "done" : "idle"
    },
    {
      key: "pricing",
      index: 2,
      label: "Pricing",
      status: pricingDone ? "done" : "idle"
    },
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
    {
      key: "review",
      index: 6,
      label: "Review & publish",
      status: "idle"
    }
  ];

  const orgName = org?.displayName ?? org?.legalName ?? "Organization";

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
        <SeasonSection form={form} season={season} />
      ) : null}
      {active === "pricing" ? (
        <PricingSection
          form={form}
          season={season}
          tiers={tiers}
          divisions={divisionsPage.items}
        />
      ) : null}
      {active === "divisions" ? (
        <DivisionsSection
          form={form}
          season={season}
          tiers={tiers}
          divisions={divisionsPage.items}
          tierAssignments={tierAssignments}
        />
      ) : null}
      {active === "form_builder" ? (
        <FormBuilderSection form={form} versions={versions} />
      ) : null}
      {active === "email_templates" ? (
        <EmailTemplatesSection
          form={form}
          season={season}
          templates={templates}
        />
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
        <SubmissionsSection form={form} divisions={divisionsPage.items} />
      ) : null}
    </RegistrationSetupShell>
    </FormsBuilderProviderClient>
  );
}
