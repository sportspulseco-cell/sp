"use client";

import { useState } from "react";
import type { EmailTemplate } from "@sportspulse/api-client";
import { EmailTemplatesTab } from "@/components/registrations/tabs/email-templates-tab";
import { SectionHeader } from "./section-header";

export function EmailTemplatesClient({
  seasonId,
  templates: initial
}: {
  seasonId: string;
  templates: EmailTemplate[];
}) {
  const [templates, setTemplates] = useState(initial);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Email templates"
        subtitle="Configure all triggered emails — different templates per event"
      />
      <EmailTemplatesTab
        seasonId={seasonId}
        templates={templates}
        onTemplatesChange={setTemplates}
      />
    </div>
  );
}
