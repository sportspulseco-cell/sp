"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { compliance, orgs as orgsApi } from "@/lib/api/browser-api";
import type {
  EligibilityStatus,
  Org,
  Person,
  Season
} from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

const STATUSES: EligibilityStatus[] = [
  "pending",
  "eligible",
  "ineligible",
  "waived",
  "expired"
];

export function CreateEligibilityButton({
  persons,
  seasons
}: {
  persons: Person[];
  seasons: Season[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    personId: persons[0]?.id ?? "",
    seasonId: "",
    status: "pending" as EligibilityStatus,
    governingBodyId: ""
  });
  const [governingBodies, setGoverningBodies] = useState<Org[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    orgsApi
      .list({ limit: 200 })
      .then((p) =>
        setGoverningBodies(
          p.items.filter(
            (o) =>
              o.orgType === "governing_body" || o.orgType === "federation"
          )
        )
      )
      .catch(() => setGoverningBodies([]));
  }, [open]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await compliance.createEligibility({
        personId: form.personId,
        seasonId: form.seasonId || null,
        governingBodyId: form.governingBodyId || null,
        status: form.status
      });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const disabled = persons.length === 0;

  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={disabled}>
        <Plus className="mr-2 h-4 w-4" />
        New record
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="New eligibility record"
        description="Manually create a record for cases not covered by registration auto-evaluation (transfers, governing-body sanctions, etc.)."
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Person" htmlFor="ce-person">
            <Select
              id="ce-person"
              required
              value={form.personId}
              onChange={(e) => setForm({ ...form, personId: e.target.value })}
            >
              {persons.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.preferredName ?? `${p.legalFirstName} ${p.legalLastName}`}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Season"
            htmlFor="ce-season"
            hint="Optional — leave blank for a platform-wide record."
          >
            <Select
              id="ce-season"
              value={form.seasonId}
              onChange={(e) => setForm({ ...form, seasonId: e.target.value })}
            >
              <option value="">— No season —</option>
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status" htmlFor="ce-status">
            <Select
              id="ce-status"
              value={form.status}
              onChange={(e) =>
                setForm({ ...form, status: e.target.value as EligibilityStatus })
              }
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Governing body"
            htmlFor="ce-gb"
            hint={
              governingBodies.length === 0
                ? "No governing bodies / federations configured — leave blank."
                : "Optional — for federation-scoped eligibility."
            }
          >
            <Select
              id="ce-gb"
              value={form.governingBodyId}
              onChange={(e) =>
                setForm({ ...form, governingBodyId: e.target.value })
              }
            >
              <option value="">— None —</option>
              {governingBodies.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.displayName} ({o.orgType.replace(/_/g, " ")})
                </option>
              ))}
            </Select>
          </Field>

          {error ? (
            <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
              {error}
            </p>
          ) : null}

          <DialogActions>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating…
                </>
              ) : (
                "Create record"
              )}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </>
  );
}
