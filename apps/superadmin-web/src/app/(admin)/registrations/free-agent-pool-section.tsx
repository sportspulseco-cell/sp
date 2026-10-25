"use client";

import { FreeAgentPoolPanel, type FreeAgentPoolApi } from "@sportspulse/admin-pages";
import { registrationV2Admin } from "@/lib/api/browser-api";

/**
 * Free-agent pool on the admin console's Registrations page (CAP-10).
 * Same shared panel as the org console; league admins signed in here see
 * only their seasons (scoped by the API).
 */
export function FreeAgentPoolSection() {
  return <FreeAgentPoolPanel api={registrationV2Admin as FreeAgentPoolApi} />;
}
