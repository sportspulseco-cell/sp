"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil } from "lucide-react";
import { RoleProfileFields, useRoleProfile } from "@sportspulse/registration-funnel";
import { iam } from "@/lib/api/browser-api";
import type { Profile } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";

/**
 * Edit user profile: the display details every user has, plus the
 * profile fields of the user's type (the same fields Invite user →
 * "Set up profile" collects, e.g. date of birth, USA Hockey ID and
 * emergency contact for a player). `profileRole` is the user's primary
 * type as the Type column shows it (super admin flag first, then the
 * highest-ranked active role), so a coach or super admin never gets the
 * player form. One Save writes both.
 */
export function EditUserButton({
  user,
  profileRole
}: {
  user: Profile;
  profileRole: { code: string; name: string } | null;
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
  const roleProfile = useRoleProfile(
    {
      getRoleProfile: (id, code) => iam.getRoleProfile(id, code),
      getRoleProfileForm: (code) => iam.getRoleProfileForm(code),
      setRoleProfile: (id, body) => iam.setRoleProfile(id, body)
    },
    user.id,
    profileRole?.code ?? null,
    open
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    setError(null);
    const usesRoleProfile = !!profileRole && roleProfile.hasFields && !roleProfile.loadError;
    if (usesRoleProfile && Object.keys(roleProfile.errors).length > 0) return;
    setLoading(true);
    try {
      await iam.updateUser(user.id, {
        displayName: form.displayName || null,
        preferredName: form.preferredName || null,
        locale: form.locale,
        timezone: form.timezone
      });
      if (usesRoleProfile) await roleProfile.save();
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
        description="Display details, locale and the profile fields for this user's type. Email + sign-in are managed by Supabase Auth."
        size="lg"
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Display name" htmlFor="eu-display">
            <Input
              id="eu-display"
              value={form.displayName}
              onChange={(e) =>
                setForm({ ...form, displayName: e.target.value })
              }
              placeholder="What you show across the platform"
            />
          </Field>
          <Field label="Preferred name" htmlFor="eu-preferred">
            <Input
              id="eu-preferred"
              value={form.preferredName}
              onChange={(e) =>
                setForm({ ...form, preferredName: e.target.value })
              }
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
                onChange={(e) =>
                  setForm({ ...form, timezone: e.target.value })
                }
                placeholder="America/New_York"
              />
            </Field>
          </div>

          <div className="space-y-3 border-t border-border pt-4">
            <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
              // {profileRole ? `${profileRole.name} profile` : "Role profile"}
            </p>
            {profileRole ? (
              <RoleProfileFields
                state={roleProfile}
                roleCode={profileRole.code}
                showErrors={tried}
              />
            ) : (
              <p className="rounded-md border border-dashed border-border bg-bg-subtle px-3 py-4 text-center text-[13px] text-fg-muted">
                This user has no role yet. Assign one below to edit its profile fields.
              </p>
            )}
          </div>

          {error ? (
            <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
              {error}
            </p>
          ) : null}

          <DialogActions>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || roleProfile.loading}>
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
