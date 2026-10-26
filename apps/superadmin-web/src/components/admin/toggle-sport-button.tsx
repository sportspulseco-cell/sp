"use client";

import { Button } from "@sportspulse/ui";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { admin } from "@/lib/api/browser-api";
import type { Sport } from "@/lib/api/types";

export function ToggleSportButton({ sport }: { sport: Sport }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const next = !sport.active;

  return (
    <Button
      type="button"
      disabled={pending}
      onClick={() => {
        start(async () => {
          try {
            await admin.updateSport(sport.code, { active: next });
            router.refresh();
          } catch (err) {
            alert((err as Error).message);
          }
        });
      }}
      variant="outline"
      size="sm"
      className="gap-1.5"
    >
      {pending ? (
        <span className="flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          ...
        </span>
      ) : next ? (
        "Activate"
      ) : (
        "Deactivate"
      )}
    </Button>
  );
}
