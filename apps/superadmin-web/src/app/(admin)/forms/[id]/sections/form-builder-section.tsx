import type { FormVersion, RegistrationForm } from "@sportspulse/api-client";
import { FormBuilderClient, newestFormVersion } from "@sportspulse/forms-builder";

/**
 * Form builder section — questions + waivers/documents toggles.
 * Reuses the existing <FormBuilder> from the version wizard for the
 * questions list (drag/reorder, conditional logic, type pickers).
 */
export function FormBuilderSection({
  form,
  versions,
  seasonConfig
}: {
  form: RegistrationForm;
  versions: FormVersion[];
  /** The bound season's config; null when the form has no season. */
  seasonConfig: Record<string, unknown> | null;
}) {
  // The newest version by number: an open draft to edit, or the live
  // version, locked. Never "first unlocked in the list": that opened an
  // older autosave draft and depended on the API's ordering.
  const latestVersion = newestFormVersion(versions);

  return (
    <FormBuilderClient
      formId={form.id}
      initialSchema={
        (latestVersion?.schema as Record<string, unknown> | undefined) ?? null
      }
      isLocked={!!latestVersion?.locked}
      hasActiveVersion={!!form.activeVersionId}
      seasonConfig={seasonConfig}
    />
  );
}
