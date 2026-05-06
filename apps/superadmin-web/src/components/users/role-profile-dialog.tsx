"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  ROLE_PROFILE_SCHEMAS,
  SYSTEM_ROLE_BY_CODE,
  type AnswerMap
} from "@sportspulse/kernel";
import { iam } from "@/lib/api/browser-api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { FormRenderer } from "@/components/forms/form-renderer";

/**
 * Role-specific profile editor.
 *
 * One user, one form. The caller resolves the user's *current type*
 * (= what the Type column shows: "super_admin" if isSuperAdmin, else
 * the highest-rank active role) and passes it as `userType`. We render
 * the matching `ROLE_PROFILE_SCHEMAS` entry — no tabs, no guessing.
 *
 * Earlier this component opened with tabs and a "player" fallback,
 * which surfaced the wrong form for super-admins (and for any user
 * whose primary role wasn't player). Per repo owner, 2026-05-09:
 * "Whatever the usertype is, we need that profile form."
 *
 * Persists to `profiles.metadata.roleProfile.<userType>`. A user
 * holding multiple roles can edit each profile by switching their
 * Type via the user-type dropdown — keeps this dialog single-purpose.
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
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  // Load saved answers whenever the dialog opens or the user type
  // changes (e.g. admin switched the user's type then reopened).
  useEffect(() => {
    if (!open || !userType) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    iam
      .getRoleProfile(userId, userType)
      .then((res) => {
        if (cancelled) return;
        setAnswers(res.data ?? {});
      })
      .catch((e) => {
        if (cancelled) return;
        setAnswers({});
        setError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, userType, userId]);

  async function save() {
    if (!userType) return;
    setSaving(true);
    setFlash(null);
    setError(null);
    try {
      await iam.setRoleProfile(userId, {
        roleCode: userType,
        data: answers
      });
      setFlash("Saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const roleDef = userType ? SYSTEM_ROLE_BY_CODE[userType] : undefined;
  const definition = userType
    ? ROLE_PROFILE_SCHEMAS[userType] ?? {
        schemaVersion: 1 as const,
        questions: []
      }
    : { schemaVersion: 1 as const, questions: [] };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={
        roleDef
          ? `Edit profile · ${roleDef.name}`
          : "Edit profile"
      }
      description={
        userType
          ? `Profile fields for the ${roleDef?.name ?? userType} role. Stored under profiles.metadata.roleProfile.${userType}.`
          : "User has no role assigned yet — assign a type from the user row first."
      }
      size="lg"
    >
      {!userType ? (
        <p className="rounded-md border border-dashed border-border bg-bg-subtle px-3 py-6 text-center text-[13px] text-fg-muted">
          Assign a user type before editing the profile.
        </p>
      ) : loading ? (
        <div className="flex items-center gap-2 py-6 text-[13px] text-fg-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading saved values…
        </div>
      ) : (
        <div className="space-y-4">
          {definition.questions.length === 0 ? (
            <p className="rounded-md border border-dashed border-border bg-bg-subtle px-3 py-6 text-center text-[13px] text-fg-muted">
              No profile fields are defined for the{" "}
              <span className="font-mono">{userType}</span> role yet.
            </p>
          ) : (
            <FormRenderer
              key={userType}
              definition={definition}
              initialAnswers={answers}
              onChange={setAnswers}
            />
          )}

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
            <Button
              onClick={save}
              disabled={saving || definition.questions.length === 0}
            >
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
