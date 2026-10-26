"use client";

import { Button } from "@sportspulse/ui";
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
      <Button
        type="button"
        onClick={() => setOpen(true)}
        variant="outline"
        size="sm"
        className="gap-1.5"
      >
        <KeyRound className="h-3 w-3" strokeWidth={1.75} />
        Set password
      </Button>
      <SetPasswordDialog
        open={open}
        onClose={() => setOpen(false)}
        userId={userId}
        email={email}
      />
    </>
  );
}
