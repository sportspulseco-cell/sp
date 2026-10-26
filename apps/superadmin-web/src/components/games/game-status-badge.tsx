import { Badge, statusLabel } from "@sportspulse/ui";
import type { GameStatus } from "@/lib/api/types";

export function GameStatusBadge({ status }: { status: GameStatus }) {
  return (
    <Badge status={status} domain="game">
      {status === "in_play" ? (
        <span className="flex items-center gap-1.5">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
          </span>
          {statusLabel(status, "game")}
        </span>
      ) : null}
    </Badge>
  );
}
