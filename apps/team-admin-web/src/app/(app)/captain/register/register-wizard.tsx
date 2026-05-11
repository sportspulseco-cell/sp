"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Mail,
  Pencil,
  Plus,
  Trophy,
  UserCheck,
  Users,
  X
} from "lucide-react";
import { Badge, Button, EmptyState, Field, Input } from "@sportspulse/ui";
import type { Team } from "@sportspulse/api-client";
import { leagueMgmt } from "@/lib/api/browser-api";

type StepIndex = 1 | 2 | 3 | 4;

const STEP_LABELS: Record<StepIndex, string> = {
  1: "Team details",
  2: "Division",
  3: "Roster",
  4: "Dues"
};

interface DivisionItem {
  id: string;
  name: string;
  tier: string | null;
  genderEligibility: string;
  maxTeams: number | null;
  currentTeamCount: number;
  pricing: {
    tierId: string;
    name: string;
    currency: string;
    fullPriceCents: number;
    paymentPlanEnabled: boolean;
    depositCents: number;
    installmentCount: number;
    installmentIntervalDays: number;
  } | null;
}

interface InvitedEmail {
  /** Stable key for React. */
  id: string;
  email: string;
}

/**
 * Workflow 7A Phase 2 · the captain rollover wizard.
 *
 * Lifts every step's state into this one component (no draft-persist
 * server-side yet — Sprint 4). The 4 nodes on the left rail are the
 * single source of progression; clicking back is always allowed,
 * advancing requires the current step's gate to be satisfied.
 *
 * Step 4 (dues split + atomic submit + confirmation watcher) is the
 * final piece — Sprint 3 ships steps 1-3 plus a step-4 placeholder
 * that tells the captain exactly what's coming next.
 */
export function RegisterWizard({
  team,
  season,
  league,
  divisions,
  thresholdCents
}: {
  team: Team;
  season: { id: string; name: string; registrationClosesAt: string | null };
  league: { id: string; name: string };
  divisions: DivisionItem[];
  thresholdCents: number;
}) {
  const [step, setStep] = useState<StepIndex>(1);

  // ----- step 1 state ------------------------------------------------
  const [teamName, setTeamName] = useState(team.name);
  const [shortName, setShortName] = useState(team.shortName ?? "");
  const [homeRink, setHomeRink] = useState(team.homeRink ?? "");
  const [editing, setEditing] = useState<{
    name: boolean;
    shortName: boolean;
    homeRink: boolean;
  }>({ name: false, shortName: false, homeRink: false });
  const [savingTeam, setSavingTeam] = useState(false);
  const step1Valid = teamName.trim().length > 0;

  async function saveTeamField(
    field: "name" | "shortName" | "homeRink",
    value: string
  ) {
    setSavingTeam(true);
    try {
      await leagueMgmt.updateTeam(team.id, {
        [field]: value || (field === "name" ? value : null)
      });
    } catch (e) {
      console.error("Could not save team field", field, e);
    } finally {
      setSavingTeam(false);
      setEditing((s) => ({ ...s, [field]: false }));
    }
  }

  // ----- step 2 state ------------------------------------------------
  const [divisionId, setDivisionId] = useState<string | null>(null);
  const division = useMemo(
    () => divisions.find((d) => d.id === divisionId) ?? null,
    [divisions, divisionId]
  );
  const step2Valid = !!division;

  // ----- step 3 state ------------------------------------------------
  // No returning-roster API in this sprint; use a manual email invite
  // list. The "returning players" checklist gets wired once we add the
  // last-season roster query.
  const [invitedEmails, setInvitedEmails] = useState<InvitedEmail[]>([]);
  const [emailDraft, setEmailDraft] = useState("");
  const maxRoster = 25;
  const rosterCount = invitedEmails.length;
  const step3Valid = rosterCount > 0;

  function addEmail() {
    const e = emailDraft.trim().toLowerCase();
    if (!e) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return;
    if (invitedEmails.some((x) => x.email === e)) {
      setEmailDraft("");
      return;
    }
    if (rosterCount >= maxRoster) return;
    setInvitedEmails((prev) => [
      ...prev,
      { id: `${Date.now()}-${e}`, email: e }
    ]);
    setEmailDraft("");
  }

  function removeEmail(id: string) {
    setInvitedEmails((prev) => prev.filter((x) => x.id !== id));
  }

  const stepGates: Record<StepIndex, boolean> = {
    1: step1Valid,
    2: step2Valid,
    3: step3Valid,
    4: true
  };

  function goNext() {
    if (step < 4 && stepGates[step]) {
      setStep((step + 1) as StepIndex);
    }
  }
  function goBack() {
    if (step > 1) setStep((step - 1) as StepIndex);
  }

  const closesAt = season.registrationClosesAt
    ? new Date(season.registrationClosesAt)
    : null;
  const daysLeft = closesAt
    ? Math.max(
        0,
        Math.ceil((closesAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      )
    : null;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.22em] text-fg-muted">
          <span className="text-fg-subtle">//</span>
          <span>rollover</span>
          <span className="text-fg-subtle">·</span>
          <span>{league.name}</span>
          <span className="text-fg-subtle">·</span>
          <span>{season.name}</span>
        </p>
        <h1 className="max-w-[28ch] text-balance font-sans text-[clamp(28px,3.6vw,44px)] font-semibold leading-[0.98] tracking-tighter text-fg">
          Register {team.name} for the season
        </h1>
        {daysLeft !== null ? (
          <p className="text-[13px] text-fg-muted">
            Registration closes in{" "}
            <span className="font-mono text-fg">
              {daysLeft === 0
                ? "today"
                : `${daysLeft} day${daysLeft === 1 ? "" : "s"}`}
            </span>
            . You can save and exit any time — Sprint 4 will persist the
            draft server-side; for now stay on this tab to keep your
            progress.
          </p>
        ) : null}
      </header>

      <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
        <StepRail step={step} onJump={(s) => setStep(s)} />

        <main className="min-w-0 space-y-6">
          {step === 1 ? (
            <StepCard
              title="Confirm your team"
              subtitle="Pre-filled from your team record. Click the pencil to edit a field — changes save immediately."
            >
              <EditableRow
                label="Team name"
                value={teamName}
                editing={editing.name}
                busy={savingTeam}
                onStart={() => setEditing((s) => ({ ...s, name: true }))}
                onCancel={() => {
                  setTeamName(team.name);
                  setEditing((s) => ({ ...s, name: false }));
                }}
                onSave={() => saveTeamField("name", teamName.trim())}
                onChange={setTeamName}
              />
              <EditableRow
                label="Short name"
                value={shortName}
                placeholder="LM"
                editing={editing.shortName}
                busy={savingTeam}
                onStart={() => setEditing((s) => ({ ...s, shortName: true }))}
                onCancel={() => {
                  setShortName(team.shortName ?? "");
                  setEditing((s) => ({ ...s, shortName: false }));
                }}
                onSave={() => saveTeamField("shortName", shortName.trim())}
                onChange={(v) => setShortName(v.toUpperCase().slice(0, 6))}
              />
              <EditableRow
                label="Home rink"
                value={homeRink}
                placeholder="—"
                editing={editing.homeRink}
                busy={savingTeam}
                onStart={() => setEditing((s) => ({ ...s, homeRink: true }))}
                onCancel={() => {
                  setHomeRink(team.homeRink ?? "");
                  setEditing((s) => ({ ...s, homeRink: false }));
                }}
                onSave={() => saveTeamField("homeRink", homeRink.trim())}
                onChange={setHomeRink}
              />
              <div className="mt-2 flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/[0.06] px-3 py-2 text-[12px] text-emerald-700 dark:text-emerald-300">
                <Check className="h-3.5 w-3.5" strokeWidth={2} />
                Captain: <span className="font-medium">that's you</span> ·
                already assigned — no re-entry needed.
              </div>
            </StepCard>
          ) : null}

          {step === 2 ? (
            <StepCard
              title="Pick your division"
              subtitle="Each card shows the seasonal fee + capacity. Selecting one reveals the payment-plan timeline below."
            >
              <div className="grid gap-3 sm:grid-cols-2">
                {divisions.map((d) => (
                  <DivisionCard
                    key={d.id}
                    division={d}
                    selected={d.id === divisionId}
                    onSelect={() => setDivisionId(d.id)}
                  />
                ))}
              </div>
              {division ? (
                <PricingTimeline division={division} />
              ) : null}
            </StepCard>
          ) : null}

          {step === 3 ? (
            <StepCard
              title="Build the roster"
              subtitle="Invite your players by email. Each will receive a personal link that pre-fills the registration funnel and skips re-entry of personal details."
            >
              <div>
                <p className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.22em] text-fg-muted">
                  <span>capacity</span>
                  <span className="tabular-nums">
                    {rosterCount} / {maxRoster}
                  </span>
                </p>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-bg-subtle">
                  <div
                    className={
                      rosterCount >= maxRoster
                        ? "h-full bg-rose-500 transition-all"
                        : rosterCount >= maxRoster - 3
                          ? "h-full bg-amber-500 transition-all"
                          : "h-full bg-emerald-500 transition-all"
                    }
                    style={{
                      width: `${Math.min(100, (rosterCount / maxRoster) * 100)}%`
                    }}
                  />
                </div>
              </div>

              <Field label="Add players by email">
                <div className="flex items-center gap-2">
                  <Input
                    value={emailDraft}
                    onChange={(e) => setEmailDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === ",") {
                        e.preventDefault();
                        addEmail();
                      }
                    }}
                    placeholder="player@example.com — Enter or comma to add"
                    type="email"
                  />
                  <Button
                    type="button"
                    onClick={addEmail}
                    disabled={!emailDraft.trim()}
                  >
                    <Plus className="mr-1.5 h-3.5 w-3.5" strokeWidth={2} />
                    Add
                  </Button>
                </div>
              </Field>

              {invitedEmails.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title="No players invited yet"
                  description="Add at least one email to continue. We'll send a personal sign-up link to each address on submit."
                />
              ) : (
                <ul className="space-y-1.5">
                  {invitedEmails.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-bg-subtle px-3 py-2"
                    >
                      <span className="flex items-center gap-2 truncate">
                        <Mail className="h-3.5 w-3.5 shrink-0 text-fg-muted" strokeWidth={1.75} />
                        <span className="truncate text-[13px] text-fg">
                          {p.email}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => removeEmail(p.id)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg"
                        aria-label={`Remove ${p.email}`}
                      >
                        <X className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </StepCard>
          ) : null}

          {step === 4 ? (
            <StepCard
              title="Dues split"
              subtitle="Sprint 4 lands here — atomic 8-write submit, dues-split toggle, and the confirmation-threshold watcher."
            >
              <SummaryBlock
                team={team}
                division={division}
                invites={invitedEmails}
                thresholdCents={thresholdCents}
              />
              <div className="rounded-md border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 text-[12px] text-amber-700 dark:text-amber-300">
                The split editor + submit transaction land in the next
                push. For now this step is read-only — review and use
                Back to fix anything.
              </div>
            </StepCard>
          ) : null}

          <Footer
            step={step}
            canAdvance={stepGates[step]}
            onBack={goBack}
            onNext={goNext}
          />
        </main>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Step rail
 * -------------------------------------------------------------------------*/

function StepRail({
  step,
  onJump
}: {
  step: StepIndex;
  onJump: (s: StepIndex) => void;
}) {
  const items: StepIndex[] = [1, 2, 3, 4];
  return (
    <aside className="hidden lg:block">
      <ol className="space-y-px">
        {items.map((s, i) => {
          const isActive = s === step;
          const isDone = s < step;
          const canJump = isDone;
          return (
            <li key={s}>
              <button
                type="button"
                onClick={() => canJump && onJump(s)}
                disabled={!canJump && !isActive}
                className={
                  isActive
                    ? "group relative flex w-full items-center gap-3 rounded-md px-3 py-2 text-left"
                    : canJump
                      ? "group flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-surface-2"
                      : "group flex w-full items-center gap-3 rounded-md px-3 py-2 text-left opacity-60"
                }
              >
                <span
                  className={
                    isDone
                      ? "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500 font-mono text-[10px] tabular-nums text-white"
                      : isActive
                        ? "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[--accent] font-mono text-[10px] tabular-nums text-bg"
                        : "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-bg-subtle font-mono text-[10px] tabular-nums text-fg-muted"
                  }
                >
                  {isDone ? (
                    <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                  ) : (
                    String(s).padStart(2, "0")
                  )}
                </span>
                <span
                  className={
                    isActive
                      ? "text-[13px] font-medium text-fg"
                      : "text-[13px] text-fg-muted"
                  }
                >
                  {STEP_LABELS[s]}
                </span>
              </button>
              {i < items.length - 1 ? (
                <div className="ml-[26px] h-3 w-px bg-border" />
              ) : null}
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

/* -------------------------------------------------------------------------
 * Step card wrapper
 * -------------------------------------------------------------------------*/

function StepCard({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface-1 p-6">
      <header>
        <h2 className="text-[18px] font-semibold tracking-tight text-fg">
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-1 text-[13px] text-fg-muted">{subtitle}</p>
        ) : null}
      </header>
      <div className="mt-6 space-y-4">{children}</div>
    </section>
  );
}

/* -------------------------------------------------------------------------
 * Editable row (step 1)
 * -------------------------------------------------------------------------*/

function EditableRow({
  label,
  value,
  placeholder,
  editing,
  busy,
  onStart,
  onCancel,
  onSave,
  onChange
}: {
  label: string;
  value: string;
  placeholder?: string;
  editing: boolean;
  busy: boolean;
  onStart: () => void;
  onCancel: () => void;
  onSave: () => void;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-bg-subtle px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-fg-muted">
          {label}
        </p>
        {editing ? (
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            autoFocus
            placeholder={placeholder}
            className="mt-1"
          />
        ) : (
          <p className="mt-0.5 truncate text-[14px] text-fg">
            {value || (
              <span className="text-fg-muted">{placeholder ?? "—"}</span>
            )}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        {editing ? (
          <>
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg"
              aria-label="Cancel"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={busy}
              className="inline-flex h-7 items-center gap-1 rounded-md bg-fg px-2.5 font-mono text-[10px] uppercase tracking-[0.18em] text-bg hover:opacity-90"
            >
              <Check className="h-3 w-3" strokeWidth={2} /> Save
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onStart}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg"
            aria-label={`Edit ${label}`}
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Division card + pricing timeline (step 2)
 * -------------------------------------------------------------------------*/

function DivisionCard({
  division,
  selected,
  onSelect
}: {
  division: DivisionItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const fee = division.pricing
    ? `${(division.pricing.fullPriceCents / 100).toFixed(0)}`
    : "—";
  const full =
    division.maxTeams !== null &&
    division.currentTeamCount >= division.maxTeams;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={
        selected
          ? "relative flex flex-col gap-2 rounded-xl border-2 border-[--accent] bg-surface-1 p-4 text-left ring-1 ring-[--accent]/30"
          : "relative flex flex-col gap-2 rounded-xl border border-border bg-surface-1 p-4 text-left hover:border-fg-muted"
      }
    >
      {selected ? (
        <span className="absolute right-3 top-3 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[--accent] text-bg">
          <Check className="h-3 w-3" strokeWidth={2.5} />
        </span>
      ) : null}
      <p className="font-semibold tracking-tight text-fg">{division.name}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {division.tier ? <Badge mono>Tier {division.tier}</Badge> : null}
        <Badge mono>{division.genderEligibility}</Badge>
        {full ? <Badge mono tone="warning">Waitlist</Badge> : null}
      </div>
      <p className="mt-1 flex items-center justify-between text-[12px] text-fg-muted">
        <span>
          {division.currentTeamCount}
          {division.maxTeams ? ` / ${division.maxTeams}` : ""} teams
        </span>
        <span className="font-mono text-fg">${fee}</span>
      </p>
    </button>
  );
}

function PricingTimeline({ division }: { division: DivisionItem }) {
  const p = division.pricing;
  if (!p) {
    return (
      <p className="rounded-md border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 text-[12px] text-amber-700 dark:text-amber-300">
        No pricing tier configured for this division. League admin must add
        one before you can submit.
      </p>
    );
  }
  const installments: { label: string; amount: number; due: string }[] = [];
  if (p.paymentPlanEnabled && p.installmentCount > 0) {
    const remaining = p.fullPriceCents - p.depositCents;
    const each = Math.round(remaining / p.installmentCount);
    installments.push({
      label: "Deposit",
      amount: p.depositCents,
      due: "today"
    });
    for (let i = 1; i <= p.installmentCount; i++) {
      installments.push({
        label: `Installment ${i}`,
        amount: each,
        due: `+${p.installmentIntervalDays * i}d`
      });
    }
  } else {
    installments.push({
      label: "Full payment",
      amount: p.fullPriceCents,
      due: "today"
    });
  }
  return (
    <div className="rounded-xl border border-border bg-bg-subtle p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-fg-muted">
        pricing · {p.name}
      </p>
      <ol className="mt-3 grid gap-2 sm:grid-cols-4">
        {installments.map((i, idx) => (
          <li
            key={idx}
            className="rounded-lg border border-border bg-surface-1 px-3 py-2"
          >
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-fg-muted">
              {i.label}
            </p>
            <p className="mt-1 font-mono text-[15px] tabular-nums text-fg">
              ${(i.amount / 100).toFixed(2)}
            </p>
            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-fg-muted">
              due · {i.due}
            </p>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[12px] text-fg-muted">
        Total{" "}
        <span className="font-mono text-fg">
          ${(p.fullPriceCents / 100).toFixed(2)}
        </span>{" "}
        · currency{" "}
        <span className="font-mono uppercase text-fg">{p.currency}</span>
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Step 4 summary block
 * -------------------------------------------------------------------------*/

function SummaryBlock({
  team,
  division,
  invites,
  thresholdCents
}: {
  team: Team;
  division: DivisionItem | null;
  invites: InvitedEmail[];
  thresholdCents: number;
}) {
  return (
    <dl className="grid gap-2 sm:grid-cols-2">
      <Row label="Team" value={team.name} icon={<Users className="h-3 w-3" strokeWidth={1.75} />} />
      <Row
        label="Division"
        value={division ? division.name : "—"}
        icon={<Trophy className="h-3 w-3" strokeWidth={1.75} />}
      />
      <Row
        label="Fee"
        value={
          division?.pricing
            ? `$${(division.pricing.fullPriceCents / 100).toFixed(2)}`
            : "—"
        }
      />
      <Row
        label="Confirmation threshold"
        value={`$${(thresholdCents / 100).toFixed(2)}`}
      />
      <Row
        label="Players invited"
        value={`${invites.length}`}
        icon={<UserCheck className="h-3 w-3" strokeWidth={1.75} />}
      />
    </dl>
  );
}

function Row({
  label,
  value,
  icon
}: {
  label: string;
  value: string;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-bg-subtle px-3 py-2">
      <dt className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.22em] text-fg-muted">
        {icon}
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-[13px] text-fg">{value}</dd>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Footer
 * -------------------------------------------------------------------------*/

function Footer({
  step,
  canAdvance,
  onBack,
  onNext
}: {
  step: StepIndex;
  canAdvance: boolean;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <footer className="flex items-center justify-between gap-3 border-t border-border pt-4">
      <Button
        type="button"
        variant="ghost"
        onClick={onBack}
        disabled={step === 1}
      >
        <ArrowLeft className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.75} />
        <span className="font-mono text-[10px] uppercase tracking-[0.18em]">
          Back
        </span>
      </Button>
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-fg-muted">
        step {step} / 4
      </p>
      {step < 4 ? (
        <Button type="button" onClick={onNext} disabled={!canAdvance}>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em]">
            Next
          </span>
          <ArrowRight className="ml-1.5 h-3.5 w-3.5" strokeWidth={1.75} />
        </Button>
      ) : (
        <Button type="button" disabled>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em]">
            Submit · sprint 4
          </span>
        </Button>
      )}
    </footer>
  );
}
