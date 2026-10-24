"use client";

import { useState } from "react";
import type { Org } from "@/lib/api/types";
import { ChooseOrgAdmin, CreateOrgForm } from "./create-org-button";

/**
 * Org setup step 1, super admin only: create an organisation in place,
 * then choose its org admin, then continue the wizard with it selected.
 */
export function NewOrgInline({
  onCreated,
  onCancel
}: {
  onCreated: (org: Org) => void;
  onCancel: () => void;
}) {
  const [created, setCreated] = useState<Org | null>(null);
  return (
    <div className="space-y-3 rounded-xl border border-accent/40 bg-surface-1 p-5">
      <p className="text-[14px] font-semibold tracking-tight text-fg">
        {created ? "Choose the org admin" : "New organisation"}
      </p>
      {created ? (
        <ChooseOrgAdmin
          org={created}
          doneLabel="Continue with this organisation"
          onDone={() => onCreated(created)}
        />
      ) : (
        <CreateOrgForm onCreated={setCreated} onCancel={onCancel} />
      )}
    </div>
  );
}
