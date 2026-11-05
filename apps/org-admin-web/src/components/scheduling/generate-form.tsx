"use client";

/**
 * Binds the shared SchedulingGenerateForm to this app's API client, so
 * Publish goes through the API (games published, teams notified: SCH-8)
 * instead of the scheduler-publish Edge Function. Same shared component
 * in every console.
 */
import { useCallback, useMemo, type ComponentProps } from "react";
import { fetchAll } from "@sportspulse/api-client";
import { SchedulingGenerateForm } from "@sportspulse/admin-pages";
import { gameOps, schedulingInventory, leagueMgmt } from "@/lib/api/browser-api";

type Props = Omit<ComponentProps<typeof SchedulingGenerateForm>, "publishSchedule" | "blackoutApi" | "loadTeams"> & {
  /** The season's organization, for the one-rink blackout picker. */
  orgId: string;
};

export function GenerateForm({ orgId, ...props }: Props) {
  const loadTeams = useCallback(async (divisionId: string) =>
    (await fetchAll(cursor => leagueMgmt.listTeams({ divisionId, limit: 100, cursor }))).items.map(team => ({ id: team.id, name: team.name })), []);
  const blackoutApi = useMemo(() => {
    let rinks: Promise<Array<{ id: string; label: string; venueId: string; venueName: string }>> | null = null;
    return {
      list: async () => (await schedulingInventory.listBlackouts(props.seasonId)).items,
      create: (body: { startDate: string; endDate?: string; surfaceId?: string; reason?: string }) => schedulingInventory.createBlackout(props.seasonId, body),
      remove: (id: string) => schedulingInventory.deleteBlackout(id),
      rinks: () => {
        if (!rinks) rinks = fetchAll(cursor => schedulingInventory.listRinkOptions({ orgId, limit: 100, cursor })).then(page => page.items)
          .catch(error => { rinks = null; throw error; });
        return rinks;
      }
    };
  }, [orgId, props.seasonId]);
  return (
    <SchedulingGenerateForm
      {...props}
      publishSchedule={(req) => gameOps.publishSchedule(req)}
      blackoutApi={blackoutApi}
      loadTeams={loadTeams}
    />
  );
}
