"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { finance } from "@/lib/api/browser-api";
import type { Org } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

const KINDS = [
  "registration",
  "division",
  "tournament",
  "sponsorship",
  "other"
];

const CURRENCIES = ["USD", "CAD", "EUR", "GBP", "AUD", "INR"];

export function CreateFeeScheduleButton({ orgs }: { orgs: Org[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    orgId: orgs[0]?.id ?? "",
    name: "",
    description: "",
    kind: "registration",
    code: "",
    currency: "USD",
    baseAmount: "0.00",
    dueOffsetDays: "14",
    lateFeeAmount: "0.00",
    isActive: true
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await finance.createFeeSchedule({
        orgId: form.orgId,
        name: form.name,
        description: form.description || null,
        kind: form.kind,
        code: form.code || null,
        currency: form.currency,
        baseAmountCents: Math.round(parseFloat(form.baseAmount) * 100),
        dueOffsetDays: parseInt(form.dueOffsetDays, 10),
        lateFeeCents: Math.round(parseFloat(form.lateFeeAmount) * 100),
        isActive: form.isActive
      });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        New schedule
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="New fee schedule"
        description="Reusable price template. Approving a registration spawns an invoice using the matching schedule (org + kind)."
        size="lg"
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Organization" htmlFor="cfs-org">
            <Select
              id="cfs-org"
              required
              value={form.orgId}
              onChange={(e) => setForm({ ...form, orgId: e.target.value })}
            >
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.displayName}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name" htmlFor="cfs-name">
              <Input
                id="cfs-name"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="2027 Spring Player Fee"
              />
            </Field>
            <Field
              label="Code"
              htmlFor="cfs-code"
              hint="Optional stable lookup."
            >
              <Input
                id="cfs-code"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="spring-2027-player"
              />
            </Field>
          </div>
          <Field label="Description" htmlFor="cfs-desc">
            <Input
              id="cfs-desc"
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              placeholder="Optional"
            />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Kind" htmlFor="cfs-kind">
              <Select
                id="cfs-kind"
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value })}
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Currency" htmlFor="cfs-currency">
              <Select
                id="cfs-currency"
                value={form.currency}
                onChange={(e) =>
                  setForm({ ...form, currency: e.target.value })
                }
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Due in days" htmlFor="cfs-due">
              <Input
                id="cfs-due"
                type="number"
                min={0}
                value={form.dueOffsetDays}
                onChange={(e) =>
                  setForm({ ...form, dueOffsetDays: e.target.value })
                }
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Base amount" htmlFor="cfs-base">
              <Input
                id="cfs-base"
                type="number"
                step="0.01"
                min="0"
                required
                value={form.baseAmount}
                onChange={(e) =>
                  setForm({ ...form, baseAmount: e.target.value })
                }
              />
            </Field>
            <Field label="Late fee" htmlFor="cfs-late">
              <Input
                id="cfs-late"
                type="number"
                step="0.01"
                min="0"
                value={form.lateFeeAmount}
                onChange={(e) =>
                  setForm({ ...form, lateFeeAmount: e.target.value })
                }
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-fg">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) =>
                setForm({ ...form, isActive: e.target.checked })
              }
            />
            Active
          </label>

          {error ? (
            <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
              {error}
            </p>
          ) : null}

          <DialogActions>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !form.orgId}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating…
                </>
              ) : (
                "Create schedule"
              )}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </>
  );
}
