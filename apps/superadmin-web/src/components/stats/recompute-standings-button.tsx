"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { stats } from "@/lib/api/browser-api";
import { Button } from "@/components/ui/button";

export function RecomputeStandingsButton({ leagueId }: { leagueId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      try {
        await stats.recomputeStandings(leagueId);
        router.refresh();
      } catch (err) {
        // surface in a simple toast-less manner — page reload will display API errors anyway
        alert((err as Error).message);
      }
    });
  }

  return (
    <Button size="sm" variant="outline" onClick={onClick} disabled={pending}>
      {pending ? (
        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
      ) : (
        <RefreshCw className="mr-2 h-3.5 w-3.5" />
      )}
      Recompute
    </Button>
  );
}
