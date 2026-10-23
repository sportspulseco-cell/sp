import { MapPin } from "lucide-react";
import { Eyebrow, IconTile } from "@sportspulse/ui";
import { leagueMgmt } from "@/lib/api/server-api";
import { RegionsPanel } from "./regions-panel";

/**
 * Regions of the active organisation (Season -> Region -> Division),
 * shown above the Org setup wizard so the structure is set up in one
 * place. Same shared panel sa-web mounts on the organisation page.
 */
export async function RegionsSection({ orgId, orgName }: { orgId: string; orgName: string }) {
  const regions = await leagueMgmt.listRegions({ orgId }).catch(() => ({ items: [] }));
  return (
    <section className="rounded-xl border border-border bg-surface-1">
      <header className="flex items-start gap-3 border-b border-border px-6 py-4">
        <IconTile icon={MapPin} tint="blue" size="sm" />
        <div className="flex-1">
          <Eyebrow>Regions</Eyebrow>
          <p className="mt-0.5 text-base font-semibold tracking-tight text-fg">Regions of {orgName}</p>
          <p className="mt-0.5 text-[13px] text-fg-muted">
            One list for the whole organisation, reused every season. Divisions pick a region in
            the wizard below or on the division page.
          </p>
        </div>
      </header>
      <div className="px-6 py-5">
        <RegionsPanel orgId={orgId} initial={regions.items} />
      </div>
    </section>
  );
}
