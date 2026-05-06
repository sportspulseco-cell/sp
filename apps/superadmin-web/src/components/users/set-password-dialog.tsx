"use client";

import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { iam } from "@/lib/api/browser-api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";

export function SetPasswordDialog({
  open,
  onClose,
  userId,
  email
}: {
  open: boolean;
  onClose: () => void;
  userId: string;
  email: string | null;
}) {
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFlash(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setSubmitting(true);
    try {
      await iam.setUserPassword(userId, password);
      setFlash(
        `Password updated. Share it with ${email ?? "the user"} via a secure channel.`
      );
      setPassword("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Set password"
      description="Force-set this user's password. Use when they're locked out and need credentials before a magic-link round-trip is possible."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="New password" hint="Min 8 characters.">
          <Input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="e.g. Welcome2026!"
            autoComplete="new-password"
          />
        </Field>
        {error && (
          <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}
        {flash && (
          <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
            {flash}
          </p>
        )}
        <DialogActions>
          <Button type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Updating…
              </>
            ) : (
              "Set password"
            )}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
