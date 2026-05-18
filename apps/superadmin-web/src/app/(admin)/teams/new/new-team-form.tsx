"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  Check,
  Loader2,
  Search,
  ShieldCheck,
  Sparkles,
  X
} from "lucide-react";
import { Button } from "@sportspulse/ui";
import type { Org, Profile, Sport } from "@/lib/api/types";
import { iam, leagueMgmt } from "@/lib/api/browser-api";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

/**
 * Workflow 7A Phase 1 · /teams/new client form.
 *
 * One-screen layout split into four sections:
 *
 *   1. Identity      — name (required), short name (auto-derived),
 *                      home rink, sport.
 *   2. Branding      — logo URL, primary + secondary hex colours.
 *                      Live preview card on the right.
 *   3. Captain       — type-ahead search on iam.listUsers({search}).
 *                      Selecting a user creates the captain role
 *                      assignment + sets teams.captainUserId in one
 *                      transaction on submit.
 *   4. Confirmation  — minimum deposit (dollars) to flip a future
 *                      division entry from `applied` → `confirmed`.
 *                      0 = auto-confirm.
 *
 * On submit: POST /league/teams. On 409 conflict (duplicate name), the
 * form shows an inline error with a "Use existing team" deep-link
 * built from the server's `existingTeamId` payload.
 */
export function NewTeamForm({
  orgs,
  sports,
  defaultOrgId
}: {
  orgs: Org[];
  sports: Sport[];
  defaultOrgId: string;
}) {
  const router = useRouter();

  // ---- Identity ------------------------------------------------------
  const [orgId, setOrgId] = useState<string>(defaultOrgId);
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [shortNameTouched, setShortNameTouched] = useState(false);
  const [homeRink, setHomeRink] = useState("");
  const [sportCode, setSportCode] = useState<string>(sports[0]?.code ?? "");

  // ---- Branding ------------------------------------------------------
  const [logoUrl, setLogoUrl] = useState("");
  const [primary, setPrimary] = useState("#635bff");
  const [secondary, setSecondary] = useState("#0a0a0a");

  // ---- Captain (optional) -------------------------------------------
  const [captain, setCaptain] = useState<Profile | null>(null);
  const [captainQuery, setCaptainQuery] = useState("");
  const [captainResults, setCaptainResults] = useState<Profile[]>([]);
  const [captainSearchOpen, setCaptainSearchOpen] = useState(false);
  const [captainSearching, setCaptainSearching] = useState(false);

  // ---- Confirmation threshold (dollars in UI, cents server-side) ----
  const [thresholdDollars, setThresholdDollars] = useState("0");

  // ---- Submit state -------------------------------------------------
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingTeamId, setExistingTeamId] = useState<string | null>(null);

  const org = useMemo(
    () => orgs.find((o) => o.id === orgId) ?? null,
    [orgs, orgId]
  );

  // Auto-derive shortName from name unless the admin has typed one.
  useEffect(() => {
    if (shortNameTouched) return;
    const initials = name
      .split(/\s+/)
      .map((word) => word.replace(/[^a-z0-9]/gi, "")[0] ?? "")
      .filter(Boolean)
      .slice(0, 6)
      .join("")
      .toUpperCase();
    setShortName(initials);
  }, [name, shortNameTouched]);

  // Debounced captain search.
  useEffect(() => {
    if (!captainSearchOpen) return;
    const trimmed = captainQuery.trim();
    if (trimmed.length < 2) {
      setCaptainResults([]);
      return;
    }
    let cancelled = false;
    setCaptainSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await iam.listUsers({ search: trimmed, limit: 8 });
        if (!cancelled) setCaptainResults(res.items);
      } catch {
        if (!cancelled) setCaptainResults([]);
      } finally {
        if (!cancelled) setCaptainSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [captainQuery, captainSearchOpen]);

  const valid = name.trim().length > 0 && !!sportCode && !!orgId;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(null);
    setExistingTeamId(null);

    const cleanShort = shortName.trim() || null;
    const cleanRink = homeRink.trim() || null;
    const cleanLogo = logoUrl.trim() || null;
    const cents = Math.max(0, Math.round(parseFloat(thresholdDollars || "0") * 100));

    try {
      const created = await leagueMgmt.createTeam({
        orgId,
        name: name.trim(),
        sportCode,
        shortName: cleanShort,
        logoUrl: cleanLogo,
        homeRink: cleanRink,
        colors: { primary, secondary },
        captainUserId: captain?.id,
        confirmationThresholdCents: cents
      });
      router.push(`/teams/${created.id}`);
      router.refresh();
    } catch (err) {
      const e = err as Error & {
        status?: number;
        body?: string;
      };
      // 409 duplicate guard. The API client rewrites Error#message to
      // the server's human string ("A team with this name…") and
      // stashes the raw body on err.body — parse THAT so we can pull
      // existingTeamId and render the "Use existing team" deep link.
      if (e.status === 409 && typeof e.body === "string") {
        try {
          const parsed = JSON.parse(e.body);
          const dup = (parsed?.errors as Array<{ existingTeamId?: string }>)?.[0];
          if (dup?.existingTeamId) {
            setExistingTeamId(dup.existingTeamId);
            setError(
              "A team with this name already exists in this organisation."
            );
            setBusy(false);
            return;
          }
        } catch {
          // fall through to generic error
        }
      }
      setError(e.message || "Could not create team.");
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]"
    >
      {/* LEFT — form sections */}
      <div className="space-y-6">
        <Section
          title="Identity"
          subtitle="Org-level record. The team keeps this name across every season."
        >
          <Field label="Organisation *">
            <Select
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
              required
            >
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.displayName}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Team name *">
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
                setExistingTeamId(null);
              }}
              onBlur={() => setName((n) => n.trim())}
              placeholder="Lock Monsters"
              maxLength={120}
              required
            />
          </Field>

          {existingTeamId ? (
            <div className="flex items-center justify-between gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-300">
              <span className="flex items-center gap-2">
                <AlertCircle className="h-3.5 w-3.5" strokeWidth={1.75} />
                A team with this name already exists in this organisation.
              </span>
              <Link
                href={`/teams/${existingTeamId}`}
                className="inline-flex h-6 items-center gap-1 rounded-md border border-amber-500/40 bg-bg/40 px-2 font-mono text-[10px] uppercase tracking-[0.18em] text-amber-700 hover:bg-bg dark:text-amber-300"
              >
                Use existing team
                <ArrowRight className="h-3 w-3" strokeWidth={2} />
              </Link>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Short name"
              hint="Auto-derived from team name. Max 6 chars."
            >
              <Input
                value={shortName}
                onChange={(e) => {
                  setShortName(e.target.value.toUpperCase().slice(0, 6));
                  setShortNameTouched(true);
                }}
                placeholder="LM"
                maxLength={6}
              />
            </Field>
            <Field label="Home rink" hint="Optional. Used by the scheduler.">
              <Input
                value={homeRink}
                onChange={(e) => setHomeRink(e.target.value)}
                placeholder="Belmont Hill Arena"
                maxLength={120}
              />
            </Field>
          </div>

          <Field label="Sport *">
            <Select
              value={sportCode}
              onChange={(e) => setSportCode(e.target.value)}
              required
            >
              {sports.length === 0 ? (
                <option value="">— no sports seeded —</option>
              ) : (
                sports.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name}
                  </option>
                ))
              )}
            </Select>
          </Field>
        </Section>

        <Section
          title="Branding"
          subtitle="Logo + brand colours feed every standings card, fixture sheet, and team page."
        >
          <Field
            label="Logo URL"
            hint="PNG/JPG hosted in media storage. File uploader lands in a follow-up."
          >
            <Input
              type="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://…/lock-monsters.png"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Primary colour">
              <ColorPicker value={primary} onChange={setPrimary} />
            </Field>
            <Field label="Secondary colour">
              <ColorPicker value={secondary} onChange={setSecondary} />
            </Field>
          </div>
        </Section>

        <Section
          title="Captain assignment"
          subtitle="Optional but recommended. Captain will receive a notification when the team is created and gain access to the rollover wizard each season."
        >
          {captain ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-bg-subtle px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-fg text-[11px] font-semibold text-bg">
                  {(captain.displayName ?? captain.email ?? "C")
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-fg">
                    {captain.displayName ??
                      `${captain.legalFirstName ?? ""} ${captain.legalLastName ?? ""}`.trim() ??
                      captain.email}
                  </p>
                  <p className="truncate font-mono text-[10px] uppercase tracking-[0.18em] text-fg-muted">
                    {captain.email}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCaptain(null);
                  setCaptainQuery("");
                  setCaptainResults([]);
                }}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-fg-muted hover:border-fg-muted hover:text-fg"
                aria-label="Remove captain"
              >
                <X className="h-3.5 w-3.5" strokeWidth={1.75} />
              </button>
            </div>
          ) : (
            <CaptainSearch
              query={captainQuery}
              results={captainResults}
              loading={captainSearching}
              open={captainSearchOpen}
              onQueryChange={setCaptainQuery}
              onOpenChange={setCaptainSearchOpen}
              onSelect={(u) => {
                setCaptain(u);
                setCaptainSearchOpen(false);
              }}
            />
          )}
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-fg-muted">
            captain · scope = team
          </p>
        </Section>

        <Section
          title="Confirmation threshold"
          subtitle="Minimum deposit total before a division entry flips from `applied` to `confirmed`. Set to $0 to auto-confirm on entry."
        >
          <Field
            label="Threshold (USD)"
            hint="Whole dollars. Stored as cents server-side. Must be ≤ the team registration fee."
          >
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[12px] text-fg-muted">
                $
              </span>
              <Input
                type="number"
                min={0}
                step={1}
                value={thresholdDollars}
                onChange={(e) => setThresholdDollars(e.target.value)}
                className="pl-7"
                placeholder="0"
              />
            </div>
          </Field>
        </Section>

        {error ? (
          <p className="rounded-md bg-rose-500/10 px-3 py-2 text-[12px] text-rose-700 dark:text-rose-300">
            {error}
          </p>
        ) : null}

        <footer className="flex items-center justify-end gap-3 border-t border-border pt-6">
          <Button type="button" variant="ghost" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={!valid || busy}>
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" strokeWidth={1.75} />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" strokeWidth={1.75} />
            )}
            <span className="font-mono text-[11px] uppercase tracking-[0.18em]">
              Create team
            </span>
          </Button>
        </footer>
      </div>

      {/* RIGHT — live preview rail */}
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-xl border border-border bg-bg-subtle p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-fg-muted">
            // preview
          </p>
          <TeamPreviewCard
            name={name || "Team name"}
            shortName={shortName || "—"}
            primary={primary}
            secondary={secondary}
            logoUrl={logoUrl}
            homeRink={homeRink}
            org={org}
            captain={captain}
          />
          <ul className="mt-5 space-y-2 text-[12px] text-fg-muted">
            <li className="flex items-center gap-2">
              <Check className="h-3 w-3 text-emerald-600" strokeWidth={2.5} />
              <span>Persistent across all seasons</span>
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-3 w-3 text-emerald-600" strokeWidth={2.5} />
              <span>Captain runs each season's rollover wizard</span>
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-3 w-3 text-emerald-600" strokeWidth={2.5} />
              <span>Division entries belong to the season, not the team</span>
            </li>
          </ul>
        </div>
      </aside>
    </form>
  );
}

/* -------------------------------------------------------------------------
 * Section card
 * -------------------------------------------------------------------------*/

function Section({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-xl border border-border bg-surface-1 p-6">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-fg-muted">
          // {title.toLowerCase()}
        </p>
        <h2 className="mt-1 text-[16px] font-semibold tracking-tight text-fg">
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-1 max-w-2xl text-[12px] text-fg-muted">{subtitle}</p>
        ) : null}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

/* -------------------------------------------------------------------------
 * Captain type-ahead search
 * -------------------------------------------------------------------------*/

function CaptainSearch({
  query,
  results,
  loading,
  open,
  onQueryChange,
  onOpenChange,
  onSelect
}: {
  query: string;
  results: Profile[];
  loading: boolean;
  open: boolean;
  onQueryChange: (q: string) => void;
  onOpenChange: (open: boolean) => void;
  onSelect: (u: Profile) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onOpenChange(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, onOpenChange]);

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-fg-muted"
          strokeWidth={1.75}
        />
        <Input
          value={query}
          onChange={(e) => {
            onQueryChange(e.target.value);
            onOpenChange(true);
          }}
          onFocus={() => onOpenChange(true)}
          placeholder="Search users by name or email…"
          className="pl-9"
        />
      </div>
      {open ? (
        <div className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-border bg-surface-1 shadow-md">
          {query.trim().length < 2 ? (
            <p className="px-4 py-3 text-[12px] text-fg-muted">
              Type at least 2 characters to search.
            </p>
          ) : loading ? (
            <p className="flex items-center gap-2 px-4 py-3 text-[12px] text-fg-muted">
              <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.75} />
              Searching…
            </p>
          ) : results.length === 0 ? (
            <p className="px-4 py-3 text-[12px] text-fg-muted">
              No matching users.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {results.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(u)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-bg-subtle"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-fg text-[11px] font-semibold text-bg">
                      {(u.displayName ?? u.email ?? "U")
                        .slice(0, 2)
                        .toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-fg">
                        {u.displayName ??
                          `${u.legalFirstName ?? ""} ${u.legalLastName ?? ""}`.trim() ??
                          u.email}
                      </p>
                      <p className="truncate font-mono text-[10px] uppercase tracking-[0.18em] text-fg-muted">
                        {u.email}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Color picker
 * -------------------------------------------------------------------------*/

function ColorPicker({
  value,
  onChange
}: {
  value: string;
  onChange: (hex: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-12 cursor-pointer rounded-md border border-border bg-bg-subtle"
        aria-label="Pick color"
      />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="#635bff"
        maxLength={9}
        className="font-mono text-[12px]"
      />
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Live team card preview
 * -------------------------------------------------------------------------*/

function TeamPreviewCard({
  name,
  shortName,
  primary,
  secondary,
  logoUrl,
  homeRink,
  org,
  captain
}: {
  name: string;
  shortName: string;
  primary: string;
  secondary: string;
  logoUrl: string;
  homeRink: string;
  org: Org | null;
  captain: Profile | null;
}) {
  return (
    <div
      className="mt-4 overflow-hidden rounded-xl border"
      style={{ borderColor: `${primary}55`, background: `${primary}0d` }}
    >
      <div
        className="flex items-center gap-3 px-4 py-4"
        style={{ background: primary, color: secondary }}
      >
        {logoUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={logoUrl}
            alt=""
            className="h-12 w-12 shrink-0 rounded-md bg-white/90 object-contain p-1"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md font-mono text-[14px] font-semibold"
            style={{ background: secondary, color: primary }}
          >
            {shortName}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-[16px] font-semibold tracking-tight">
            {name}
          </p>
          <p className="truncate font-mono text-[10px] uppercase tracking-[0.18em] opacity-80">
            {shortName}
          </p>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-px bg-border">
        <DefRow
          label="Org"
          value={org?.displayName ?? "—"}
        />
        <DefRow label="Home rink" value={homeRink || "—"} />
        <DefRow
          label="Captain"
          value={
            captain
              ? (captain.displayName ?? captain.email ?? "—")
              : "Unassigned"
          }
        />
        <DefRow
          label="Status"
          value={<span className="flex items-center gap-1.5"><ShieldCheck className="h-3 w-3" strokeWidth={2} /> Active</span>}
        />
      </dl>
    </div>
  );
}

function DefRow({
  label,
  value
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="bg-surface-1 px-3 py-2">
      <dt className="font-mono text-[9px] uppercase tracking-[0.22em] text-fg-muted">
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-[12px] text-fg">{value}</dd>
    </div>
  );
}
