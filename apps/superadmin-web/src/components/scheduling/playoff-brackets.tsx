"use client";

/**
 * Binds the shared SchedulingPlayoffBrackets to this app's API client:
 * "Publish playoff games" puts the bracket's games on team schedules and
 * notifies the teams (gameOps.publishSchedule, gameType "playoff").
 */
import type { ComponentProps } from "react";
import { SchedulingPlayoffBrackets } from "@sportspulse/admin-pages";
import { gameOps } from "@/lib/api/browser-api";

type Props = Omit<ComponentProps<typeof SchedulingPlayoffBrackets>, "publishPlayoffGames" | "gameHref">;

export function PlayoffBrackets(props: Props) {
  return (
    <SchedulingPlayoffBrackets
      {...props}
      publishPlayoffGames={(req) => gameOps.publishSchedule({ ...req, gameType: "playoff" })}
      gameHref={(id) => `/games/${id}`}
    />
  );
}
