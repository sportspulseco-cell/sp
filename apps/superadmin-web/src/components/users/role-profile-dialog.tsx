"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  ROLE_PROFILE_SCHEMAS,
  SYSTEM_ROLE_BY_CODE,
  type AnswerMap
} from "@sportspulse/kernel";
import { iam } from "@/lib/api/browser-api";
import type { RoleAssignment } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { FormRenderer } from "@/components/forms/form-renderer";

/**
 * Role-specific profile editor.
 *
 * Loads the user's active role assignments → builds a tab strip across
 * the roles they actually hold → for each, renders the FormDefinition
 * from `ROLE_PROFILE_SCHEMAS` via <FormRenderer>. Persists to
 * profiles.metadata.roleProfile.<code>.
 *
 * If the user holds zero scoped roles, falls back to "player" — the
 * sane default for a registered user that hasn't been promoted yet.
 */
export function RoleProfileDialog({
  open,
  onClose,
  userId
}: {
  open: boolean;
  onClose: () => void;
  userId: string;
}) {
  const [assignments, setAssignments] = useState<RoleAssignment[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeRole, setActiveRole] = useState<string>("");
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    if (!open || assignments !== null) return;
    setLoading(true);
    setError(null);
    iam
      .activeRolesForUser(userId)
      .then((rows) => {
        setAssignments(rows);
        const codes = uniqueRoleCodes(rows);
        setActiveRole(codes[0] ?? "player");
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [open, assignments, userId]);

  // Whenever the active role tab changes, fetch its saved answers.
  useEffect(() => {
    if (!open || !activeRole) return;
    let cancelled = false;
    iam
      .getRoleProfile(userId, activeRole)
      .then((res) => {
        if (cancelled) return;
        setAnswers(res.data ?? {});
      })
      .catch(() => {
        if (!cancelled) setAnswers({});
      });
    return () => {
      cancelled = true;
    };
  }, [open, activeRole, userId]);

  async function save() {
    setSaving(true);
    setFlash(null);
    setError(null);
    try {
      await iam.setRoleProfile(userId, {
        roleCode: activeRole,
        data: answers
      });
      setFlash("Saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const tabs = uniqueRoleCodes(assignments ?? []);
  const definition = ROLE_PROFILE_SCHEMAS[activeRole] ?? {
    schemaVersion: 1,
    questions: []
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Edit role profile"
      description="Fields differ by role. A user holding multiple roles fills out each independently — switch tabs above. Stored under profiles.metadata.roleProfile."
      size="lg"
    >
      {loading && (
        <div className="flex items-center gap-2 py-6 text-[13px] text-fg-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
        </div>
      )}
      {error && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
      {!loading && assignments !== null && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {(tabs.length ? tabs : ["player"]).map((code) => {
              const on = code === activeRole;
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => setActiveRole(code)}
                  className={
                    on
                      ? "inline-flex items-center gap-1.5 rounded-full bg-fg px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-bg"
                      : "inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-1 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-fg-muted hover:border-fg-muted hover:text-fg"
                  }
                >
                  {code}
                  {SYSTEM_ROLE_BY_CODE[code]?.name && (
                    <span className="font-sans text-[11px] normal-case">
                      · {SYSTEM_ROLE_BY_CODE[code]!.name}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {definition.questions.length === 0 ? (
            <p className="rounded-md border border-dashed border-border bg-bg-subtle px-3 py-4 text-center text-[13px] text-fg-muted">
              No extra fields configured for the <span className="font-mono">{activeRole}</span> role.
            </p>
          ) : (
            <FormRenderer
              key={activeRole}
              definition={definition}
              initialAnswers={answers}
              onChange={setAnswers}
            />
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

function uniqueRoleCodes(rows: RoleAssignment[]): string[] {
  const codes = rows
    .filter((r) => !r.revokedAt && r.role?.code)
    .map((r) => r.role!.code);
  return Array.from(new Set(codes));
}
