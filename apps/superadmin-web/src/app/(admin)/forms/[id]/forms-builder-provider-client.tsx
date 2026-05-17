"use client";

import type { ReactNode } from "react";
import { FormsBuilderProvider } from "@sportspulse/forms-builder";
import {
  leagueMgmt,
  registration,
  registrationV2
} from "@/lib/api/browser-api";

/**
 * Tiny client wrapper that binds sa-web's auth-aware browser SDK
 * namespaces into the shared forms-builder context. Mounted by
 * /forms/[id]/page.tsx (a server component); everything inside this
 * tree can call useFormsBuilderApi() to get a configured SDK.
 *
 * Org-admin-web mounts an equivalent wrapper from its own browser-api
 * (BUG-043 follow-up) — same shared package, different SDK binding.
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
