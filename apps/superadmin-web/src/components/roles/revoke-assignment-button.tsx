"use client";

import { Button } from "@sportspulse/ui";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { iam } from "@/lib/api/browser-api";

export function RevokeAssignmentButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm("Revoke this role assignment?")) return;
        start(async () => {
          try {
            await iam.revokeAssignment(id);
            router.refresh();
          } catch (err) {
            alert((err as Error).message);
          }
        });
      }}
      variant="outline"
      size="sm"
      className="gap-1.5 hover:border-[var(--tint-rose-fg)]/50 hover:text-[var(--tint-rose-fg)]"
    >
      {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Revoke"}
    </Button>
  );
}
