"use client";

import { FreeAgentPoolPanel, type FreeAgentPoolApi } from "@sportspulse/admin-pages";
import { registrationV2Admin } from "@/lib/api/browser-api";

/**
 * Free-agent pool on the org console's Registrations page (CAP-10). Same
 * shared panel as the admin console; the API scopes it to this admin's
 * seasons.
 */
export function FreeAgentPoolSection() {
  return (
    <FreeAgentPoolPanel
      api={registrationV2Admin as FreeAgentPoolApi}
      showHeading={false}
    />
  );
}
