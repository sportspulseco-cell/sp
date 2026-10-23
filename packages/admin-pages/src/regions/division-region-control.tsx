"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MapPin } from "lucide-react";
import { Alert, Button, Select } from "@sportspulse/ui";

/**
 * Set or change the region of an existing division (Season -> Region ->
 * Division). Regions belong to the organisation; `manageHref` points at
 * the page where the consuming app manages them. Transport is injected:
 * `save` resolves with the region id the server now holds.
 */
export function DivisionRegionControl({
  regionId,
  regions,
  manageHref,
  save
}: {
  regionId: string | null;
  regions: Array<{ id: string; name: string }>;
  manageHref: string | null;
  save: (regionId: string | null) => Promise<{ regionId: string | null }>;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState(regionId ?? "");
  const [value, setValue] = useState(regionId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const dirty = value !== current;

  async function onSave() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const r = await save(value || null);
      setCurrent(r.regionId ?? "");
      setValue(r.regionId ?? "");
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
        <Button size="sm" onClick={onSave} disabled={!dirty || busy}>
          {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
          Save region
        </Button>
        {saved && !dirty ? <span className="text-[12px] text-fg-muted">Saved</span> : null}
        <span className="text-[12px] text-fg-muted">
          {regions.length === 0 ? "This organisation has no regions yet. " : ""}
          {manageHref ? (
            <a href={manageHref} className="underline-offset-2 hover:underline">
              Manage regions
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
