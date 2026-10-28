import { MapPin } from "lucide-react";
import { Eyebrow, IconTile } from "@sportspulse/ui";
import { leagueMgmt } from "@/lib/api/server-api";
import { RegionsPanel } from "./regions-panel";

/**
 * Regions of the active organization (Season -> Region -> Division).
 * Folded to one line above the Org setup wizard, so regions can be
 * added before the divisions step without pushing the wizard down; in
 * full on the organization page. Same shared panel sa-web mounts.
 */
export async function RegionsSection({
  orgId,
  orgName,
  folded = false
}: {
  orgId: string;
  orgName: string;
  /** One line that opens on demand (above the setup wizard, so the wizard leads). */
  folded?: boolean;
}) {
  const regions = await leagueMgmt.listRegions({ orgId }).catch(() => ({ items: [] }));
  if (folded) {
    return (
      <details className="group rounded-xl border border-border bg-surface-1">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3 [&::-webkit-details-marker]:hidden">
          <MapPin className="h-4 w-4 text-fg-muted" strokeWidth={1.75} aria-hidden />
          <span className="flex-1 text-[14px] font-medium text-fg">
            Regions of {orgName} · {regions.items.length}
          </span>
          <span className="text-[13px] text-[--accent] group-open:hidden">Manage</span>
        </summary>
        <div className="border-t border-border px-5 py-4">
          <RegionsPanel orgId={orgId} initial={regions.items} />
        </div>
      </details>
    );
  }
  return (
    <section className="rounded-xl border border-border bg-surface-1">
      <header className="flex items-start gap-3 border-b border-border px-6 py-4">
        <IconTile icon={MapPin} tint="blue" size="sm" />
        <div className="flex-1">
          <Eyebrow>Regions</Eyebrow>
          <p className="mt-0.5 text-base font-semibold tracking-tight text-fg">Regions of {orgName}</p>
          <p className="mt-0.5 text-[13px] text-fg-muted">
            One list for the whole organization, reused every season. Divisions pick a region in
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
