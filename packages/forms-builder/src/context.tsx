"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { createApi } from "@sportspulse/api-client";

type Api = ReturnType<typeof createApi>;

/**
 * Subset of the SDK namespaces the forms-builder uses. Each consumer
 * app provides its own configured instances (with auth-bound fetch) so
 * mutations go through the right session.
 */
export interface FormsBuilderApi {
  registration: Api["registration"];
  registrationV2: Api["registrationV2"];
  leagueMgmt: Api["leagueMgmt"];
}

const Ctx = createContext<FormsBuilderApi | null>(null);

export function FormsBuilderProvider({
  api,
  children
}: {
  api: FormsBuilderApi;
  children: ReactNode;
}) {
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useFormsBuilderApi(): FormsBuilderApi {
  const v = useContext(Ctx);
  if (!v) {
    throw new Error(
      "useFormsBuilderApi() called outside <FormsBuilderProvider>. " +
        "Each app must wrap its /forms/[id] route in FormsBuilderProvider " +
        "with its own SDK bindings."
    );
  }
  return v;
}
