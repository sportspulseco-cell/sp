"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ExternalLink,
  KeyRound,
  MoreHorizontal,
  Pause,
  Play,
  UserCog
} from "lucide-react";
import { iam } from "@/lib/api/browser-api";
import type { Profile } from "@/lib/api/types";
import { SetPasswordDialog } from "./set-password-dialog";
import { RoleProfileDialog } from "./role-profile-dialog";

/**
 * Per-row kebab menu on /users.
 *
 * Wraps the destructive + dialog-driven actions that don't deserve a
 * column of their own: edit role-specific profile, force-set password,
 * suspend/reactivate, and a quick deep-link to the full detail page.
 */
export function UserActionsMenu({ user }: { user: Profile }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function toggleSuspend() {
    setOpen(false);
    const suspended = user.status === "suspended";
    if (
      !confirm(
        suspended
          ? `Reactivate ${user.email ?? "this user"}?`
          : `Suspend ${user.email ?? "this user"}? They'll lose access until reactivated.`
      )
    )
      return;
    try {
      if (suspended) await iam.reactivateUser(user.id);
      else await iam.suspendUser(user.id);
      router.refresh();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  return (
    <>
      <div ref={containerRef} className="relative inline-block">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-surface-1 text-fg-muted transition-colors hover:border-fg-muted hover:text-fg"
          aria-label="User actions"
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>

        {open && (
          <div className="absolute right-0 z-50 mt-1 min-w-[200px] overflow-hidden rounded-md border border-border bg-surface-1 shadow-lg">
            <MenuItem
              icon={<UserCog className="h-3.5 w-3.5" strokeWidth={1.75} />}
              onClick={() => {
                setOpen(false);
                setProfileOpen(true);
              }}
            >
              Edit role profile
            </MenuItem>
            <MenuItem
              icon={<KeyRound className="h-3.5 w-3.5" strokeWidth={1.75} />}
              onClick={() => {
                setOpen(false);
                setPwdOpen(true);
              }}
            >
              Set password
            </MenuItem>
            <MenuItem
              icon={
                user.status === "suspended" ? (
                  <Play className="h-3.5 w-3.5" strokeWidth={1.75} />
                ) : (
                  <Pause className="h-3.5 w-3.5" strokeWidth={1.75} />
                )
              }
              onClick={toggleSuspend}
              tone={user.status === "suspended" ? "ok" : "danger"}
            >
              {user.status === "suspended" ? "Reactivate" : "Suspend"}
            </MenuItem>
            <div className="my-1 h-px bg-border" />
            <MenuItem
              icon={<ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} />}
              onClick={() => {
                setOpen(false);
                router.push(`/users/${user.id}`);
              }}
            >
              View detail
            </MenuItem>
          </div>
        )}
      </div>

      <SetPasswordDialog
        open={pwdOpen}
        onClose={() => setPwdOpen(false)}
        userId={user.id}
        email={user.email}
      />
      <RoleProfileDialog
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        userId={user.id}
      />
    </>
  );
}

function MenuItem({
  icon,
  onClick,
  children,
  tone = "default"
}: {
  icon: React.ReactNode;
  onClick: () => void;
  children: React.ReactNode;
  tone?: "default" | "danger" | "ok";
}) {
  const cls =
    tone === "danger"
      ? "flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] text-fg hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400"
      : tone === "ok"
      ? "flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] text-fg hover:bg-emerald-500/10 hover:text-emerald-700 dark:hover:text-emerald-400"
      : "flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] text-fg hover:bg-surface-2";
  return (
    <button type="button" onClick={onClick} className={cls}>
      {icon}
      <span>{children}</span>
    </button>
  );
}
