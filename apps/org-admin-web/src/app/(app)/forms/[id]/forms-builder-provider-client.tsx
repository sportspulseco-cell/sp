"use client";

import type { ReactNode } from "react";
import { FormsBuilderProvider } from "@sportspulse/forms-builder";
import {
  leagueMgmt,
  registration,
  registrationV2
} from "@/lib/api/browser-api";

/**
 * Org-admin's binding of the shared forms-builder context.
 *
 * Mirrors sa-web's wrapper but uses org-admin's browser-api session.
 * Today these namespaces target super-admin-guarded endpoints, so
 * mutations called from inside the org-admin form-builder UI will
 * 403 until the proxy/relax work in doc/bug-043-followup.md lands.
 */
export function FormsBuilderProviderClient({
  children
}: {
  children: ReactNode;
}) {
  return (
    <FormsBuilderProvider
      api={{ registration, registrationV2, leagueMgmt }}
    >
      {children}
    </FormsBuilderProvider>
  );
}
