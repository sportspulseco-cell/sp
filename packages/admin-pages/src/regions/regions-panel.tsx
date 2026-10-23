"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Archive, Check, Loader2, Pencil, Plus, RotateCcw, X } from "lucide-react";
import { Alert, Badge, Button, Input } from "@sportspulse/ui";

export interface RegionRow {
  id: string;
  name: string;
  status: "active" | "archived";
  /** Live divisions pointing at this region (all seasons). */
  divisionCount: number;
}

/** Transport injected by the consuming app (sa-web / org-admin-web). */
export interface RegionsApi {
  list: (status?: "active" | "archived") => Promise<RegionRow[]>;
  create: (name: string) => Promise<unknown>;
  rename: (id: string, name: string) => Promise<unknown>;
  archive: (id: string) => Promise<unknown>;
  restore: (id: string) => Promise<unknown>;
}

/**
 * Manage an organisation's regions (the tier between a season and its
 * divisions: Season -> Region -> Division). Add, rename, archive and
 * restore. The API refuses to archive a region a live division still
 * uses; the row says so before the click instead of failing after it.
 * Shared by sa-web and org-admin-web; transport comes in as `api`.
 */
export function RegionsPanel({ api, initial }: { api: RegionsApi; initial: RegionRow[] }) {
  const router = useRouter();
  const [regions, setRegions] = useState<RegionRow[]>(initial);
  const [archived, setArchived] = useState<RegionRow[] | null>(null);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  async function reload() {
    setRegions(await api.list("active"));
    if (archived !== null) setArchived(await api.list("archived"));
    router.refresh();
  }

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function add(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    void run("add", async () => {
      await api.create(name);
      setNewName("");
    });
  }

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="New region name"
          value={newName}
          onChange={(e) => setNewName(e.target.value.slice(0, 120))}
          placeholder="Add a region, e.g. New Hampshire"
          className="min-w-[240px] flex-1"
        />
        <Button type="submit" size="sm" disabled={!newName.trim() || busy !== null}>
          {busy === "add" ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="mr-1.5 h-3.5 w-3.5" />
          )}
          Add region
        </Button>
      </form>

      {error ? <Alert tone="error">{error}</Alert> : null}

      {regions.length === 0 ? (
        <p className="text-[13px] text-fg-muted">
          No regions yet. Regions are optional: add them when the divisions of one season are
          split by area (Massachusetts vs New Hampshire). Divisions pick a region in Org setup
          or on the division page.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {regions.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
              {editing?.id === r.id ? (
                <form
                  className="flex flex-1 items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const name = editing.name.trim();
                    if (!name) return;
                    void run(r.id, async () => {
                      await api.rename(r.id, name);
                      setEditing(null);
                    });
                  }}
                >
                  <Input
                    aria-label={`Rename ${r.name}`}
                    autoFocus
                    value={editing.name}
                    onChange={(e) => setEditing({ id: r.id, name: e.target.value.slice(0, 120) })}
                    className="max-w-[280px]"
                  />
                  <Button type="submit" size="sm" disabled={busy !== null} title="Save name">
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)} title="Cancel">
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </form>
              ) : (
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-fg">{r.name}</p>
                  <p className="text-[11px] text-fg-muted">
                    {r.divisionCount === 0
                      ? "No divisions use it yet"
                      : `${r.divisionCount} division${r.divisionCount === 1 ? "" : "s"}`}
                  </p>
                </div>
              )}
              {editing?.id !== r.id ? (
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditing({ id: r.id, name: r.name })}
                    disabled={busy !== null}
                    title="Rename"
                    aria-label={`Rename ${r.name}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy !== null || r.divisionCount > 0}
                    title={
                      r.divisionCount > 0 ? "Move its divisions to another region first" : "Archive this region"
                    }
                    aria-label={`Archive ${r.name}`}
                    onClick={() => {
                      if (!confirm(`Archive region "${r.name}"?`)) return;
                      void run(r.id, () => api.archive(r.id));
                    }}
                  >
                    {busy === r.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Archive className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <div>
        {archived === null ? (
          <button
            type="button"
            className="text-[12px] text-fg-muted underline-offset-2 hover:underline"
            onClick={() => void run("archived", async () => setArchived(await api.list("archived")))}
          >
            Show archived regions
          </button>
        ) : archived.length === 0 ? (
          <p className="text-[12px] text-fg-muted">No archived regions.</p>
        ) : (
          <ul className="space-y-1">
            {archived.map((r) => (
              <li key={r.id} className="flex items-center gap-2 text-[12px] text-fg-muted">
                <Badge tone="neutral">archived</Badge>
                {r.name}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy !== null}
                  onClick={() => void run(r.id, () => api.restore(r.id))}
                >
                  <RotateCcw className="mr-1 h-3 w-3" /> Restore
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
