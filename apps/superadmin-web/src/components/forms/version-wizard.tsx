"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CalendarRange,
  Check,
  CircleDollarSign,
  Eye,
  FileText,
  Layers,
  Loader2,
  Mail,
  Send,
  Settings2,
  type LucideIcon
} from "lucide-react";
import {
  emptyFormDefinition,
  SYSTEM_ROLE_BY_CODE,
  validateFormDefinition,
  type FormDefinition
} from "@sportspulse/kernel";
import { FormRenderer } from "@sportspulse/registration-funnel";
import type { RegistrationForm } from "@/lib/api/types";
import type {
  Division,
  EmailTemplate,
  PricingTier,
  Season
} from "@/lib/api/sdk";
import { leagueMgmt, registration, registrationV2 } from "@/lib/api/browser-api";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { FormBuilder } from "@/components/forms/form-builder";
import { PricingTab } from "@/components/registrations/tabs/pricing-tab";
import { EmailTemplatesTab } from "@/components/registrations/tabs/email-templates-tab";

/**
 * Multi-step wizard for creating + publishing a new registration_form_version.
 * Layout matches SP Mocks (Registration Creation tab): left sidebar with
 * 5 numbered steps + status indicators, right main area renders the
 * current step. Sticky topbar shows form name, draft badge, Preview +
 * Publish actions.
 *
 * Step contracts:
 *   1. Form info     — read-only summary (set in CreateFormButton);
 *                      edit links route to /forms (rename action).
 *   2. Form fields   — wraps <FormBuilder>. Persistence target.
 *   3. Eligibility   — review applies-to-roles + scope summary.
 *   4. Notifications — link to /communications/templates editor.
 *   5. Review        — preview + Publish. POST creates a draft version
 *                      then immediately publishes (locks + sets active).
 *                      Save-as-draft skips the publish step.
 */

type StepKey =
  | "info"
  | "fields"
  | "eligibility"
  | "pricing"
  | "notifications"
  | "review";

interface StepDef {
  id: StepKey;
  index: number;
  title: string;
  subtitle: string;
  icon: LucideIcon;
}

const STEPS: StepDef[] = [
  {
    id: "info",
    index: 1,
    title: "Form info",
    subtitle: "Name, scope, purpose",
    icon: Settings2
  },
  {
    id: "fields",
    index: 2,
    title: "Form fields",
    subtitle: "Questions + conditional logic",
    icon: FileText
  },
  {
    id: "eligibility",
    index: 3,
    title: "Eligibility",
    subtitle: "Who this form applies to",
    icon: Layers
  },
  {
    id: "pricing",
    index: 4,
    title: "Pricing",
    subtitle: "Tiers + payment plans (per season)",
    icon: CircleDollarSign
  },
  {
    id: "notifications",
    index: 5,
    title: "Notifications",
    subtitle: "Confirmation + reminder emails",
    icon: Mail
  },
  {
    id: "review",
    index: 6,
    title: "Review & publish",
    subtitle: "Preview + go live",
    icon: Send
  }
];

type StepStatus = "done" | "active" | "warning" | "idle";

export function VersionWizard({
  form,
  seedSchema,
  nextVersionNumber
}: {
  form: RegistrationForm;
  seedSchema?: Record<string, unknown>;
  nextVersionNumber: number;
}) {
  const router = useRouter();
  const [active, setActive] = useState<StepKey>("info");
  const [schema, setSchema] = useState<FormDefinition>(() => {
    if (seedSchema && typeof seedSchema === "object" && "questions" in seedSchema) {
      return seedSchema as unknown as FormDefinition;
    }
    return emptyFormDefinition();
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // validateFormDefinition returns a string[] of error messages.
  const issues = useMemo(() => validateFormDefinition(schema), [schema]);
  const valid = issues.length === 0;

  const completion = useMemo<Record<StepKey, StepStatus>>(
    () => ({
      info: "done",
      fields:
        schema.questions.length === 0
          ? "warning"
          : valid
            ? "done"
            : "warning",
      eligibility:
        form.appliesToRoles.length > 0 || form.scope === "org"
          ? "done"
          : "warning",
      pricing: "idle",
      notifications: "idle",
      review: valid && schema.questions.length > 0 ? "done" : "idle"
    }),
    [schema, valid, form.appliesToRoles.length, form.scope]
  );

  async function publish() {
    setBusy(true);
    setError(null);
    try {
      const v = await registration.createFormVersion(form.id, {
        schema: schema as unknown as Record<string, unknown>
      });
      await registration.publishFormVersion(form.id, v.id);
      router.push(`/forms/${form.id}`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    setBusy(true);
    setError(null);
    try {
      await registration.createFormVersion(form.id, {
        schema: schema as unknown as Record<string, unknown>
      });
      router.push(`/forms/${form.id}`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <TopBar
        form={form}
        nextVersionNumber={nextVersionNumber}
        canPublish={valid && schema.questions.length > 0}
        busy={busy}
        onPreview={() => setShowPreview(true)}
        onPublish={publish}
        onSaveDraft={saveDraft}
      />

      <div className="grid gap-8 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Sidebar active={active} onSelect={setActive} completion={completion} />

        <main className="min-w-0 space-y-6">
          {error ? (
            <div className="flex items-start gap-3 rounded-md bg-rose-500/10 px-4 py-3 text-rose-700 dark:text-rose-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
              <p className="text-[13px]">{error}</p>
            </div>
          ) : null}

          {active === "info" && <InfoStep form={form} />}
          {active === "fields" && (
            <FieldsStep
              schema={schema}
              onChange={setSchema}
              issues={issues}
            />
          )}
          {active === "eligibility" && <EligibilityStep form={form} />}
          {active === "pricing" && <PricingStep form={form} />}
          {active === "notifications" && <NotificationsStep form={form} />}
          {active === "review" && (
            <ReviewStep
              form={form}
              schema={schema}
              valid={valid && schema.questions.length > 0}
              busy={busy}
              onPublish={publish}
              onSaveDraft={saveDraft}
            />
          )}

          <StepNav
            active={active}
            onSelect={setActive}
            canPublish={valid && schema.questions.length > 0}
          />
        </main>
      </div>

      {showPreview ? (
        <PreviewModal
          form={form}
          schema={schema}
          onClose={() => setShowPreview(false)}
        />
      ) : null}
    </div>
  );
}

/* ----------------------------- topbar ------------------------------ */

function TopBar({
  form,
  nextVersionNumber,
  canPublish,
  busy,
  onPreview,
  onPublish,
  onSaveDraft
}: {
  form: RegistrationForm;
  nextVersionNumber: number;
  canPublish: boolean;
  busy: boolean;
  onPreview: () => void;
  onPublish: () => void;
  onSaveDraft: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-1 px-5 py-3">
      <div className="flex items-center gap-3">
        <p className="text-[16px] font-semibold tracking-tight text-fg">
          {form.name}
        </p>
        <Badge tone="warning" mono>
          DRAFT v{nextVersionNumber}
        </Badge>
        <Badge mono>{form.scope}</Badge>
      </div>
      <div className="flex items-center gap-2">
        <Link
          href={`/forms/${form.id}`}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-3 font-mono text-[10px] uppercase tracking-widest text-fg-muted hover:border-fg-muted hover:text-fg"
        >
          Back to versions
        </Link>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onSaveDraft}
          disabled={busy}
        >
          {busy ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : null}
          <span className="font-mono text-[10px] uppercase tracking-widest">
            Save draft
          </span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onPreview}
        >
          <Eye className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.75} />
          <span className="font-mono text-[10px] uppercase tracking-widest">
            Preview
          </span>
        </Button>
        <Button type="button" onClick={onPublish} disabled={busy || !canPublish}>
          {busy ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Send className="mr-1.5 h-4 w-4" strokeWidth={1.75} />
          )}
          Publish
        </Button>
      </div>
    </div>
  );
}

/* ----------------------------- sidebar ----------------------------- */

function Sidebar({
  active,
  onSelect,
  completion
}: {
  active: StepKey;
  onSelect: (id: StepKey) => void;
  completion: Record<StepKey, StepStatus>;
}) {
  return (
    <aside className="rounded-xl border border-border bg-bg-subtle p-3">
      <div className="px-2 pb-3">
        <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          // Version setup
        </p>
        <p className="mt-1 text-[12px] text-fg-muted">
          6 steps · publish when ready
        </p>
      </div>
      <ul className="space-y-1">
        {STEPS.map((step) => {
          const Icon = step.icon;
          const isActive = active === step.id;
          const state = completion[step.id];
          return (
            <li key={step.id}>
              <button
                type="button"
                onClick={() => onSelect(step.id)}
                className={cn(
                  "group flex w-full items-start gap-3 rounded-md border-l-2 px-3 py-2.5 text-left transition-colors",
                  isActive
                    ? "border-accent bg-surface-2"
                    : "border-transparent hover:bg-surface-2"
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md font-mono text-[11px]",
                    state === "done"
                      ? "bg-success/15 text-success"
                      : state === "warning"
                        ? "bg-warning/15 text-warning"
                        : "bg-surface-2 text-fg-muted"
                  )}
                >
                  {state === "done" ? (
                    <Check className="h-3.5 w-3.5" strokeWidth={2.25} />
                  ) : state === "warning" ? (
                    <AlertCircle className="h-3.5 w-3.5" strokeWidth={2.25} />
                  ) : (
                    <span className="tabular-nums">{step.index}</span>
                  )}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-1.5">
                    <Icon
                      className={cn(
                        "h-3.5 w-3.5",
                        isActive ? "text-fg" : "text-fg-muted"
                      )}
                      strokeWidth={1.75}
                    />
                    <span className="text-[13px] font-medium text-fg">
                      {step.title}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-fg-muted">
                    {step.subtitle}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

/* ------------------------------ steps ------------------------------ */

function InfoStep({ form }: { form: RegistrationForm }) {
  return (
    <section className="space-y-6 rounded-xl border border-border bg-surface-1 p-6">
      <Eyebrow>// Form info</Eyebrow>
      <p className="text-[13px] text-fg-muted">
        These fields were captured when you created the form. Edit them on the
        forms list page if you need to rename or rescope.
      </p>

      <dl className="grid gap-4 sm:grid-cols-2">
        <Field label="Name">{form.name}</Field>
        <Field label="Scope">
          <span className="font-mono uppercase">{form.scope}</span>
        </Field>
        <Field label="Purpose">
          <span className="font-mono uppercase">{form.purpose}</span>
        </Field>
        <Field label="Description">{form.description ?? "—"}</Field>
      </dl>

      <Link
        href="/forms"
        className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-accent hover:underline"
      >
        Edit metadata →
      </Link>
    </section>
  );
}

function FieldsStep({
  schema,
  onChange,
  issues
}: {
  schema: FormDefinition;
  onChange: (next: FormDefinition) => void;
  issues: string[];
}) {
  const valid = issues.length === 0;
  return (
    <section className="space-y-4 rounded-xl border border-border bg-surface-1 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <Eyebrow>// Form fields</Eyebrow>
          <p className="text-[13px] text-fg-muted">
            The questions a registrant fills out. Conditional logic + question
            types are validated as you edit.
          </p>
        </div>
        <Badge mono tone={valid ? "success" : "warning"}>
          {schema.questions.length} question
          {schema.questions.length === 1 ? "" : "s"}{" "}
          {valid ? "" : "· issues"}
        </Badge>
      </div>
      <FormBuilder value={schema} onChange={onChange} />
      {!valid ? (
        <ul className="space-y-1 rounded-md bg-rose-500/10 px-4 py-3 text-[12px] text-rose-700 dark:text-rose-300">
          {issues.slice(0, 5).map((iss: string, i: number) => (
            <li key={i}>{iss}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function EligibilityStep({ form }: { form: RegistrationForm }) {
  const roles =
    form.appliesToRoles.length === 0
      ? [{ code: "*", name: "All roles in scope" }]
      : form.appliesToRoles.map((c) => ({
          code: c,
          name: SYSTEM_ROLE_BY_CODE[c]?.name ?? c
        }));
  return (
    <section className="space-y-4 rounded-xl border border-border bg-surface-1 p-6">
      <Eyebrow>// Eligibility</Eyebrow>
      <p className="text-[13px] text-fg-muted">
        Who this form is shown to when admins or registrants land on the
        funnel. Role + scope are set on the form metadata.
      </p>
      <dl className="grid gap-4 sm:grid-cols-2">
        <Field label="Scope type">
          <span className="font-mono uppercase">{form.scope}</span>
        </Field>
        <Field label="Scope ID">
          <span className="font-mono text-[11px] text-fg-muted">
            {form.scopeId ?? "—"}
          </span>
        </Field>
      </dl>
      <div>
        <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          Applies to roles
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {roles.map((r) => (
            <Badge key={r.code} mono>
              {r.name}
            </Badge>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * Season-keyed steps (Pricing + Notifications) are gated by a season
 * picker because pricing_tiers and email_templates are keyed per-season,
 * not per-form. A single form runs across many seasons (each with its
 * own tiers / templates), so we render an empty state until the admin
 * picks which season they're configuring.
 */
function useSeasonsForForm(form: RegistrationForm) {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    leagueMgmt
      .listSeasons({ orgId: form.orgId })
      .then((page) => {
        if (!alive) return;
        const items = (page.items ?? []).slice().sort((a, b) =>
          (b.startDate ?? "").localeCompare(a.startDate ?? "")
        );
        setSeasons(items);
      })
      .catch((e) => {
        if (alive) setError((e as Error).message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [form.orgId]);

  return { seasons, loading, error };
}

function SeasonPicker({
  seasons,
  loading,
  selectedId,
  onSelect
}: {
  seasons: Season[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="rounded-md border border-border bg-bg-subtle p-4">
      <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        // Season context
      </p>
      <p className="mt-1 mb-3 text-[12px] text-fg-muted">
        These tiers / templates are keyed per season, not per form. Pick the
        season you're configuring — the editor below loads its data and
        edits apply across every form used in that season.
      </p>
      {loading ? (
        <div className="flex items-center gap-2 text-[12px] text-fg-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading seasons…
        </div>
      ) : seasons.length === 0 ? (
        <p className="text-[12px] text-fg-muted">
          No seasons exist for this org yet.{" "}
          <Link href="/seasons" className="underline">
            Create one
          </Link>{" "}
          to wire pricing + emails.
        </p>
      ) : (
        <select
          value={selectedId ?? ""}
          onChange={(e) => onSelect(e.target.value)}
          className="h-9 w-full max-w-sm rounded-md border border-border bg-surface-1 px-3 text-[13px] text-fg"
        >
          <option value="" disabled>
            Pick a season…
          </option>
          {seasons.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · {s.startDate?.slice(0, 10) ?? "—"}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function PricingStep({ form }: { form: RegistrationForm }) {
  const { seasons, loading } = useSeasonsForForm(form);
  const [seasonId, setSeasonId] = useState<string | null>(null);
  const [tiers, setTiers] = useState<PricingTier[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  // Auto-pick the most recent season once loaded.
  useEffect(() => {
    const first = seasons[0];
    if (!seasonId && first) setSeasonId(first.id);
  }, [seasons, seasonId]);

  useEffect(() => {
    if (!seasonId) return;
    let alive = true;
    setDataLoading(true);
    setDataError(null);
    Promise.all([
      registrationV2.listPricingTiers({ seasonId }),
      leagueMgmt.listDivisions({ seasonId })
    ])
      .then(([t, d]) => {
        if (!alive) return;
        setTiers(t);
        setDivisions(d.items ?? []);
      })
      .catch((e) => {
        if (alive) setDataError((e as Error).message);
      })
      .finally(() => {
        if (alive) setDataLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [seasonId]);

  return (
    <section className="space-y-4 rounded-xl border border-border bg-surface-1 p-6">
      <Eyebrow>// Pricing</Eyebrow>
      <SeasonPicker
        seasons={seasons}
        loading={loading}
        selectedId={seasonId}
        onSelect={setSeasonId}
      />
      {dataError ? (
        <div className="rounded-md bg-rose-500/10 px-4 py-3 text-[12px] text-rose-700 dark:text-rose-300">
          {dataError}
        </div>
      ) : null}
      {seasonId ? (
        dataLoading ? (
          <div className="flex items-center gap-2 text-[12px] text-fg-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading tiers…
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-bg-subtle p-5">
            <PricingTab
              seasonId={seasonId}
              divisions={divisions}
              tiers={tiers}
              onTiersChange={setTiers}
            />
          </div>
        )
      ) : null}
    </section>
  );
}

function NotificationsStep({ form }: { form: RegistrationForm }) {
  const { seasons, loading } = useSeasonsForForm(form);
  const [seasonId, setSeasonId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  useEffect(() => {
    const first = seasons[0];
    if (!seasonId && first) setSeasonId(first.id);
  }, [seasons, seasonId]);

  useEffect(() => {
    if (!seasonId) return;
    let alive = true;
    setDataLoading(true);
    setDataError(null);
    registrationV2
      .listEmailTemplates({ seasonId })
      .then((t) => {
        if (alive) setTemplates(t);
      })
      .catch((e) => {
        if (alive) setDataError((e as Error).message);
      })
      .finally(() => {
        if (alive) setDataLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [seasonId]);

  return (
    <section className="space-y-4 rounded-xl border border-border bg-surface-1 p-6">
      <Eyebrow>// Notifications</Eyebrow>
      <SeasonPicker
        seasons={seasons}
        loading={loading}
        selectedId={seasonId}
        onSelect={setSeasonId}
      />
      {dataError ? (
        <div className="rounded-md bg-rose-500/10 px-4 py-3 text-[12px] text-rose-700 dark:text-rose-300">
          {dataError}
        </div>
      ) : null}
      {seasonId ? (
        dataLoading ? (
          <div className="flex items-center gap-2 text-[12px] text-fg-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading templates…
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-bg-subtle p-5">
            <EmailTemplatesTab
              seasonId={seasonId}
              templates={templates}
              onTemplatesChange={setTemplates}
            />
          </div>
        )
      ) : null}
    </section>
  );
}

function ReviewStep({
  form,
  schema,
  valid,
  busy,
  onPublish,
  onSaveDraft
}: {
  form: RegistrationForm;
  schema: FormDefinition;
  valid: boolean;
  busy: boolean;
  onPublish: () => void;
  onSaveDraft: () => void;
}) {
  return (
    <section className="space-y-6 rounded-xl border border-border bg-surface-1 p-6">
      <Eyebrow>// Review &amp; publish</Eyebrow>
      <p className="text-[13px] text-fg-muted">
        Below is what a registrant sees on the public funnel. Publishing locks
        the schema + makes this the active version of <strong>{form.name}</strong>.
      </p>

      <div className="rounded-xl border border-dashed border-border bg-bg-subtle p-6">
        <FormRenderer definition={schema} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="text-[12px] text-fg-muted">
          {valid
            ? "Schema validates. Ready to publish."
            : "Add at least one question — review the Form fields step."}
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onSaveDraft}
            disabled={busy}
          >
            <span className="font-mono text-[10px] uppercase tracking-widest">
              Save as draft
            </span>
          </Button>
          <Button type="button" onClick={onPublish} disabled={busy || !valid}>
            {busy ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-1.5 h-4 w-4" strokeWidth={1.75} />
            )}
            Publish version
          </Button>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- helpers ----------------------------- */

function Field({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        {label}
      </dt>
      <dd className="mt-1 text-[13px] text-fg">{children}</dd>
    </div>
  );
}

function StepNav({
  active,
  onSelect,
  canPublish
}: {
  active: StepKey;
  onSelect: (id: StepKey) => void;
  canPublish: boolean;
}) {
  const idx = STEPS.findIndex((s) => s.id === active);
  const prev = STEPS[idx - 1];
  const next = STEPS[idx + 1];
  return (
    <div className="flex items-center justify-between border-t border-border pt-4">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => prev && onSelect(prev.id)}
        disabled={!prev}
      >
        <span className="font-mono text-[10px] uppercase tracking-widest">
          ← {prev?.title ?? "Back"}
        </span>
      </Button>
      {next ? (
        <Button type="button" size="sm" onClick={() => onSelect(next.id)}>
          <span className="font-mono text-[10px] uppercase tracking-widest">
            {next.title} →
          </span>
        </Button>
      ) : (
        <span
          className={cn(
            "font-mono text-[10px] uppercase tracking-widest",
            canPublish ? "text-success" : "text-fg-muted"
          )}
        >
          {canPublish ? "Ready to publish" : "Add questions to publish"}
        </span>
      )}
    </div>
  );
}

function PreviewModal({
  form,
  schema,
  onClose
}: {
  form: RegistrationForm;
  schema: FormDefinition;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <button
        aria-label="Close preview"
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />
      <div className="relative flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-surface-1 shadow-xl">
        <header className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <Eyebrow>// Preview</Eyebrow>
            <p className="mt-1 text-[13px] text-fg">{form.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="font-mono text-[10px] uppercase tracking-widest text-fg-muted hover:text-fg"
          >
            close
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <FormRenderer definition={schema} />
        </div>
      </div>
    </div>
  );
}
