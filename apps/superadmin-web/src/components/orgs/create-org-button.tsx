"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { orgs } from "@/lib/api/browser-api";
import type { OrgType } from "@/lib/api/types";

const ORG_TYPES: { value: OrgType; label: string }[] = [
  { value: "club", label: "Club" },
  { value: "league_operator", label: "League operator" },
  { value: "association", label: "Association" },
  { value: "federation", label: "Federation" },
  { value: "governing_body", label: "Governing body" },
  { value: "school", label: "School" },
  { value: "tournament_operator", label: "Tournament operator" }
];

export function CreateOrgButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="mr-2 h-4 w-4" />
        New organization
      </Button>
      <CreateOrgDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function CreateOrgDialog({
  open,
  onClose
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    slug: "",
    legalName: "",
    displayName: "",
    orgType: "club" as OrgType,
    countryCode: "US",
    defaultLocale: "en-US",
    defaultCurrency: "USD",
    defaultTimezone: "America/New_York"
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await orgs.create(form);
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
      title="Create organization"
      description="Tenants are top-level isolation units. Slug must be globally unique."
      size="lg"
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Display name"
            htmlFor="displayName"
            hint="Public-facing name"
          >
            <Input
              id="displayName"
              required
              value={form.displayName}
              onChange={(e) => set("displayName", e.target.value)}
              placeholder="Toronto Hockey League"
            />
          </Field>
          <Field label="Legal name" htmlFor="legalName">
            <Input
              id="legalName"
              required
              value={form.legalName}
              onChange={(e) => set("legalName", e.target.value)}
              placeholder="Toronto Hockey League Inc."
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Slug"
            htmlFor="slug"
            hint="lowercase, hyphens, 2–60 chars"
          >
            <Input
              id="slug"
              required
              minLength={2}
              maxLength={60}
              // Pattern explicitly keeps `-` OUT of any character class
              // because Chrome's HTML pattern attribute now runs with the
              // /v regex flag, which rejects `[a-z0-9-]`, `[-a-z0-9]`, and
              // even `[a-z0-9\-]` as an "Invalid character class". This
              // equivalent form — internal `-` between alnum runs — is
              // valid under both /u and /v. Length is enforced by the
              // adjacent min/maxLength HTML attrs.
              pattern="^[a-z0-9]+(-[a-z0-9]+)*$"
              value={form.slug}
              onChange={(e) => set("slug", e.target.value.toLowerCase())}
              placeholder="toronto-hockey"
            />
          </Field>
          <Field label="Type" htmlFor="orgType">
            <Select
              id="orgType"
              value={form.orgType}
              onChange={(e) => set("orgType", e.target.value as OrgType)}
            >
              {ORG_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Country" htmlFor="countryCode" hint="ISO-3166 alpha-2">
            <Input
              id="countryCode"
              required
              maxLength={2}
              value={form.countryCode}
              onChange={(e) =>
                set("countryCode", e.target.value.toUpperCase())
              }
            />
          </Field>
          <Field label="Locale" htmlFor="defaultLocale">
            <Input
              id="defaultLocale"
              required
              value={form.defaultLocale}
              onChange={(e) => set("defaultLocale", e.target.value)}
            />
          </Field>
          <Field
            label="Currency"
            htmlFor="defaultCurrency"
            hint="ISO-4217 3-letter"
          >
            <Input
              id="defaultCurrency"
              required
              maxLength={3}
              value={form.defaultCurrency}
              onChange={(e) =>
                set("defaultCurrency", e.target.value.toUpperCase())
              }
            />
          </Field>
        </div>

        <Field label="Timezone" htmlFor="defaultTimezone" hint="IANA name">
          <Input
            id="defaultTimezone"
            value={form.defaultTimezone}
            onChange={(e) => set("defaultTimezone", e.target.value)}
            placeholder="America/New_York"
          />
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
              "Create organization"
            )}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
