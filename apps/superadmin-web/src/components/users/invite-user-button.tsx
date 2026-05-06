"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail, Plus } from "lucide-react";
import {
  SYSTEM_ROLE_BY_CODE,
  SYSTEM_ROLE_CODES,
  type ScopeType
} from "@sportspulse/kernel";
import { iam } from "@/lib/api/browser-api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ResourcePicker } from "@/components/resources/resource-picker";

/**
 * Global "Invite user" entry on /users.
 *
 * Reuses iam.inviteUser — the same invite endpoint that the
 * <RoleAssignmentPanel> uses on every hierarchical detail page. The
 * difference is just the prompt: here the admin can also pick the role
 * scope; in the panel that's already locked to the parent resource.
 */
export function InviteUserButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [grantRole, setGrantRole] = useState(false);
  const [roleCode, setRoleCode] = useState<string>("org_admin");
  const [scopeType, setScopeType] = useState<ScopeType>("org");
  const [scopeId, setScopeId] = useState("");
  const [setPwd, setSetPwd] = useState(false);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const roleDef = SYSTEM_ROLE_BY_CODE[roleCode];
  // When the chosen role has a default scopeType, snap to it.
  function pickRole(code: string) {
    setRoleCode(code);
    const def = SYSTEM_ROLE_BY_CODE[code];
    if (def) {
      setScopeType(def.scopeType);
      setScopeId("");
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setFlash(null);
    try {
      if (setPwd && password.length < 8) {
        throw new Error("Password must be at least 8 characters.");
      }
      const result = await iam.inviteUser({
        email: email.trim(),
        displayName: displayName.trim() || undefined,
        password: setPwd ? password : undefined,
        role: grantRole
          ? {
              roleCode,
              scopeType,
              scopeId:
                scopeType === "platform" ? undefined : scopeId || undefined
            }
          : undefined
      });
      setFlash(
        result.created
          ? setPwd
            ? `Account created for ${result.email} with the password you set. Share the credentials directly.`
            : `Invite sent to ${result.email}.`
          : `${result.email} already had an account; ${grantRole ? "role granted." : "no changes."}`
      );
      setEmail("");
      setDisplayName("");
      setPassword("");
      setSetPwd(false);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="mr-2 h-4 w-4" />
        Invite user
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Invite user"
        description="Sends a Supabase magic-link invite. If the email already has an account, the role grant (if selected) is added immediately."
        size="lg"
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Email">
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="captain@example.com"
              />
            </Field>
            <Field label="Display name (optional)">
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Sasha Velasquez"
              />
            </Field>
          </div>

          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-bg-subtle px-3 py-2 text-[13px] text-fg">
            <input
              type="checkbox"
              checked={setPwd}
              onChange={(e) => setSetPwd(e.target.checked)}
              className="h-3.5 w-3.5 accent-accent"
            />
            <span>
              <span className="font-medium">
                Also set initial credentials.
              </span>{" "}
              <span className="text-fg-muted">
                Account is auto-confirmed; you share the password directly
                instead of sending a magic-link email.
              </span>
            </span>
          </label>

          {setPwd && (
            <Field
              label="Initial password"
              hint="Min 8 chars. The user can change it after first sign-in."
            >
              <Input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="e.g. Welcome2026!"
                autoComplete="new-password"
              />
            </Field>
          )}

          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-bg-subtle px-3 py-2 text-[13px] text-fg">
            <input
              type="checkbox"
              checked={grantRole}
              onChange={(e) => setGrantRole(e.target.checked)}
              className="h-3.5 w-3.5 accent-accent"
            />
            <span>
              <span className="font-medium">Also grant a role on invite.</span>{" "}
              <span className="text-fg-muted">
                Otherwise the user signs in with no permissions.
              </span>
            </span>
          </label>

          {grantRole && (
            <div className="grid gap-3 sm:grid-cols-2 rounded-md border border-border bg-bg-subtle p-3">
              <Field label="Role" hint={roleDef?.description ?? "—"}>
                <Select
                  value={roleCode}
                  onChange={(e) => pickRole(e.target.value)}
                >
                  {SYSTEM_ROLE_CODES.map((code) => (
                    <option key={code} value={code}>
                      {code}
                      {SYSTEM_ROLE_BY_CODE[code]?.name
                        ? ` — ${SYSTEM_ROLE_BY_CODE[code]!.name}`
                        : ""}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Scope type">
                <Select
                  value={scopeType}
                  onChange={(e) => {
                    setScopeType(e.target.value as ScopeType);
                    setScopeId("");
                  }}
                >
                  {(["platform", "org", "league", "season", "division", "team"] as ScopeType[]).map(
                    (s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    )
                  )}
                </Select>
              </Field>
              {scopeType !== "platform" && scopeType !== "game" && (
                <Field
                  label={`Pick ${scopeType === "org" ? "organization" : scopeType}`}
                  hint={`Searchable picker — type to filter the list of ${scopeType}s.`}
                >
                  <ResourcePicker
                    scopeType={scopeType}
                    value={scopeId}
                    onChange={setScopeId}
                  />
                </Field>
              )}
              {scopeType === "game" && (
                <Field label="Game id" hint="Game pickers come from the game detail page.">
                  <Input
                    value={scopeId}
                    onChange={(e) => setScopeId(e.target.value)}
                    placeholder="uuid…"
                  />
                </Field>
              )}
            </div>
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
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button
              type="submit"
              disabled={submitting || email.trim().length === 0}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…
                </>
              ) : (
                <>
                  <Mail className="mr-2 h-4 w-4" /> Send invite
                </>
              )}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </>
  );
}
