import type { RoleScopeType } from "@/lib/api/types";
import type { Tint } from "@/components/ui/icon-tile";

/** Map scope type → tint so the hierarchy reads at a glance. */
export function tintForScope(scope: RoleScopeType): Tint {
  switch (scope) {
    case "platform":
      return "violet";
    case "org":
      return "amber";
    case "league":
      return "blue";
    case "season":
      return "cyan";
    case "division":
      return "emerald";
    case "team":
      return "rose";
    case "game":
      return "neutral";
    default:
      return "neutral";
  }
}
