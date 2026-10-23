"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MapPin } from "lucide-react";
import { Alert } from "@sportspulse/ui";
import { leagueMgmt } from "@/lib/api/browser-api";
import type { Region } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

/**
 * Set or change the region of an existing division (Season → Region →
 * Division). Regions are the organisation's; manage the list on the
 * organisation page.
 */
export function DivisionRegionControl({
  divisionId,
  regionId,
  regions,
  orgHref
}: {
  divisionId: string;
  regionId: string | null;
  regions: Region[];
  /** Link to the org page where regions are managed. */
  orgHref: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(regionId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const dirty = value !== (regionId ?? "");

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await leagueMgmt.updateDivision(divisionId, { regionId: value || null });
      setValue(updated.regionId ?? "");
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-surface-1 px-6 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <MapPin className="h-4 w-4 text-fg-muted" strokeWidth={1.75} />
        <label htmlFor="division-region" className="text-[13px] font-medium text-fg">
          Region
        </label>
        <Select
          id="division-region"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setSaved(false);
          }}
          disabled={busy || regions.length === 0}
          className="max-w-[280px]"
        >
          <option value="">No region</option>
          {regions.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
        <Button size="sm" onClick={save} disabled={!dirty || busy}>
          {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
          Save region
        </Button>
        {saved && !dirty ? <span className="text-[12px] text-fg-muted">Saved</span> : null}
        <span className="text-[12px] text-fg-muted">
          {regions.length === 0 ? "This organisation has no regions yet. " : ""}
          {orgHref ? (
            <a href={orgHref} className="underline-offset-2 hover:underline">
              Manage regions on the organisation page
            </a>
          ) : null}
        </span>
      </div>
      {error ? (
        <div className="mt-3">
          <Alert tone="error">{error}</Alert>
        </div>
      ) : null}
    </section>
  );
}
