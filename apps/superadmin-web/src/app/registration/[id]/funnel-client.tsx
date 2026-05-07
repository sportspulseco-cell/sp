"use client";

import {
  RegistrationFunnel,
  createPublicRegistration,
  type PublicSeasonContext
} from "@sportspulse/registration-funnel";

/**
 * Client-side wrapper around `<RegistrationFunnel>`. Binds the
 * anonymous public-registration SDK to NEXT_PUBLIC_API_URL so the
 * package itself stays env-free (it ships with no `process.env`
 * reads of its own).
 */
export function FunnelClient({ context }: { context: PublicSeasonContext }) {
  const api = createPublicRegistration(
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api"
  );
  return <RegistrationFunnel context={context} api={api} />;
}
