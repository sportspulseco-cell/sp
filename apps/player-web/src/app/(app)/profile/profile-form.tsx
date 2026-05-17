"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { Badge, Button } from "@sportspulse/ui";
import type { Profile } from "@sportspulse/api-client";
import { iam } from "@/lib/api/browser-api";

const TIMEZONES = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Toronto",
  "Europe/London",
  "Europe/Paris",
  "Asia/Dubai",
  "Asia/Tokyo",
  "Australia/Sydney"
];

const LOCALES = [
  { value: "en", label: "English" },
  { value: "fr", label: "Français" },
  { value: "es", label: "Español" }
];

export function ProfileForm({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [legalFirstName, setLegalFirstName] = useState(profile.legalFirstName ?? "");
  const [legalLastName, setLegalLastName] = useState(profile.legalLastName ?? "");
  const [preferredName, setPreferredName] = useState(profile.preferredName ?? "");
  const [displayName, setDisplayName] = useState(profile.displayName ?? "");
  const [countryCode, setCountryCode] = useState(profile.countryCode ?? "");
  const [locale, setLocale] = useState(profile.locale);
  const [timezone, setTimezone] = useState(profile.timezone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await iam.patchMe({
        legalFirstName: legalFirstName.trim() || null,
        legalLastName: legalLastName.trim() || null,
        preferredName: preferredName.trim() || null,
        displayName: displayName.trim() || null,
        countryCode: countryCode.trim().toUpperCase() || null,
        locale,
        timezone
      });
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]"
    >
      <section className="space-y-6 rounded-xl border border-border bg-surface-1 p-6">
        <SectionHeader title="Legal identity" hint="Used on registration forms + waivers." />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Legal first name">
            <input
              value={legalFirstName}
              onChange={(e) => setLegalFirstName(e.target.value)}
              maxLength={120}
              className="input"
              required
            />
          </Field>
          <Field label="Legal last name">
            <input
              value={legalLastName}
              onChange={(e) => setLegalLastName(e.target.value)}
              maxLength={120}
              className="input"
              required
            />
          </Field>
        </div>

        <SectionHeader title="Display" hint="What teammates + captains see." />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Preferred name" hint="Optional — overrides legal first name in friendly contexts.">
            <input
              value={preferredName}
              onChange={(e) => setPreferredName(e.target.value)}
              maxLength={120}
              className="input"
            />
          </Field>
          <Field label="Display name" hint="Optional — what the chrome shows in the top bar.">
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={120}
              className="input"
            />
          </Field>
        </div>

        <SectionHeader title="Locale + timezone" hint="Times + dates on schedules respect these." />
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Country" hint="ISO-2 code (CA, US, GB…).">
            <input
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value.toUpperCase().slice(0, 2))}
              maxLength={2}
              placeholder="US"
              className="input font-mono uppercase"
            />
          </Field>
          <Field label="Locale">
            <select
              value={locale}
              onChange={(e) => setLocale(e.target.value)}
              className="input"
            >
              {LOCALES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Timezone">
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="input"
            >
              {TIMEZONES.includes(timezone) ? null : (
                <option value={timezone}>{timezone}</option>
              )}
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {error ? (
          <p className="rounded-md bg-rose-500/10 px-3 py-2 text-[12px] text-rose-700 dark:text-rose-300">
            {error}
          </p>
        ) : null}
        {saved ? (
          <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-700 dark:text-emerald-300">
            Saved.
          </p>
        ) : null}

        <div className="flex items-center justify-end border-t border-border pt-4">
          <Button type="submit" disabled={busy}>
            {busy ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-4 w-4" strokeWidth={1.75} />
            )}
            <span className="font-mono text-[10px] uppercase tracking-widest">
              Save changes
            </span>
          </Button>
        </div>
      </section>

      <aside className="h-fit space-y-4 rounded-xl border border-border bg-bg-subtle p-5">
        <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          // Account
        </p>
        <Detail label="Email" value={profile.email ?? "—"} mono />
        <Detail
          label="Status"
          value={
            <Badge mono tone={profile.status === "active" ? "success" : "warning"}>
              {profile.status}
            </Badge>
          }
        />
        <Detail
          label="Created"
          value={new Date(profile.createdAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric"
          })}
        />
        <Detail
          label="Updated"
          value={new Date(profile.updatedAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric"
          })}
        />
        {profile.isSuperAdmin ? (
          <Detail
            label="Super admin"
            value={<Badge mono tone="info">yes</Badge>}
          />
        ) : null}
        <p className="border-t border-border pt-3 text-[11px] text-fg-muted">
          Identity fields on your person record (DOB, USA Hockey ID, emergency
          contact) are managed via the registration funnel + Compliance page.
        </p>
      </aside>

      <style>{`
        .input {
          height: 2.5rem;
          width: 100%;
          border-radius: 0.375rem;
          border: 1px solid var(--border);
          background: var(--surface-1);
          padding: 0 0.75rem;
          color: var(--fg);
          font-size: 13px;
        }
        .input:focus {
          outline: none;
          border-color: var(--accent);
        }
      `}</style>
    </form>
  );
}

function SectionHeader({ title, hint }: { title: string; hint: string }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        // {title}
      </p>
      <p className="mt-1 text-[12px] text-fg-muted">{hint}</p>
    </div>
  );
}

function Field({
  label,
  hint,
  children
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="block text-[11px] text-fg-muted">{hint}</span>
      ) : null}
    </label>
  );
}

function Detail({
  label,
  value,
  mono
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        {label}
      </p>
      <div className={mono ? "mt-1 font-mono text-[12px] text-fg" : "mt-1 text-[12px] text-fg"}>
        {value}
      </div>
    </div>
  );
}
