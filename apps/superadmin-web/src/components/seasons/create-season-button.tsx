"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { leagueMgmt } from "@/lib/api/browser-api";
import type { Org } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

const SPORTS = [
  { code: "HOCKEY_ICE", name: "Ice Hockey" },
  { code: "SOCCER", name: "Soccer / Football" },
  { code: "BASKETBALL", name: "Basketball" },
  { code: "BASEBALL", name: "Baseball" },
  { code: "CRICKET", name: "Cricket" },
  { code: "RUGBY_UNION", name: "Rugby Union" },
  { code: "VOLLEYBALL", name: "Volleyball" },
  { code: "FUTSAL", name: "Futsal" }
];

export function CreateSeasonButton({ orgs }: { orgs: Org[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={orgs.length === 0}>
        <Plus className="mr-2 h-4 w-4" />
        New season
      </Button>
      <CreateSeasonDialog
        open={open}
        onClose={() => setOpen(false)}
        orgs={orgs}
      />
    </>
  );
}

function CreateSeasonDialog({
  open,
  onClose,
  orgs
}: {
  open: boolean;
  onClose: () => void;
  orgs: Org[];
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    orgId: orgs[0]?.id ?? "",
    name: "",
    sportCode: "HOCKEY_ICE",
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
      description="A season is a time-bounded container — leagues, divisions, and teams live inside it."
      size="lg"
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Organization" htmlFor="orgId">
          <Select
            id="orgId"
            required
            value={form.orgId}
            onChange={(e) => set("orgId", e.target.value)}
          >
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.displayName} ({o.slug})
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
            placeholder="Spring 2027 Hockey"
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Sport" htmlFor="sportCode">
            <Select
              id="sportCode"
              required
              value={form.sportCode}
              onChange={(e) => set("sportCode", e.target.value)}
            >
              {SPORTS.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Timezone" htmlFor="timezone">
            <Input
              id="timezone"
              value={form.timezone}
              onChange={(e) => set("timezone", e.target.value)}
            />
          </Field>
        </div>
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
