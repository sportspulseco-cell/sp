"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@sportspulse/ui";
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
    <Button
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
      variant="outline"
      size="sm"
      className={
        suspended
          ? "gap-1.5 text-[var(--tint-emerald-fg)]"
          : "gap-1.5 hover:border-[var(--tint-rose-fg)]/50 hover:text-[var(--tint-rose-fg)]"
      }
    >
      {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : suspended ? "Reactivate" : "Suspend"}
    </Button>
  );
}
