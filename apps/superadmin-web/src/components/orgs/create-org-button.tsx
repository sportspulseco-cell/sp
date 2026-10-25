"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { slugify } from "@sportspulse/admin-pages";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { orgs } from "@/lib/api/browser-api";
import type { Org, OrgType } from "@/lib/api/types";
import { RoleAssignmentPanel } from "@/components/roles/role-assignment-panel";

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

// Values a North American hockey league uses. The country / currency /
// locale tables have more rows; a value outside these lists stays
// selectable (withCurrent) so the form never silently changes it.
const COUNTRIES = [
  { value: "US", label: "United States" },
  { value: "CA", label: "Canada" }
];
const CURRENCIES = [
  { value: "USD", label: "US dollar (USD)" },
  { value: "CAD", label: "Canadian dollar (CAD)" }
];
const LOCALES = [
  { value: "en-US", label: "English (United States)" },
  { value: "en-CA", label: "English (Canada)" },
  { value: "fr-CA", label: "French (Canada)" }
];
const TIME_ZONES = [
  { value: "America/New_York", label: "Eastern (New York, Toronto)" },
  { value: "America/Chicago", label: "Central (Chicago, Winnipeg)" },
  { value: "America/Denver", label: "Mountain (Denver, Edmonton)" },
  { value: "America/Phoenix", label: "Mountain, no daylight saving (Phoenix)" },
  { value: "America/Los_Angeles", label: "Pacific (Los Angeles, Vancouver)" },
  { value: "America/Anchorage", label: "Alaska (Anchorage)" },
  { value: "Pacific/Honolulu", label: "Hawaii (Honolulu)" },
  { value: "America/Halifax", label: "Atlantic (Halifax)" },
  { value: "America/St_Johns", label: "Newfoundland (St. John's)" },
  { value: "America/Regina", label: "Saskatchewan (Regina)" },
  { value: "UTC", label: "UTC" }
];
function withCurrent(list: Array<{ value: string; label: string }>, current: string) {
  return current && !list.some((o) => o.value === current) ? [...list, { value: current, label: current }] : list;
}

/**
 * Create-organisation form (same fields as before), reused by the dialog
 * on /organizations and inline in Org setup step 1. Calls `onCreated`
 * with the new org; the caller then offers the org-admin step.
 */
export function CreateOrgForm({
  onCreated,
  onCancel
}: {
  onCreated: (org: Org) => void;
  onCancel: () => void;
}) {
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
  // The slug follows the display name until the admin edits it (SETUP-11).
  const [slugTouched, setSlugTouched] = useState(false);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const created = await orgs.create(form);
      onCreated(created);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
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
              onChange={(e) => {
                const displayName = e.target.value;
                setForm((f) => ({
                  ...f,
                  displayName,
                  slug: slugTouched ? f.slug : slugify(displayName).slice(0, 60)
                }));
              }}
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
              onChange={(e) => {
                setSlugTouched(true);
                set("slug", e.target.value.toLowerCase());
              }}
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
          <Field label="Country" htmlFor="countryCode">
            <Select
              id="countryCode"
              required
              value={form.countryCode}
              onChange={(e) => {
                const countryCode = e.target.value;
                // Canada defaults to Canadian dollars and English (Canada).
                setForm((f) => ({
                  ...f,
                  countryCode,
                  defaultCurrency: countryCode === "CA" ? "CAD" : countryCode === "US" ? "USD" : f.defaultCurrency,
                  defaultLocale: countryCode === "CA" ? "en-CA" : countryCode === "US" ? "en-US" : f.defaultLocale
                }));
              }}
            >
              {withCurrent(COUNTRIES, form.countryCode).map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Language" htmlFor="defaultLocale">
            <Select
              id="defaultLocale"
              required
              value={form.defaultLocale}
              onChange={(e) => set("defaultLocale", e.target.value)}
            >
              {withCurrent(LOCALES, form.defaultLocale).map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Currency" htmlFor="defaultCurrency">
            <Select
              id="defaultCurrency"
              required
              value={form.defaultCurrency}
              onChange={(e) => set("defaultCurrency", e.target.value)}
            >
              {withCurrent(CURRENCIES, form.defaultCurrency).map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Time zone" htmlFor="defaultTimezone" hint="Games and deadlines are shown in this time zone">
          <Select
            id="defaultTimezone"
            value={form.defaultTimezone}
            onChange={(e) => set("defaultTimezone", e.target.value)}
          >
            {withCurrent(TIME_ZONES, form.defaultTimezone).map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </Select>
        </Field>

        {error ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <DialogActions>
          <Button type="button" variant="ghost" onClick={onCancel}>
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
  );
}

/**
 * Step 2 after creating an organisation: choose its org admin. Reuses the
 * canonical RoleAssignmentPanel, so the admin can pick an existing user
 * by name or invite someone by email. Skippable; admins can be added
 * later from the organisation page.
 */
export function ChooseOrgAdmin({
  org,
  doneLabel,
  onDone
}: {
  org: Org;
  doneLabel: string;
  onDone: () => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-fg">
        <span className="font-medium">{org.displayName}</span> is created. Choose its org admin:
        search an existing user by name, or invite one by email.
      </p>
      <RoleAssignmentPanel
        scopeType="org"
        scopeId={org.id}
        allowedRoleCodes={["org_admin"]}
        resourceLabel={org.displayName}
        initialAssignments={[]}
      />
      <DialogActions>
        <Button type="button" onClick={onDone}>
          {doneLabel}
        </Button>
      </DialogActions>
    </div>
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
  const [created, setCreated] = useState<Org | null>(null);
  function close() {
    // Dismissing the org-admin step after a create still leaves a new
    // row behind (CONSOLE-11). Go to the list with the new org marked
    // "New": the URL change loads the fresh list and the admin sees which
    // row they just made.
    if (created) {
      const params = new URLSearchParams(window.location.search);
      params.set("created", created.id);
      router.replace(`/organizations?${params}`);
    }
    setCreated(null);
    onClose();
  }
  return (
    <Dialog
      open={open}
      onClose={close}
      title={created ? "Choose the org admin" : "Create organization"}
      description={
        created
          ? "Org admins manage this organisation's leagues, seasons, teams and registrations."
          : "Tenants are top-level isolation units. Slug must be globally unique."
      }
      size="lg"
    >
      {created ? (
        <ChooseOrgAdmin
          org={created}
          doneLabel="Done"
          onDone={() => {
            const id = created.id;
            close();
            router.push(`/organizations/${id}`);
            // No router.refresh() here: it can cancel the push and leave the
            // user on this form (J11). The new page loads fresh server data.
          }}
        />
      ) : (
        <CreateOrgForm onCreated={setCreated} onCancel={close} />
      )}
    </Dialog>
  );
}
