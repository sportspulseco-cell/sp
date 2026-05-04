"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { admin } from "@/lib/api/browser-api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

const VALUE_TYPES = ["string", "number", "boolean", "json"] as const;

export function UpsertSettingButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    key: "",
    category: "general",
    valueType: "string" as (typeof VALUE_TYPES)[number],
    value: "",
    description: "",
    isEditable: true
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function parseValue(): unknown {
    if (form.valueType === "string") return form.value;
    if (form.valueType === "number") return Number(form.value);
    if (form.valueType === "boolean") return form.value === "true";
    return JSON.parse(form.value);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const value = parseValue();
      await admin.upsertSetting({
        key: form.key,
        category: form.category,
        value,
        description: form.description || null,
        isEditable: form.isEditable
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
        New setting
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="New / upsert setting"
        description="Existing keys are overwritten in place. Use category to group related settings."
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Key" htmlFor="us-key">
              <Input
                id="us-key"
                required
                value={form.key}
                onChange={(e) => setForm({ ...form, key: e.target.value })}
                placeholder="support.email"
              />
            </Field>
            <Field label="Category" htmlFor="us-cat">
              <Input
                id="us-cat"
                value={form.category}
                onChange={(e) =>
                  setForm({ ...form, category: e.target.value })
                }
                placeholder="general / email / billing"
              />
            </Field>
          </div>
          <div className="grid grid-cols-[180px_1fr] gap-3">
            <Field label="Value type" htmlFor="us-vt">
              <Select
                id="us-vt"
                value={form.valueType}
                onChange={(e) =>
                  setForm({
                    ...form,
                    valueType: e.target.value as (typeof VALUE_TYPES)[number]
                  })
                }
              >
                {VALUE_TYPES.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Value"
              htmlFor="us-val"
              hint={
                form.valueType === "json"
                  ? "Paste valid JSON."
                  : form.valueType === "boolean"
                    ? "Type true or false."
                    : `Will be stored as ${form.valueType}.`
              }
            >
              {form.valueType === "json" ? (
                <textarea
                  id="us-val"
                  required
                  rows={4}
                  value={form.value}
                  onChange={(e) => setForm({ ...form, value: e.target.value })}
                  placeholder={'{ "primary": "#635bff" }'}
                  className="w-full rounded-md border border-border bg-surface-1 px-3 py-2 font-mono text-[12px] text-fg placeholder:text-fg-muted focus-visible:border-accent focus-visible:outline-none focus-visible:shadow-focus"
                />
              ) : (
                <Input
                  id="us-val"
                  required
                  value={form.value}
                  onChange={(e) => setForm({ ...form, value: e.target.value })}
                  placeholder={
                    form.valueType === "boolean" ? "true / false" : "value"
                  }
                />
              )}
            </Field>
          </div>
          <Field label="Description" htmlFor="us-desc">
            <Input
              id="us-desc"
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              placeholder="Optional"
            />
          </Field>
          <label className="flex items-center gap-2 text-sm text-fg">
            <input
              type="checkbox"
              checked={form.isEditable}
              onChange={(e) =>
                setForm({ ...form, isEditable: e.target.checked })
              }
            />
            Editable via API
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
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
                </>
              ) : (
                "Save setting"
              )}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </>
  );
}
