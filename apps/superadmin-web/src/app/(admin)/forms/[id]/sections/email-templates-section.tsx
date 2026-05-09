import { AlertTriangle } from "lucide-react";
import { EmptyState } from "@sportspulse/ui";
import type {
  EmailTemplate,
  RegistrationForm,
  Season
} from "@sportspulse/api-client";
import { EmailTemplatesClient } from "./email-templates-client";

export function EmailTemplatesSection({
  form: _form,
  season,
  templates
}: {
  form: RegistrationForm;
  season: Season | null;
  templates: EmailTemplate[];
}) {
  if (!season) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Bind this form to a season first"
        description="Email templates are stored per (season, event_type). Visit Season setup before configuring them."
      />
    );
  }
  return <EmailTemplatesClient seasonId={season.id} templates={templates} />;
}
