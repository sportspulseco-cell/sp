"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { iam } from "@/lib/api/browser-api";

export function SuspendUserButton({
  userId,
  suspended
}: {
  userId: string;
  suspended: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (
          !confirm(
            suspended
              ? "Reactivate this user account?"
              : "Suspend this user account? They'll lose access until reactivated."
          )
        )
          return;
        start(async () => {
          try {
            if (suspended) await iam.reactivateUser(userId);
            else await iam.suspendUser(userId);
            router.refresh();
          } catch (err) {
            alert((err as Error).message);
          }
        });
      }}
      className={
        suspended
          ? "inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-1 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-emerald-700 transition-colors duration-fast ease-ease hover:border-border-strong dark:text-emerald-400"
          : "inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-1 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-fg-muted transition-colors duration-fast ease-ease hover:border-rose-500/50 hover:text-rose-600 dark:hover:text-rose-400"
      }
    >
      {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : suspended ? "Reactivate" : "Suspend"}
    </button>
  );
}
