"use client";

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
    <button
      type="button"
      disabled={pending}
      className="rounded-md border border-border bg-surface-1 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-fg transition-colors duration-fast ease-ease hover:border-border-strong disabled:opacity-50"
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
    >
      {pending ? (
        <span className="flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          Publishing
        </span>
      ) : (
        "Publish"
      )}
    </button>
  );
}
