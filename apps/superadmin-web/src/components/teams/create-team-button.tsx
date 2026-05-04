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
  "HOCKEY_ICE",
  "SOCCER",
  "BASKETBALL",
  "BASEBALL",
  "CRICKET",
  "RUGBY_UNION",
  "VOLLEYBALL",
  "FUTSAL"
];

export function CreateTeamButton({ orgs }: { orgs: Org[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={orgs.length === 0}>
        <Plus className="mr-2 h-4 w-4" />
        New team
      </Button>
      <CreateTeamDialog
        open={open}
        onClose={() => setOpen(false)}
        orgs={orgs}
      />
    </>
  );
}

function CreateTeamDialog({
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
    shortName: "",
    sportCode: "HOCKEY_ICE"
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await leagueMgmt.createTeam({
        orgId: form.orgId,
        name: form.name,
        sportCode: form.sportCode,
        shortName: form.shortName || null
      });
      onClose();
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Create team">
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Owner organization" htmlFor="orgId">
          <Select
            id="orgId"
            required
            value={form.orgId}
            onChange={(e) => setForm((f) => ({ ...f, orgId: e.target.value }))}
          >
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.displayName}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="name">
            <Input
              id="name"
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Toronto Tornadoes"
            />
          </Field>
          <Field label="Short name" htmlFor="shortName">
            <Input
              id="shortName"
              maxLength={20}
              value={form.shortName}
              onChange={(e) =>
                setForm((f) => ({ ...f, shortName: e.target.value }))
              }
              placeholder="TOR"
            />
          </Field>
        </div>
        <Field label="Sport" htmlFor="sportCode">
          <Select
            id="sportCode"
            value={form.sportCode}
            onChange={(e) =>
              setForm((f) => ({ ...f, sportCode: e.target.value }))
            }
          >
            {SPORTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>

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
              "Create team"
            )}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
