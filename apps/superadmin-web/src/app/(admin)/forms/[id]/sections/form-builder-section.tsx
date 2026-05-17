import type { FormVersion, RegistrationForm } from "@sportspulse/api-client";
import { FormBuilderClient } from "@sportspulse/forms-builder";

/**
 * Form builder section — questions + waivers/documents toggles.
 * Reuses the existing <FormBuilder> from the version wizard for the
 * questions list (drag/reorder, conditional logic, type pickers).
 */
export function FormBuilderSection({
  form,
  versions
}: {
  form: RegistrationForm;
  versions: FormVersion[];
}) {
  // Pick the latest draft if any, else the active version, else empty.
  const latestVersion =
    versions.find((v) => !v.locked) ??
    versions.find((v) => v.id === form.activeVersionId) ??
    versions[0] ??
    null;

  return (
    <FormBuilderClient
      formId={form.id}
      initialSchema={
        (latestVersion?.schema as Record<string, unknown> | undefined) ?? null
      }
      isLocked={!!latestVersion?.locked}
      hasActiveVersion={!!form.activeVersionId}
    />
  );
}
