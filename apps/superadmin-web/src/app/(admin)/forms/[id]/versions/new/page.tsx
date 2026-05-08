import { notFound } from "next/navigation";
import { registration } from "@/lib/api/server-api";
import { VersionWizard } from "@/components/forms/version-wizard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Create form version — SportsPulse" };

/**
 * 5-step version-creation wizard for a registration form. Mirrors the
 * SP Mocks spec — left sidebar with the steps + status indicators,
 * right panel renders the active step. The Form fields step is the
 * one with persistence weight: it edits a `FormDefinition` JSONB
 * blob that becomes registration_form_versions.schema on publish.
 *
 * Other steps (Eligibility, Pricing, Notifications) summarise data
 * that was set during form creation OR that the admin manages on
 * dedicated pages (linked out in the sidebar). Keeps the wizard
 * focused on building the form, not duplicating CRUD that already
 * lives in seasons/pricing/email-template editors.
 */
export default async function CreateVersionPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const form = await registration.getForm(id).catch(() => null);
  if (!form) notFound();

  // Pre-populate from the latest existing version when one exists, so
  // "Create version" against an active form starts from the published
  // schema instead of an empty form.
  const versions = await registration.listFormVersions(id).catch(() => []);
  const latest = versions[0];

  return (
    <VersionWizard
      form={form}
      seedSchema={
        latest?.schema as Record<string, unknown> | undefined
      }
      nextVersionNumber={(versions[0]?.versionNumber ?? 0) + 1}
    />
  );
}
