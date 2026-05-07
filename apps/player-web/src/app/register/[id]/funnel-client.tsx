"use client";

import {
  RegistrationFunnel,
  createPublicRegistration,
  type PublicSeasonContext
} from "@sportspulse/registration-funnel";

export function FunnelClient({ context }: { context: PublicSeasonContext }) {
  const api = createPublicRegistration(
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api"
  );
  return <RegistrationFunnel context={context} api={api} />;
}
