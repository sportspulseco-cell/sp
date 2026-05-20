"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { SetPasswordDialog } from "./set-password-dialog";

/**
 * Trigger button for the existing SetPasswordDialog, surfaced next to
 * "Edit profile" / "Suspend" on the user detail page. Reuses the same
 * dialog the kebab menu on /users uses — no duplication.
 */
export function SetPasswordButton({
  userId,
  email
}: {
  userId: string;
  email: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-1 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-fg-muted transition-colors duration-fast ease-ease hover:border-border-strong hover:text-fg"
      >
        <KeyRound className="h-3 w-3" strokeWidth={1.75} />
        Set password
      </button>
      <SetPasswordDialog
        open={open}
        onClose={() => setOpen(false)}
        userId={userId}
        email={email}
      />
    </>
  );
}
