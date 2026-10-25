"use client";

/**
 * Binds the shared SchedulingGenerateForm to this app's API client, so
 * Publish goes through the API (games published, teams notified: SCH-8)
 * instead of the scheduler-publish Edge Function. Same shared component
 * in every console.
 */
import type { ComponentProps } from "react";
import { SchedulingGenerateForm } from "@sportspulse/admin-pages";
import { gameOps } from "@/lib/api/browser-api";

type Props = Omit<ComponentProps<typeof SchedulingGenerateForm>, "publishSchedule">;

export function GenerateForm(props: Props) {
  return <SchedulingGenerateForm {...props} publishSchedule={(req) => gameOps.publishSchedule(req)} />;
}
