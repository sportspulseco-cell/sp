"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2, Mail, Plus } from "lucide-react";
import {
  ROLE_PROFILE_SCHEMAS,
  SYSTEM_ROLE_BY_CODE,
  SYSTEM_ROLE_CODES,
  type AnswerMap,
  type ScopeType
} from "@sportspulse/kernel";
import { iam } from "@/lib/api/browser-api";
import { FormRenderer } from "@sportspulse/registration-funnel";
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
  // Phase 1.5 — also fill the role-profile fields right here, no
  // round-trip to the user detail page. Shown only when grantRole is
  // on; renders ROLE_PROFILE_SCHEMAS[roleCode] inline.
  const [setupProfile, setSetupProfile] = useState(false);
  const [profileAnswers, setProfileAnswers] = useState<AnswerMap>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  // Rendered invite message returned by the API; copied to clipboard on
  // success and shown in a textarea so the admin can review / re-copy.
  const [renderedMessage, setRenderedMessage] = useState<{
    subject: string;
    body: string;
    recipient: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const roleDef = SYSTEM_ROLE_BY_CODE[roleCode];
  const profileSchema = ROLE_PROFILE_SCHEMAS[roleCode];
  const profileHasFields = (profileSchema?.questions.length ?? 0) > 0;
  // When the chosen role has a default scopeType, snap to it. Reset
  // profile answers so coach-tab answers don't bleed into a player
  // form when the admin switches roles mid-edit.
  function pickRole(code: string) {
    setRoleCode(code);
    setProfileAnswers({});
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
      // Profile setup in the same flow — only when admin opted in AND
      // a role is being granted (the schema is keyed by role code).
      // Failure here doesn't roll back the invite; we surface the
      // error so the admin can retry from the user detail page.
      if (grantRole && setupProfile && profileHasFields) {
        try {
          await iam.setRoleProfile(result.userId, {
            roleCode,
            data: profileAnswers
          });
        } catch (e) {
          setError(
            `User invited but profile save failed: ${(e as Error).message}. Edit profile from /users when ready.`
          );
        }
      }
      setRenderedMessage(result.message);
      // Auto-copy on success so the admin can paste into Slack/WhatsApp
      // immediately without an extra click. Falls back gracefully if
      // navigator.clipboard isn't available (older browsers / iframes).
      const clipboardCopied = await copyToClipboard(formatForClipboard(result.message));
      setCopied(clipboardCopied);
      setFlash(
        result.created
          ? setPwd
            ? `Account created for ${result.email}. Invite message ${clipboardCopied ? "copied to clipboard" : "ready below"} — share the credentials directly.`
            : `Invite sent to ${result.email}. Message ${clipboardCopied ? "copied to clipboard" : "ready below"} for manual delivery too.`
          : `${result.email} already had an account; ${grantRole ? "role granted." : "no changes."} Message ${clipboardCopied ? "copied to clipboard" : "ready below"}.`
      );
      setEmail("");
      setDisplayName("");
      setPassword("");
      setSetPwd(false);
      setSetupProfile(false);
      setProfileAnswers({});
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
              <div className="sm:col-span-2 space-y-3">
                <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border bg-surface-1 px-3 py-2 text-[13px] text-fg">
                  <input
                    type="checkbox"
                    checked={setupProfile}
                    onChange={(e) => setSetupProfile(e.target.checked)}
                    disabled={!profileHasFields}
                    className="mt-0.5 h-3.5 w-3.5 accent-accent"
                  />
                  <span>
                    <span className="font-medium">
                      Also set up the {roleDef?.name ?? roleCode} profile now.
                    </span>{" "}
                    <span className="text-fg-muted">
                      {profileHasFields
                        ? "Saves you a round-trip. Skip if the user will fill it out themselves."
                        : `No profile fields are defined for the ${roleCode} role.`}
                    </span>
                  </span>
                </label>

                {setupProfile && profileHasFields && profileSchema && (
                  <div className="rounded-md border border-border bg-bg-subtle p-4">
                    <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                      // {roleDef?.name ?? roleCode} profile
                    </p>
                    <FormRenderer
                      key={roleCode}
                      definition={profileSchema}
                      initialAnswers={profileAnswers}
                      onChange={setProfileAnswers}
                    />
                  </div>
                )}
              </div>
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

          {renderedMessage && (
            <div className="space-y-2 rounded-md border border-border bg-bg-subtle p-3">
              <div className="flex items-center justify-between">
                <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                  // Invite message · {renderedMessage.recipient}
                </p>
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await copyToClipboard(
                      formatForClipboard(renderedMessage)
                    );
                    setCopied(ok);
                  }}
                  className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-surface-1 px-2.5 font-mono text-[10px] uppercase tracking-widest text-fg-muted transition-colors hover:border-fg-muted hover:text-fg"
                >
                  {copied ? (
                    <>
                      <Check className="h-3 w-3" strokeWidth={2} /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" strokeWidth={2} /> Copy again
                    </>
                  )}
                </button>
              </div>
              <p className="text-[12px] font-medium text-fg">
                Subject: {renderedMessage.subject}
              </p>
              <textarea
                readOnly
                value={renderedMessage.body}
                rows={Math.min(14, renderedMessage.body.split("\n").length + 1)}
                className="w-full resize-y rounded-md border border-border bg-surface-1 p-2 font-mono text-[11px] leading-relaxed text-fg focus-visible:border-accent focus-visible:outline-none focus-visible:shadow-focus"
              />
              <p className="text-[11px] text-fg-muted">
                Email delivery via Resend lands in a follow-up. For now,
                paste the message into Slack / WhatsApp / SMS — content is
                already on your clipboard.
              </p>
            </div>
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

function formatForClipboard(m: {
  subject: string;
  body: string;
  recipient: string;
}): string {
  return [`To: ${m.recipient}`, `Subject: ${m.subject}`, "", m.body].join("\n");
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to legacy path
  }
  // Legacy fallback for non-secure contexts. Best-effort.
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
