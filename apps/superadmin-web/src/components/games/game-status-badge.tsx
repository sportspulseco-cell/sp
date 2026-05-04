import { Badge } from "@/components/ui/badge";
import type { GameStatus } from "@/lib/api/types";

const TONE: Record<GameStatus, "info" | "success" | "warning" | "danger" | "neutral"> = {
  scheduled: "info",
  in_play: "warning",
  completed: "success",
  postponed: "neutral",
  cancelled: "danger",
  forfeited: "danger"
};

const LABEL: Record<GameStatus, string> = {
  scheduled: "Scheduled",
  in_play: "Live",
  completed: "Final",
  postponed: "Postponed",
  cancelled: "Cancelled",
  forfeited: "Forfeit"
};

export function GameStatusBadge({ status }: { status: GameStatus }) {
  return (
    <Badge tone={TONE[status]} mono={status === "in_play"}>
      {status === "in_play" ? (
        <span className="flex items-center gap-1.5">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-500" />
          </span>
          LIVE
        </span>
      ) : (
        LABEL[status]
      )}
    </Badge>
  );
}
