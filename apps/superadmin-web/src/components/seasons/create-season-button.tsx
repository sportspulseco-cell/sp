"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { leagueMgmt } from "@/lib/api/browser-api";
import type { League } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

/**
 * Post-flip: a season belongs to a LEAGUE (not directly to an org).
 * Caller passes the league list (filtered by the org if applicable).
 */
export function CreateSeasonButton({ leagues }: { leagues: League[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={leagues.length === 0}>
        <Plus className="mr-2 h-4 w-4" />
        New season
      </Button>
      <CreateSeasonDialog
        open={open}
        onClose={() => setOpen(false)}
        leagues={leagues}
      />
    </>
  );
}

function CreateSeasonDialog({
  open,
  onClose,
  leagues
}: {
  open: boolean;
  onClose: () => void;
  leagues: League[];
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    leagueId: leagues[0]?.id ?? "",
    name: "",
    sportCode: leagues[0]?.sportCode ?? "HOCKEY_ICE",
    startDate: "",
    endDate: "",
    timezone: "America/New_York"
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await leagueMgmt.createSeason(form);
      onClose();
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Create season"
      description="A season is a time-bounded instance of a league — divisions and registrations live inside it."
      size="lg"
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="League" htmlFor="leagueId">
          <Select
            id="leagueId"
            required
            value={form.leagueId}
            onChange={(e) => {
              const l = leagues.find((x) => x.id === e.target.value);
              set("leagueId", e.target.value);
              if (l) set("sportCode", l.sportCode);
            }}
          >
            {leagues.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.sportCode})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Name" htmlFor="name">
          <Input
            id="name"
            required
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="PPHL Spring 2027"
          />
        </Field>
        <Field label="Timezone" htmlFor="timezone">
          <Input
            id="timezone"
            value={form.timezone}
            onChange={(e) => set("timezone", e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Start date" htmlFor="startDate">
            <Input
              id="startDate"
              type="date"
              required
              value={form.startDate}
              onChange={(e) => set("startDate", e.target.value)}
            />
          </Field>
          <Field label="End date" htmlFor="endDate">
            <Input
              id="endDate"
              type="date"
              required
              value={form.endDate}
              onChange={(e) => set("endDate", e.target.value)}
            />
          </Field>
        </div>

        {error ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <DialogActions>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating…
              </>
            ) : (
              "Create season"
            )}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
