"use client";

import { Button } from "@sportspulse/ui";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { registration } from "@/lib/api/browser-api";

export function PublishVersionButton({
  formId,
  versionId
}: {
  formId: string;
  versionId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      disabled={pending}
      onClick={() => {
        start(async () => {
          try {
            await registration.publishFormVersion(formId, versionId);
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
          Publishing
        </span>
      ) : (
        "Publish"
      )}
    </Button>
  );
}
