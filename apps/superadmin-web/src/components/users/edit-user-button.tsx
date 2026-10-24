"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil } from "lucide-react";
import {
  RoleProfileFields,
  useRoleProfile,
  type RoleProfileState
} from "@sportspulse/registration-funnel";
import { iam } from "@/lib/api/browser-api";
import type { Profile } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";

const transport = {
  getRoleProfile: (id: string, code: string) => iam.getRoleProfile(id, code),
  getRoleProfileForm: (code: string) => iam.getRoleProfileForm(code),
  setRoleProfile: (id: string, body: Parameters<typeof iam.setRoleProfile>[1]) =>
    iam.setRoleProfile(id, body),
  uploadImage: (id: string, body: { contentType: string; dataBase64: string }) =>
    iam.uploadAvatar(id, body)
};

/**
 * Edit user profile: the display details every user has, plus one
 * profile section per role the user holds (the same fields Invite user →
 * "Set up profile" collects: date of birth, USA Hockey ID, emergency
 * contact for a player; phone and experience for a captain; …).
 * `profileRoles` is ordered primary-first by the same rule as the Type
 * column, so a coach or super admin never lands on the player form, and
 * a player who is also a captain sees both. One Save writes everything.
 */
export function EditUserButton({
  user,
  profileRoles
}: {
  user: Profile;
  profileRoles: Array<{ code: string; name: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    displayName: user.displayName ?? "",
    preferredName: user.preferredName ?? "",
    locale: user.locale ?? "en-US",
    timezone: user.timezone ?? "UTC"
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  // Live state of each role section, filled by the sections themselves.
  const sections = useRef(new Map<string, RoleProfileState>());
  const [anyLoading, setAnyLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    setError(null);
    const editable = profileRoles
      .map((r) => sections.current.get(r.code))
      .filter((s): s is RoleProfileState => !!s && s.hasFields && !s.loadError);
    if (editable.some((s) => Object.keys(s.errors).length > 0)) return;
    setLoading(true);
    try {
      await iam.updateUser(user.id, {
        displayName: form.displayName || null,
        preferredName: form.preferredName || null,
        locale: form.locale,
        timezone: form.timezone
      });
      for (const s of editable) await s.save();
      setOpen(false);
      setTried(false);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-1 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-fg-muted transition-colors duration-fast ease-ease hover:border-border-strong hover:text-fg"
      >
        <Pencil className="h-3 w-3" strokeWidth={1.75} />
        Edit profile
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Edit user profile"
        description="Display details, locale and the profile fields for each of this user's roles. Email + sign-in are managed by Supabase Auth."
        size="lg"
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Display name" htmlFor="eu-display">
            <Input
              id="eu-display"
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              placeholder="What you show across the platform"
            />
          </Field>
          <Field label="Preferred name" htmlFor="eu-preferred">
            <Input
              id="eu-preferred"
              value={form.preferredName}
              onChange={(e) => setForm({ ...form, preferredName: e.target.value })}
              placeholder="Goes-by name"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Locale" htmlFor="eu-locale">
              <Input
                id="eu-locale"
                value={form.locale}
                onChange={(e) => setForm({ ...form, locale: e.target.value })}
                placeholder="en-US"
              />
            </Field>
            <Field label="Timezone" htmlFor="eu-tz">
              <Input
                id="eu-tz"
                value={form.timezone}
                onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                placeholder="America/New_York"
              />
            </Field>
          </div>

          {profileRoles.length === 0 ? (
            <div className="space-y-3 border-t border-border pt-4">
              <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">// Role profile</p>
              <p className="rounded-md border border-dashed border-border bg-bg-subtle px-3 py-4 text-center text-[13px] text-fg-muted">
                This user has no role yet. Assign one below to edit its profile fields.
              </p>
            </div>
          ) : (
            profileRoles.map((r) => (
              <RoleSection
                key={r.code}
                userId={user.id}
                role={r}
                open={open}
                showErrors={tried}
                onState={(s) => {
                  sections.current.set(r.code, s);
                  const busy = [...sections.current.values()].some((x) => x.loading);
                  setAnyLoading((prev) => (prev === busy ? prev : busy));
                }}
              />
            ))
          )}

          {error ? (
            <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
              {error}
            </p>
          ) : null}

          <DialogActions>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || anyLoading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
                </>
              ) : (
                "Save changes"
              )}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </>
  );
}

/** One role's profile fields; reports its live state to the dialog. */
function RoleSection({
  userId,
  role,
  open,
  showErrors,
  onState
}: {
  userId: string;
  role: { code: string; name: string };
  open: boolean;
  showErrors: boolean;
  onState: (s: RoleProfileState) => void;
}) {
  const state = useRoleProfile(transport, userId, role.code, open);
  useEffect(() => {
    onState(state);
  });
  // A role with no profile questions (e.g. spectator) adds nothing.
  if (!state.loading && !state.loadError && !state.hasFields) return null;
  return (
    <div className="space-y-3 border-t border-border pt-4">
      <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">// {role.name} profile</p>
      <RoleProfileFields state={state} roleCode={role.code} showErrors={showErrors} />
    </div>
  );
}
