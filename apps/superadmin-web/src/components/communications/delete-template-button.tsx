"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { communications } from "@/lib/api/browser-api";

export function DeleteTemplateButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm("Delete this template? Future notifications fall back to the platform default."))
          return;
        start(async () => {
          try {
            await communications.deleteTemplate(id);
            router.refresh();
          } catch (err) {
            alert((err as Error).message);
          }
        });
      }}
      className="rounded-md border border-border bg-surface-1 px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-fg-muted transition-colors duration-fast ease-ease hover:border-rose-500/50 hover:text-rose-600 disabled:opacity-50 dark:hover:text-rose-400"
    >
      {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Delete"}
    </button>
  );
}
