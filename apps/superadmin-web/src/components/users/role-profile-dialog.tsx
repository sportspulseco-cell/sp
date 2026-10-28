"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { SYSTEM_ROLE_BY_CODE } from "@sportspulse/kernel";
import { RoleProfileFields, useRoleProfile } from "@sportspulse/registration-funnel";
import { iam } from "@/lib/api/browser-api";
import { Button, Dialog, DialogActions, Alert } from "@sportspulse/ui";

/**
 * Role-specific profile editor.
 *
 * One user, one form. The caller resolves the user's *current type*
 * (= what the Type column shows: "super_admin" if isSuperAdmin, else
 * the highest-rank active role) and passes it as `userType`. We render
 * that role's profile form — no tabs, no guessing.
 *
 * Earlier this component opened with tabs and a "player" fallback,
 * which surfaced the wrong form for super-admins (and for any user
 * whose primary role wasn't player). Per repo owner, 2026-05-09:
 * "Whatever the usertype is, we need that profile form."
 *
 * Loading, validation and saving come from the shared useRoleProfile
 * (@sportspulse/registration-funnel), the same one the Edit user
 * profile dialog and the player app's Profile page use.
 */
export function RoleProfileDialog({
  open,
  onClose,
  userId,
  userType
}: {
  open: boolean;
  onClose: () => void;
  userId: string;
  /**
   * The single role code whose profile fields render in this dialog.
   * Must be one of the canonical role codes from
   * `@sportspulse/kernel` SYSTEM_ROLE_BY_CODE — typically "super_admin"
   * for platform admins, otherwise the user's highest-ranked active
   * role (org_admin / league_admin / player / etc.).
   */
  userType: string;
}) {
  const state = useRoleProfile(
    {
      getRoleProfile: (id, code) => iam.getRoleProfile(id, code),
      getRoleProfileForm: (code) => iam.getRoleProfileForm(code),
      setRoleProfile: (id, body) => iam.setRoleProfile(id, body),
      uploadImage: (id, body) => iam.uploadAvatar(id, body)
    },
    userId,
    userType || null,
    open
  );
  const [saving, setSaving] = useState(false);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  async function save() {
    if (!userType) return;
    setTried(true);
    setFlash(null);
    setError(null);
    if (Object.keys(state.errors).length > 0) return;
    setSaving(true);
    try {
      await state.save();
      setFlash("Saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const roleDef = userType ? SYSTEM_ROLE_BY_CODE[userType] : undefined;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={roleDef ? `Edit profile · ${roleDef.name}` : "Edit profile"}
      description={
        userType
          ? `Profile fields for the ${roleDef?.name ?? userType} role. Stored under profiles.metadata.roleProfile.${userType}.`
          : "User has no role assigned yet. Assign a type from the user row first."
      }
      size="lg"
    >
      {!userType ? (
        <p className="rounded-md border border-dashed border-border bg-bg-subtle px-3 py-6 text-center text-[13px] text-fg-muted">
          Assign a user type before editing the profile.
        </p>
      ) : (
        <div className="space-y-4">
          {!state.loading ? (
            <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
              schema source ·{" "}
              {state.source === "admin"
                ? "admin-configured form"
                : "kernel default (admin can override via the registration setup wizard)"}
            </p>
          ) : null}
          <RoleProfileFields state={state} roleCode={userType} showErrors={tried} />

          {error && (
            <Alert tone="error">
              {error}
            </Alert>
          )}
          {flash && (
            <Alert tone="success" role="status">
              {flash}
            </Alert>
          )}

          <DialogActions>
            <Button type="button" variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button onClick={save} disabled={saving || state.loading || !state.hasFields}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
                </>
              ) : (
                "Save profile"
              )}
            </Button>
          </DialogActions>
        </div>
      )}
    </Dialog>
  );
}
