"use client";

import {
  RegistrationFunnel,
  createPublicRegistration,
  type PublicSeasonContext
} from "@sportspulse/registration-funnel";

export function FunnelClient({
  context,
  inviteToken = null
}: {
  context: PublicSeasonContext;
  /** ?invite=<token>: the captain invite the player followed (FR-3.4.1). */
  inviteToken?: string | null;
}) {
  const api = createPublicRegistration(
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api"
  );
  return <RegistrationFunnel context={context} api={api} inviteToken={inviteToken} />;
}
