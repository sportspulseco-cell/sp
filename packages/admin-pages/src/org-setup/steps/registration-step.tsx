"use client";
import dynamic from "next/dynamic";
import { useState } from "react";
import { Alert, Button, Field, Input, Select, Skeleton } from "@sportspulse/ui";
import { emptyFormDefinition, formatCalendarDate, formatMoney, guidedRegistrationProblem, SEASON_REGISTRATION_TYPES,
  SEASON_REGISTRATION_TYPE_LABELS, type FormDefinition, type GuidedRegistrationSetupInput,
  type SeasonRegistrationType } from "@sportspulse/kernel";
import { ReviewSummary } from "./divisions-step";
import type { WizardState } from "../types";

const FormBuilder = dynamic(() => import("@sportspulse/forms-builder").then(m => m.FormBuilder), {
  loading: () => <div role="status" aria-label="Loading question editor"><Skeleton className="h-24" /></div>,
});
export interface RegistrationDraft {
  registrationType: SeasonRegistrationType; playerPrice: string; teamFeeEnabled: boolean;
  teamPrice: string; currency: string; requireUsaHockeyId: boolean; definition: FormDefinition;
}
export const defaultRegistrationDraft = (): RegistrationDraft => ({ registrationType: "both", playerPrice: "",
  teamFeeEnabled: false, teamPrice: "", currency: "USD", requireUsaHockeyId: false, definition: emptyFormDefinition() });

export function priceInCents(value: string): number {
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(value.trim())) return Number.NaN;
  const [whole, fraction = ""] = value.trim().split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
export function registrationSetupInput(draft: RegistrationDraft, requestId: string, publish: boolean, reviewConfirmed: boolean): GuidedRegistrationSetupInput {
  return { requestId, registrationType: draft.registrationType, playerPriceCents: priceInCents(draft.playerPrice),
    teamFeeEnabled: draft.teamFeeEnabled, teamPriceCents: draft.teamFeeEnabled ? priceInCents(draft.teamPrice) : 0,
    currency: draft.currency, requireUsaHockeyId: draft.requireUsaHockeyId, formDefinition: draft.definition, publish, reviewConfirmed };
}
const DOC_LABELS = { liabilityWaiver: "Liability waiver", codeOfConduct: "Code of conduct", photoRelease: "Photo and media consent" };

export function RegistrationStep({ draft, onChange }: { draft: RegistrationDraft; onChange: (next: RegistrationDraft) => void }) {
  const [questionsOpen, setQuestionsOpen] = useState(false);
  const patch = (change: Partial<RegistrationDraft>) => onChange({ ...draft, ...change });
  const problem = guidedRegistrationProblem(registrationSetupInput(draft, "", false, false));
  return <div className="space-y-5">
    <section className="space-y-4 rounded-lg border border-border bg-surface-1 p-5">
      <h2 className="font-semibold">Who is registering?</h2>
      <Field label="Registration paths" htmlFor="setup-registration-type"><Select id="setup-registration-type" value={draft.registrationType} onChange={e => patch({ registrationType: e.target.value as SeasonRegistrationType })}>
        {SEASON_REGISTRATION_TYPES.map(type => <option key={type} value={type}>{SEASON_REGISTRATION_TYPE_LABELS[type]}</option>)}
      </Select></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Player registration price" htmlFor="setup-player-price" hint="Enter 0 for free registration."><Input id="setup-player-price" inputMode="decimal" value={draft.playerPrice} onChange={e => patch({ playerPrice: e.target.value })} placeholder="0.00" /></Field>
        <Field label="Currency" htmlFor="setup-currency"><Select id="setup-currency" value={draft.currency} onChange={e => patch({ currency: e.target.value })}><option value="USD">US dollars (USD)</option><option value="CAD">Canadian dollars (CAD)</option></Select></Field>
      </div>
      {draft.registrationType !== "individual" ? <div className="space-y-3 border-t border-border pt-4">
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={draft.teamFeeEnabled} onChange={e => patch({ teamFeeEnabled: e.target.checked })} /> Charge a separate team registration fee</label>
        <p className="text-sm text-fg-muted">Team registration is free unless you turn this on. Player fees are separate.</p>
        {draft.teamFeeEnabled ? <Field label="Team registration price" htmlFor="setup-team-price"><Input id="setup-team-price" inputMode="decimal" value={draft.teamPrice} onChange={e => patch({ teamPrice: e.target.value })} placeholder="0.00" /></Field> : null}
      </div> : null}
      <p className="text-sm text-fg-muted">Payment testing mode is active. Payments are simulated.</p>
    </section>
    <section className="space-y-3 rounded-lg border border-border bg-surface-1 p-5">
      <h2 className="font-semibold">Membership proof</h2>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={draft.requireUsaHockeyId} onChange={e => patch({ requireUsaHockeyId: e.target.checked })} /> Require USA Hockey membership</label>
      <p className="text-sm text-fg-muted">Staff review the player's current membership card. A self-entered ID stays pending until verified.</p>
    </section>
    <section className="space-y-4 rounded-lg border border-border bg-surface-1 p-5">
      <h2 className="font-semibold">Questions and documents</h2>
      <p className="text-sm text-fg-muted">The registration flow already collects the player's profile. Add only the extra information your league needs, and review the documents your league uses.</p>
      <Button type="button" variant="outline" onClick={() => setQuestionsOpen(value => !value)}>{questionsOpen ? "Close question editor" : `Custom questions (${draft.definition.questions.length})`}</Button>
      {questionsOpen ? <FormBuilder value={draft.definition} onChange={definition => patch({ definition })} /> : null}
      {(Object.keys(DOC_LABELS) as Array<keyof typeof DOC_LABELS>).map(key => {
        const document = draft.definition.waivers![key];
        const update = (change: Partial<typeof document>) => patch({ definition: { ...draft.definition, waivers: { ...draft.definition.waivers!, [key]: { ...document, ...change } } } });
        return <details key={key} className="rounded-md border border-border p-3">
          <summary className="cursor-pointer text-sm font-medium">{DOC_LABELS[key]} · {document.enabled ? "Enabled" : "Off"}</summary>
          <div className="mt-3 space-y-3">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={document.enabled} onChange={e => update({ enabled: e.target.checked })} /> Include this document</label>
            <label className="block text-sm">Document text<textarea className="mt-1 min-h-32 w-full rounded-md border border-border bg-surface-1 p-3 text-sm" value={document.content} onChange={e => update({ content: e.target.value })} /></label>
          </div>
        </details>;
      })}
    </section>
    {draft.playerPrice.trim() && problem ? <Alert tone="error">{problem}</Alert> : null}
  </div>;
}

export function RegistrationReview({ state, draft, confirmed, onConfirm }: {
  state: WizardState; draft: RegistrationDraft; confirmed: boolean; onConfirm: (value: boolean) => void;
}) {
  const input = registrationSetupInput(draft, "", false, false);
  return <div className="space-y-5">
    <section className="space-y-4 rounded-lg border border-border bg-surface-1 p-5">
      <h2 className="font-semibold">{state.league.name} · {state.season.name}</h2>
      <dl className="grid gap-4 text-sm sm:grid-cols-2">
        <div><dt className="text-fg-muted">Season</dt><dd>{formatCalendarDate(state.season.startDate)} – {formatCalendarDate(state.season.endDate)}</dd></div>
        <div><dt className="text-fg-muted">Registration window</dt><dd>{formatCalendarDate(state.season.registrationOpensAt)} – {formatCalendarDate(state.season.registrationClosesAt)} · {state.league.timezone}</dd></div>
        <div><dt className="text-fg-muted">Divisions</dt><dd>{state.divisions.map(d => d.name).join(", ")}</dd></div>
        <div><dt className="text-fg-muted">Registration paths</dt><dd>{SEASON_REGISTRATION_TYPE_LABELS[draft.registrationType]}</dd></div>
        <div><dt className="text-fg-muted">Player price</dt><dd>{formatMoney(input.playerPriceCents, draft.currency)}</dd></div>
        <div><dt className="text-fg-muted">Separate team fee</dt><dd>{draft.registrationType === "individual" ? "No team registration" : draft.teamFeeEnabled ? formatMoney(input.teamPriceCents, draft.currency) : "Off · free team registration"}</dd></div>
        <div><dt className="text-fg-muted">USA Hockey membership</dt><dd>{draft.requireUsaHockeyId ? "Required · staff-reviewed proof" : "Not required"}</dd></div>
        <div><dt className="text-fg-muted">Extra questions</dt><dd>{draft.definition.questions.length}</dd></div>
      </dl>
      <p className="text-sm text-fg-muted">Documents: {(Object.keys(DOC_LABELS) as Array<keyof typeof DOC_LABELS>).filter(key => draft.definition.waivers?.[key].enabled).map(key => DOC_LABELS[key]).join(", ") || "None enabled"}.</p>
    </section>
    <details className="rounded-lg border border-border p-4"><summary className="cursor-pointer text-sm font-medium">League and division settings</summary><div className="mt-4"><ReviewSummary divisions={state.divisions} league={state.league} season={state.season} org={null}/></div></details>
    <label className="flex items-start gap-2 rounded-lg border border-border p-4 text-sm"><input type="checkbox" checked={confirmed} onChange={e => onConfirm(e.target.checked)} /> I reviewed the season, division rules, prices and document text. This registration is ready to publish.</label>
    <p className="text-sm text-fg-muted">Publish opens registration on its opening date. Save draft keeps it closed. Payments remain simulated.</p>
  </div>;
}
