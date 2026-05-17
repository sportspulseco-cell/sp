"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail, ShieldCheck, UserPlus, X } from "lucide-react";
import {
  SYSTEM_ROLE_BY_CODE,
  type ScopeType
} from "@sportspulse/kernel";
import { iam } from "@/lib/api/browser-api";
import type { Profile, RoleAssignment } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

/**
 * Reusable "manage admins for this resource" panel.
 *
 * Drops into every hierarchical detail page: organizations, leagues,
 * seasons, divisions, teams (and any future scoped resource). Source of
 * truth for role codes and scope types is `@sportspulse/kernel`.
 *
 * Two modes share the same submit pipeline:
 *   - "Existing user" — autocomplete on profiles, then `iam.assignRole`.
 *   - "Invite by email" — `iam.inviteUser` with role payload, server
 *     creates the auth user (idempotent) AND the role assignment.
 *
 * Intentionally has zero scope-specific logic — the parent passes in
 * `scopeType + scopeId + allowedRoleCodes` and we render the form.
 */
export function RoleAssignmentPanel({
  scopeType,
  scopeId,
  allowedRoleCodes,
  resourceLabel,
  initialAssignments
}: {
  scopeType: ScopeType;
  scopeId: string;
  /** Role codes assignable at this scope, e.g. ['org_admin'] for the org page. */
  allowedRoleCodes: string[];
  /** Human label for the resource — used in microcopy. e.g. "PPHL · Adult League". */
  resourceLabel: string;
  initialAssignments: RoleAssignment[];
}) {
  const router = useRouter();
  const [assignments, setAssignments] = useState(initialAssignments);
  const [mode, setMode] = useState<"existing" | "invite">("existing");
  const [roleCode, setRoleCode] = useState(allowedRoleCodes[0] ?? "");

  // Existing-user search
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  // Pre-filtered list of users who already hold this role somewhere.
  // Surfaces the common case ("re-assign an existing season_admin to
  // this season") without a search step. If the user can't be found
  // here, switch to All-users search or Invite-by-email.
  const [filterToRole, setFilterToRole] = useState(true);
  const [roleHolders, setRoleHolders] = useState<Profile[] | null>(null);
  const [loadingHolders, setLoadingHolders] = useState(false);

  // Invite-by-email
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  // Rendered invite message returned by the API after Invite-by-email
  // mode succeeds — same clipboard fallback as <InviteUserButton>.
  const [renderedMessage, setRenderedMessage] = useState<{
    subject: string;
    body: string;
    recipient: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Live search as the admin types. When `filterToRole` is on, the
  // search is constrained to users already holding the selected role —
  // matches the prompt "show me users who are already season_admin".
  useEffect(() => {
    if (mode !== "existing") return;
    if (search.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    iam
      .listUsers({
        search: search.trim(),
        limit: 8,
        roleCode: filterToRole ? roleCode : undefined
      })
      .then((p) => {
        if (cancelled) return;
        setResults(p.items);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [search, mode, filterToRole, roleCode]);

  // Whenever role / mode / filter toggles, refetch the pre-filtered
  // list of role-holders so the dropdown is populated even without a
  // search query. Cap at 50 — beyond that the admin should use search.
  useEffect(() => {
    if (mode !== "existing" || !filterToRole || !roleCode) {
      setRoleHolders(null);
      return;
    }
    let cancelled = false;
    setLoadingHolders(true);
    iam
      .listUsers({ roleCode, limit: 50 })
      .then((p) => {
        if (cancelled) return;
        setRoleHolders(p.items);
      })
      .catch(() => {
        if (!cancelled) setRoleHolders([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingHolders(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, filterToRole, roleCode]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setFlash(null);
    try {
      if (mode === "existing") {
        if (!selectedUser) throw new Error("Pick a user.");
        const role = await iam.listRoles({ search: roleCode, limit: 5 });
        const target = role.items.find((r) => r.code === roleCode);
        if (!target) throw new Error(`Role ${roleCode} not found in catalog.`);
        const created = await iam.assignRole({
          userId: selectedUser.id,
          roleId: target.id,
          scopeType,
          scopeId
        });
        setAssignments((a) => [created, ...a]);
        setFlash(
          `Assigned ${roleCode} to ${selectedUser.displayName ?? selectedUser.email ?? selectedUser.id.slice(0, 8)}.`
        );
        setSelectedUser(null);
        setSearch("");
      } else {
        if (!email.trim()) throw new Error("Enter an email.");
        const result = await iam.inviteUser({
          email: email.trim(),
          displayName: displayName.trim() || undefined,
          scopeLabel: resourceLabel,
          role: { roleCode, scopeType, scopeId }
        });
        if (result.assignment) {
          setAssignments((a) => [result.assignment as RoleAssignment, ...a]);
        }
        setRenderedMessage(result.message);
        const ok = await copyInviteToClipboard(result.message);
        setCopied(ok);
        setFlash(
          result.created
            ? `Invite sent to ${result.email}. Message ${ok ? "copied to clipboard" : "ready below"} — paste anywhere if email delivery is delayed.`
            : `${result.email} already had an account. Role assigned. Message ${ok ? "copied" : "ready below"}.`
        );
        setEmail("");
        setDisplayName("");
      }
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function onRevoke(id: string) {
    if (!confirm("Revoke this assignment?")) return;
    try {
      await iam.revokeAssignment(id);
      setAssignments((a) => a.filter((x) => x.id !== id));
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const submitDisabled =
    submitting ||
    !roleCode ||
    (mode === "existing" ? !selectedUser : email.trim().length === 0);

  return (
    <div className="space-y-5">
      {/* Existing assignments */}
      {assignments.length === 0 ? (
        <p className="rounded-md border border-dashed border-border bg-bg-subtle px-3 py-4 text-center text-[13px] text-fg-muted">
          No admins assigned to this {scopeType} yet — use the form below to
          add one.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border bg-surface-1">
          {assignments.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-3 px-3 py-2.5"
            >
              <ShieldCheck
                className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                strokeWidth={2}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-fg">
                  {a.userId.slice(0, 8)}
                  <span className="ml-2 font-mono text-[10px] uppercase tracking-wide text-fg-muted">
                    {a.role?.code ?? "—"}
                  </span>
                </p>
                <p className="text-[11px] text-fg-muted">
                  {a.role?.name ??
                    SYSTEM_ROLE_BY_CODE[a.role?.code ?? ""]?.name ??
                    "Custom role"}{" "}
                  · since {new Date(a.effectiveFrom).toLocaleDateString("en-CA")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onRevoke(a.id)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-rose-500"
                title="Revoke"
                aria-label="Revoke"
              >
                <X className="h-3.5 w-3.5" strokeWidth={1.75} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Mode toggle */}
      <div className="flex gap-1.5">
        <ModeChip
          icon={<UserPlus className="h-3 w-3" strokeWidth={2.25} />}
          active={mode === "existing"}
          onClick={() => setMode("existing")}
        >
          Assign existing user
        </ModeChip>
        <ModeChip
          icon={<Mail className="h-3 w-3" strokeWidth={2.25} />}
          active={mode === "invite"}
          onClick={() => setMode("invite")}
        >
          Invite by email
        </ModeChip>
      </div>

      <form onSubmit={onSubmit} className="space-y-3 rounded-md border border-border bg-bg-subtle p-4">
        <Field
          label="Role"
          hint={`Pick the role to grant on ${resourceLabel}.`}
        >
          <Select
            value={roleCode}
            onChange={(e) => setRoleCode(e.target.value)}
          >
            {allowedRoleCodes.map((code) => {
              const def = SYSTEM_ROLE_BY_CODE[code];
              return (
                <option key={code} value={code}>
                  {code} {def ? `— ${def.name}` : ""}
                </option>
              );
            })}
          </Select>
        </Field>

        {mode === "existing" ? (
          <>
            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-surface-1 px-3 py-2 text-[12px] text-fg">
              <input
                type="checkbox"
                checked={filterToRole}
                onChange={(e) => {
                  setFilterToRole(e.target.checked);
                  setSelectedUser(null);
                  setSearch("");
                }}
                className="h-3.5 w-3.5 accent-accent"
              />
              <span>
                <span className="font-medium">
                  Only show users who already have <span className="font-mono text-[11px]">{roleCode}</span>
                </span>
                <span className="ml-1 text-fg-muted">
                  — turn off to search across all users.
                </span>
              </span>
            </label>

            <Field
              label="User"
              hint={
                selectedUser
                  ? "Selected — clear to pick another."
                  : filterToRole
                  ? `${roleHolders?.length ?? 0} existing ${roleCode}${(roleHolders?.length ?? 0) === 1 ? "" : "s"} below — or type to filter.`
                  : "Type a name or email; results appear below."
              }
            >
              {selectedUser ? (
                <div className="flex items-center gap-3 rounded-md border border-border bg-surface-1 px-3 py-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-fg text-[10px] font-semibold text-bg">
                    {(selectedUser.displayName ?? selectedUser.email ?? "?")
                      .slice(0, 2)
                      .toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-fg">
                      {selectedUser.displayName ?? "—"}
                    </p>
                    <p className="truncate text-[11px] text-fg-muted">
                      {selectedUser.email ?? selectedUser.id.slice(0, 8)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedUser(null);
                      setSearch("");
                    }}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg"
                    aria-label="Clear"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <Input
                  placeholder={
                    filterToRole
                      ? `Filter ${roleCode}s by name or email…`
                      : "Search by name or email…"
                  }
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              )}
            </Field>
            {/* Pre-filtered list of role-holders (no search needed). */}
            {!selectedUser &&
              filterToRole &&
              search.trim().length < 2 && (
                <ul className="max-h-56 overflow-y-auto rounded-md border border-border bg-surface-1">
                  {loadingHolders && (
                    <li className="px-3 py-3 text-[12px] text-fg-muted">
                      Loading existing {roleCode}s…
                    </li>
                  )}
                  {!loadingHolders && (roleHolders?.length ?? 0) === 0 && (
                    <li className="px-3 py-3 text-[12px] text-fg-muted">
                      No existing {roleCode} on the platform yet. Switch to{" "}
                      <em>Invite by email</em>, or untick the filter to search
                      all users.
                    </li>
                  )}
                  {!loadingHolders &&
                    (roleHolders ?? []).map((u) => (
                      <li key={u.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedUser(u);
                            setSearch(u.displayName ?? u.email ?? "");
                          }}
                          className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-2"
                        >
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[10px] font-semibold text-fg">
                            {(u.displayName ?? u.email ?? "?")
                              .slice(0, 2)
                              .toUpperCase()}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] text-fg">
                              {u.displayName ?? u.email ?? u.id.slice(0, 8)}
                            </p>
                            <p className="truncate text-[11px] text-fg-muted">
                              {u.email ?? u.id.slice(0, 8)}
                            </p>
                          </div>
                        </button>
                      </li>
                    ))}
                </ul>
              )}
            {!selectedUser && search.trim().length >= 2 && (
              <ul className="max-h-56 overflow-y-auto rounded-md border border-border bg-surface-1">
                {searching && (
                  <li className="px-3 py-3 text-[12px] text-fg-muted">
                    Searching…
                  </li>
                )}
                {!searching && results.length === 0 && (
                  <li className="px-3 py-3 text-[12px] text-fg-muted">
                    No matches. Switch to <em>Invite by email</em> to send a
                    fresh invite.
                  </li>
                )}
                {results.map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedUser(u);
                        setSearch(u.displayName ?? u.email ?? "");
                      }}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-2"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[10px] font-semibold text-fg">
                        {(u.displayName ?? u.email ?? "?")
                          .slice(0, 2)
                          .toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] text-fg">
                          {u.displayName ?? u.email ?? u.id.slice(0, 8)}
                        </p>
                        <p className="truncate text-[11px] text-fg-muted">
                          {u.email ?? u.id.slice(0, 8)}
                        </p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
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
        )}

        {error && (
          <p className="rounded-md bg-rose-500/10 px-3 py-2 text-[12px] text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}
        {flash && (
          <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-700 dark:text-emerald-400">
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
                  const ok = await copyInviteToClipboard(renderedMessage);
                  setCopied(ok);
                }}
                className="inline-flex h-6 items-center gap-1 rounded-md border border-border bg-surface-1 px-2 font-mono text-[10px] uppercase tracking-widest text-fg-muted hover:border-fg-muted hover:text-fg"
              >
                {copied ? "Copied" : "Copy again"}
              </button>
            </div>
            <p className="text-[12px] font-medium text-fg">
              Subject: {renderedMessage.subject}
            </p>
            <textarea
              readOnly
              value={renderedMessage.body}
              rows={Math.min(12, renderedMessage.body.split("\n").length + 1)}
              className="w-full resize-y rounded-md border border-border bg-surface-1 p-2 font-mono text-[11px] leading-relaxed text-fg focus-visible:border-accent focus-visible:outline-none focus-visible:shadow-focus"
            />
          </div>
        )}

        <div className="flex justify-end">
          <Button type="submit" disabled={submitDisabled}>
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {mode === "existing" ? "Assigning…" : "Sending invite…"}
              </>
            ) : mode === "existing" ? (
              "Assign role"
            ) : (
              "Send invite"
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

function ModeChip({
  active,
  onClick,
  icon,
  children
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "inline-flex items-center gap-1.5 rounded-full bg-fg px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-bg"
          : "inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-1 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-fg-muted hover:border-fg-muted hover:text-fg"
      }
    >
      {icon}
      {children}
    </button>
  );
}

async function copyInviteToClipboard(m: {
  subject: string;
  body: string;
  recipient: string;
}): Promise<boolean> {
  const text = [`To: ${m.recipient}`, `Subject: ${m.subject}`, "", m.body].join(
    "\n"
  );
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through
  }
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
