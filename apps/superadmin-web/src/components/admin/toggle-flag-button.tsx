"use client";

import { Button } from "@sportspulse/ui";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { admin } from "@/lib/api/browser-api";
import type { FeatureFlag } from "@/lib/api/types";

export function ToggleFlagButton({ flag }: { flag: FeatureFlag }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const next = !flag.isEnabled;

  return (
    <Button
      type="button"
      disabled={pending}
      onClick={() => {
        start(async () => {
          try {
            await admin.upsertFlag({
              key: flag.key,
              description: flag.description,
              isEnabled: next,
              rolloutPct: flag.rolloutPct,
              orgAllowlist: flag.orgAllowlist,
              variants: flag.variants
            });
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
          {next ? "enabling" : "disabling"}
        </span>
      ) : next ? (
        "Enable"
      ) : (
        "Disable"
      )}
    </Button>
  );
}
