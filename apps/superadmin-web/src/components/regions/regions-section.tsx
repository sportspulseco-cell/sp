import { MapPin } from "lucide-react";
import { leagueMgmt } from "@/lib/api/server-api";
import { Eyebrow } from "@/components/ui/eyebrow";
import { IconTile } from "@/components/ui/icon-tile";
import { RegionsPanel } from "./regions-panel";

/**
 * Server wrapper: an organisation's regions with add / rename / archive.
 * Drops into the organisation detail page. Regions are reused by every
 * season of the org; divisions point at them.
 */
export async function RegionsSection({ orgId, orgName }: { orgId: string; orgName: string }) {
  const regions = await leagueMgmt.listRegions({ orgId }).catch(() => ({ items: [] }));
  return (
    <section className="rounded-xl border border-border bg-surface-1">
      <header className="flex items-start gap-3 border-b border-border px-6 py-4">
        <IconTile icon={MapPin} tint="blue" size="sm" />
        <div className="flex-1">
          <Eyebrow>Regions</Eyebrow>
          <p className="mt-0.5 text-base font-semibold tracking-tight text-fg">
            Regions of {orgName}
          </p>
          <p className="mt-0.5 text-[13px] text-fg-muted">
            Season → Region → Division. One list for the whole organisation, reused every season.
          </p>
        </div>
      </header>
      <div className="px-6 py-5">
        <RegionsPanel orgId={orgId} initial={regions.items} />
      </div>
    </section>
  );
}
