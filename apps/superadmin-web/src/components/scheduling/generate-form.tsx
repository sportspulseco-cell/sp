"use client";

/**
 * Binds the shared SchedulingGenerateForm to this app's API client, so
 * Publish goes through the API (games published, teams notified: SCH-8)
 * instead of the scheduler-publish Edge Function. Same shared component
 * in every console.
 */
import type { ComponentProps } from "react";
import { SchedulingGenerateForm } from "@sportspulse/admin-pages";
import { gameOps, schedulingInventory } from "@/lib/api/browser-api";

type Props = Omit<ComponentProps<typeof SchedulingGenerateForm>, "publishSchedule" | "blackoutApi"> & {
  /** The season's organisation, for the one-rink blackout picker. */
  orgId: string;
};

export function GenerateForm({ orgId, ...props }: Props) {
  return (
    <SchedulingGenerateForm
      {...props}
      publishSchedule={(req) => gameOps.publishSchedule(req)}
      blackoutApi={{
        list: async () => (await schedulingInventory.listBlackouts(props.seasonId)).items,
        create: (body) => schedulingInventory.createBlackout(props.seasonId, body),
        remove: (id) => schedulingInventory.deleteBlackout(id),
        rinks: async () => {
          const { items } = await schedulingInventory.listVenues({ orgId });
          const venues = await Promise.all(items.map((v) => schedulingInventory.getVenue(v.id)));
          return venues.flatMap((v) =>
            v.surfaces.map((s) => ({ id: s.id, label: `${v.venue.name} · ${s.label}` }))
          );
        }
      }}
    />
  );
}
