"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Clock, Loader2 } from "lucide-react";
import {
  allowedSubmissionTypes,
  resolveRegistrationWaivers,
  type AnswerMap,
  normalizeSkillLevel,
  SKILL_LEVEL_HINTS,
  SKILL_LEVEL_LABELS,
  SKILL_LEVELS,
  tiersForDivision,
  tierOffersPlan,
  tierIsFull,
  planInstallments,
  formatMoney
} from "@sportspulse/kernel";
import type { PublicRegistrationApi } from "./public-api";
import type { PublicSeasonContext, PricingTier, SubmissionType, WaiverDoc } from "./types";
import { Button, Chip, Field, Input } from "@sportspulse/ui";
import { FormRenderer } from "./form-renderer";
import { WaiverCard } from "./waiver-card";

type Step =
  | "path"
  | "division"
  | "account"
  | "consent"
  | "waivers"
  | "tier"
  | "questions"
  | "review"
  | "payment"
  | "done";


const PATHS: {
  value: SubmissionType;
  title: string;
  blurb: string;
  icon: string;
  iconBg: string;
}[] = [
  {
    value: "team",
    title: "Register a team",
    blurb: "I am a captain registering my team for this season",
    icon: "🛡️",
    iconBg: "bg-blue-500/15"
  },
  {
    value: "individual",
    title: "Register as a player",
    blurb: "I am registering myself individually",
    icon: "🏒",
    iconBg: "bg-emerald-500/15"
  },
  {
    value: "free_agent",
    title: "Free agent",
    blurb: "I want to play but don't have a team yet",
    icon: "👤",
    iconBg: "bg-amber-500/15"
  },
  {
    value: "captain_invite",
    title: "Captain invite",
    blurb: "I received an invite link from my captain",
    icon: "✉️",
    iconBg: "bg-violet-500/15"
  }
];

/**
 * Public, anonymous registration funnel.
 *
 * Entry-path → account → tier → custom questions (FormRenderer) → review.
 * Submission persists as a draft `registrations` row keyed by
 * (email, season, path); reopening the link with the same email resumes
 * the same draft. Account binding (Supabase user) lands when the visitor
 * comes back via magic-link in a follow-up wave.
 */
export function RegistrationFunnel({
  context,
  api
}: {
  context: PublicSeasonContext;
  /**
   * Bound public-registration API client. Each consuming app builds
   * its own via `createPublicRegistration(NEXT_PUBLIC_API_URL)` and
   * passes it in. This package never reads `process.env` directly.
   */
  api: PublicRegistrationApi;
}) {
  const [step, setStep] = useState<Step>("path");
  const [submissionType, setSubmissionType] = useState<SubmissionType | null>(
    null
  );
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  /** Composed from firstName + lastName at submit time. Kept in
   * state so legacy callers (single-line "Sasha Velasquez" inputs
   * in older entry points) still work. */
  const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
  const setFullName = (v: string) => {
    const parts = v.trim().split(/\s+/);
    setFirstName(parts[0] ?? "");
    setLastName(parts.slice(1).join(" "));
  };
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [dobDate, setDobDate] = useState("");
  const [pricingTierId, setPricingTierId] = useState<string | null>(null);
  // P2-2 — division-bound submissions. Auto-picks when there's
  // exactly one division; null until the player picks otherwise.
  const [divisionId, setDivisionId] = useState<string | null>(
    context.divisions?.length === 1 ? context.divisions[0]!.id : null
  );
  const [answers, setAnswers] = useState<AnswerMap>({});
  // Phase 2 team-info card state (only shown when path=team).
  // Sent to the backend via the answers map under reserved keys at
  // payment time — future iteration moves this to a dedicated table.
  const [teamName, setTeamName] = useState("");
  const [teamDivision, setTeamDivision] = useState("");
  const [teamColor, setTeamColor] = useState("#3B82F6");
  // Photo / media release is optional and display-only. The required
  // documents (liability waiver, code of conduct) are signed through the
  // API, which holds their state (REG-5).
  const [photoReleaseAccepted, setPhotoReleaseAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [resumed, setResumed] = useState(false);
  // Backend-determined post-submit state. Drives the Done screen UX.
  const [submissionStatus, setSubmissionStatus] = useState<string | null>(null);
  const [isMinor, setIsMinor] = useState(false);
  // Phase 3 — required documents as the API reports them for this
  // registration (signed state included), parental consent, eligibility.
  const [waivers, setWaivers] = useState<WaiverDoc[] | null>(null);
  const [waiversError, setWaiversError] = useState<string | null>(null);
  /** The name the API expects typed on a signature (the account name). */
  const [signerName, setSignerName] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [consentSent, setConsentSent] = useState(false);
  const [consentMessage, setConsentMessage] = useState<{
    to: string;
    subject: string;
    body: string;
  } | null>(null);
  const [eligibilityFlags, setEligibilityFlags] = useState<string[] | null>(null);

  // Only the prices for the registrant's division (REG-18); the server
  // refuses any other at the price step and again at payment.
  const registrantDivision =
    submissionType === "team" ? teamDivision || null : divisionId;
  const tiers = useMemo(
    () =>
      tiersForDivision(
        context.pricingTiers.map((t) => ({
          ...t,
          divisionIds: t.divisionIds ?? (t.divisionId ? [t.divisionId] : [])
        })),
        registrantDivision
      ),
    [context.pricingTiers, registrantDivision]
  );
  // A division change can leave a picked price that is not offered there.
  useEffect(() => {
    if (pricingTierId && !tiers.some((t) => t.id === pricingTierId)) {
      setPricingTierId(null);
    }
  }, [tiers, pricingTierId]);
  const hasQuestions = (context.formDefinition?.questions ?? []).length > 0;

  // Per-season toggles set on the admin wizard's Divisions &
  // eligibility step. Defaults match @sportspulse/kernel
  // SEASON_CONFIG_DEFAULTS so unconfigured seasons keep the legacy
  // funnel behaviour.
  const seasonConfig = (context.season.config ?? {}) as {
    allowFreeAgent?: boolean;
    parentalConsentRequired?: boolean;
    requireLiabilityWaiver?: boolean;
    requireCodeOfConduct?: boolean;
    liabilityWaiverContent?: string;
    codeOfConductContent?: string;
  };
  const parentalConsentRequired = seasonConfig.parentalConsentRequired ?? true;
  // REG-14: the paths this season offers (registration type + free-agent
  // toggle). Same kernel rule the API enforces on start and resume.
  const offeredPaths = useMemo(
    () => allowedSubmissionTypes(context.season.config ?? {}),
    [context.season.config]
  );

  // Which documents this season asks for: the kernel rule the API also
  // uses (season setup, then the form, then the SportsPulse default
  // text). The API's per-registration list is authoritative once the
  // account step has run; this preview only decides whether the
  // Compliance step exists before then.
  const waiverPreview = useMemo(
    () =>
      resolveRegistrationWaivers(
        context.season.config ?? {},
        context.formDefinition?.waivers ?? null
      ),
    [context.season.config, context.formDefinition?.waivers]
  );
  const photoRelease = waiverPreview.photoRelease;
  const hasRequiredDocs = waiverPreview.required.length > 0;

  const divisions = context.divisions ?? [];
  // P2-2 — show the division step only when there are 2+ divisions
  // to pick from. One auto-picks at state init; zero means the
  // season has no divisions and the field stays NULL (registration
  // is org-only, falls through to org-wide listings downstream).
  const showDivisionStep = divisions.length >= 2;

  const stepOrder: Step[] = useMemo(() => {
    // Order must match the PhaseStepper labels (1 Path · 2 Account ·
    // 3 Details · 4 Compliance · 5 Payment · 6 Confirmation).
    //
    // `questions` IS the Details phase. It ALWAYS runs — even when
    // the form has no custom questions — because the step also
    // renders the team-info card (team registration) and acts as the
    // single Details surface the stepper points at. Tester transcript:
    // signing in jumped Account → Compliance because the previous
    // guard `if (hasQuestions)` evaluated to false when the form's
    // schema was bare, dropping Phase 3 entirely.
    const out: Step[] = ["path"];
    // P2-2 — Division step lands between Path and Account so the
    // chosen divisionId is in scope when startSubmission inserts
    // the registration row.
    if (showDivisionStep) out.push("division");
    out.push("account", "questions");
    // Skip parental consent entirely when the admin disabled it for
    // this season, even if DOB indicates a minor — adult-only leagues
    // (or test seasons) often turn it off.
    // The server's status wins: a registration waiting for the guardian
    // always shows the consent step, even when the season toggle says
    // consent is not required (the API holds every minor for consent).
    if ((isMinor && parentalConsentRequired) || submissionStatus === "pending_consent") {
      out.push("consent");
    }
    if (hasRequiredDocs || (waivers?.length ?? 0) > 0 || photoRelease.enabled) {
      out.push("waivers");
    }
    if (tiers.length > 0) out.push("tier");
    out.push("review", "payment", "done");
    return out;
  }, [
    isMinor,
    parentalConsentRequired,
    submissionStatus,
    waivers,
    tiers.length,
    hasRequiredDocs,
    photoRelease.enabled,
    showDivisionStep
  ]);

  function next() {
    const i = stepOrder.indexOf(step);
    if (i < stepOrder.length - 1) setStep(stepOrder[i + 1]!);
  }

  /**
   * Details → next: persist the answers map and re-run eligibility so
   * the Compliance step shows checks evaluated against the real input.
   * Previously every Details-step answer lived in client state only —
   * `startSubmission` runs at the Account step when answers is still
   * `{}`, and nothing wrote them back, so the approve handler that
   * upserts the free-agent pool entry from `meta.answers` saw nothing.
   */
  async function submitDetails() {
    if (!submissionId) {
      next();
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const saved = await api.updateSubmission(submissionId, {
        email: email.trim(),
        answers,
        dobDate: dobDate || null,
        // Team-reg captain edits team name / division on this step, so
        // we have to roundtrip them too. Without this branch a captain
        // who changes their mind on Details never reaches the server.
        ...(submissionType === "team"
          ? {
              teamName: teamName.trim() || null,
              teamColor: teamColor || null,
              divisionId: teamDivision || null
            }
          : {})
      });
      // The API re-checks the DOB: a minor's unpaid registration goes back
      // to wait for the guardian, and the step list follows the status.
      if (saved.status) setSubmissionStatus(saved.status);
      if (typeof saved.isMinor === "boolean") setIsMinor(saved.isMinor);
      const elig = await api
        .runEligibilityCheck(submissionId, email.trim())
        .catch(() => null);
      if (elig) setEligibilityFlags(elig.flags);
      // `next()` reads this render's step list, which may not have the
      // consent step yet; go there directly when the API says so.
      if (saved.status === "pending_consent") setStep("consent");
      else next();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * Tier → next: persist the pricing tier id so the Pay step's
   * amount/currency resolution and the invoice row both see the right
   * value. Otherwise `meta.pricingTierId` stays null and the offline
   * branch records $0.
   */
  async function submitTier() {
    if (!submissionId) {
      next();
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.updateSubmission(submissionId, {
        email: email.trim(),
        pricingTierId: pricingTierId ?? null
      });
      next();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  function back() {
    const i = stepOrder.indexOf(step);
    if (i > 0) setStep(stepOrder[i - 1]!);
  }

  /** Server list of required documents with this registrant's signed state. */
  async function loadWaivers(id: string, mail: string): Promise<WaiverDoc[] | null> {
    try {
      const res = await api.listSubmissionWaivers(id, mail);
      setWaivers(res.documents);
      setSignerName(res.signerName ?? "");
      setWaiversError(null);
      return res.documents;
    } catch (e) {
      setWaiversError((e as Error).message);
      return null;
    }
  }

  /**
   * Sign one required document. The API checks the typed name, stores
   * the signature and returns what is still unsigned; that answer, not
   * the click, decides the Signed state. Throws so the card shows the
   * error inline.
   */
  async function signDocument(key: string, signatureName: string) {
    const res = await api.signWaiver(submissionId!, {
      email: email.trim(),
      key,
      signatureName
    });
    const outstanding = new Set(res.outstanding.map((o) => o.key));
    setWaivers((prev) =>
      prev
        ? prev.map((d) =>
            d.key
              ? {
                  ...d,
                  signed: !outstanding.has(d.key),
                  signedAt: d.key === key ? res.signedAt : d.signedAt ?? null
                }
              : d
          )
        : prev
    );
    setError(null);
  }

  /**
   * Account-step submit: creates the auth user + submission row,
   * loads waivers for the org, kicks off the async eligibility check.
   * From here on every step has a real submissionId to act against.
   */
  async function submitAccount() {
    if (!submissionType || !email.trim() || password.length < 8 || !fullName.trim()) {
      setError("Email, full name, and password (8+ chars) are required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.startSubmission(
        context.season.id,
        {
          email: email.trim(),
          password,
          fullName: fullName.trim(),
          phone: phone.trim() || undefined,
          dobDate: dobDate || undefined,
          pricingTierId: pricingTierId ?? undefined,
          submissionType,
          divisionId: divisionId ?? undefined,
          answers,
          formVersionId: context.formVersionId ?? undefined,
          teamName:
            submissionType === "team" && teamName.trim()
              ? teamName.trim()
              : undefined,
          teamColor:
            submissionType === "team" && teamColor ? teamColor : undefined
        }
      );
      setSubmissionId(result.id);
      setResumed(result.resumed);
      setSubmissionStatus(result.status);
      setIsMinor(result.isMinor);

      // Load the required documents + run eligibility in parallel —
      // neither blocks advancing. Eligibility flags surface on the Review
      // screen as warnings (spec §6.3).
      await Promise.all([
        loadWaivers(result.id, email.trim()),
        api
          .runEligibilityCheck(result.id, email.trim())
          .then((r) => setEligibilityFlags(r.flags))
          .catch(() => undefined)
      ]);

      next();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * Sign-in path for the AccountStep "Already have an account?" card.
   * Calls the resume endpoint, which validates the email exists and
   * pulls the user's stored displayName so we don't have to re-collect
   * first / last name.
   *
   * The API verifies the password against Supabase Auth before
   * returning any stored details (REG-1).
   */
  /**
   * Sign-in submit. Takes `emailOverride` so the child sign-in tab can
   * pass the email it captured directly — previous version relied on
   * the parent `email` state being set first, but setState is async and
   * the closure read the stale empty value, producing intermittent
   * "Enter the email" errors and downstream 404s on /pay (submission
   * row was tied to one email but the pay call used another).
   */
  async function submitSignIn(emailOverride: string, password: string) {
    const useEmail = (emailOverride ?? email).trim();
    if (!useEmail) {
      setError("Enter the email you used to sign up.");
      return;
    }
    if (!submissionType) {
      setError("Pick a registration path before signing in.");
      return;
    }
    // Mirror into parent state so the rest of the funnel (pay, etc.)
    // reads the same email the submission was created with.
    if (emailOverride && emailOverride.trim() !== email) {
      setEmail(useEmail);
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.resumeSubmission(context.season.id, {
        email: useEmail,
        password,
        submissionType,
        formVersionId: context.formVersionId ?? undefined
      });
      setSubmissionId(result.id);
      setResumed(result.resumed);
      setSubmissionStatus(result.status);
      setIsMinor(result.isMinor);
      setFullName(result.fullName);
      // Hydrate the Details step from the prior submission so a
      // returning user doesn't see a blank form. dobDate is shown
      // readonly on the Player profile section, answers backs the
      // FormRenderer + skill/positions/availability buttons, and
      // pricingTierId pre-selects the Tier step.
      if (result.dobDate) setDobDate(result.dobDate);
      if (result.phone) setPhone(result.phone);
      if (result.answers) setAnswers(result.answers);
      if (result.pricingTierId) setPricingTierId(result.pricingTierId);
      if (result.divisionId) setDivisionId(result.divisionId);

      // useEmail, not the `email` state: setEmail above has not landed
      // in this closure yet (an empty email made these calls 404, REG-24).
      await Promise.all([
        loadWaivers(result.id, useEmail),
        api
          .runEligibilityCheck(result.id, useEmail)
          .then((r) => setEligibilityFlags(r.flags))
          .catch(() => undefined)
      ]);

      next();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * Review CTA — bounces to the payment step (mock Stripe).
   */
  async function continueToPayment() {
    next();
  }

  async function pay(outcome: "succeeded" | "offline", paymentOption?: "full" | "plan", useWallet = false) {
    if (!submissionId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.pay(submissionId, {
        email,
        mockOutcome: outcome,
        ...(paymentOption ? { paymentOption } : {}),
        ...(useWallet ? { useWallet: true } : {})
      });
      setSubmissionStatus(res.status);
      if (res.status === "pending_review" || res.status === "pending_offline") {
        setStep("done");
      } else if (res.declineReason) {
        setError(res.declineReason);
      }
    } catch (e) {
      const err = e as Error & { status?: number };
      setError(err.message);
      // 409: the API refused to submit. When it is an unsigned document,
      // go back to the Compliance step, which names what is missing.
      if (err.status === 409) {
        const docs = await loadWaivers(submissionId, email.trim());
        if (docs?.some((d) => !d.signed)) setStep("waivers");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const activePhase = phaseFor(step);
  const phaseHeading = phaseHeadingFor(step);

  // REG-16: outside the registration window (or with no published form)
  // the form is not shown at all; the API would refuse it anyway.
  const windowState = context.registrationWindow?.state ?? "open";
  if (windowState !== "open" || !context.formVersionId) {
    return (
      <RegistrationClosed
        seasonName={context.season.name}
        title={
          !context.formVersionId && windowState === "open"
            ? "Registration is not set up yet"
            : windowState === "not_yet_open"
              ? "Registration is not open yet"
              : "Registration is closed"
        }
        message={
          windowState !== "open"
            ? context.registrationWindow?.message ?? "Registration is not open."
            : `The league has not published the registration form for ${context.season.name} yet.`
        }
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <PhaseStepper activePhase={activePhase} />

      <header className="mt-8 space-y-1">
        <h1 className="text-[28px] font-semibold tracking-tight text-fg">
          {phaseHeading.title}
        </h1>
        <p className="text-[12px] text-fg-muted">
          {phaseHeading.subtitle ??
            `${context.season.name}${
              context.season.registrationClosesAt
                ? ` · Registration closes ${fmtDate(context.season.registrationClosesAt, context.season.timezone)}`
                : ""
            }`}
        </p>
      </header>

      <div className="mt-8 rounded-xl border border-border bg-surface-1 p-6">
        {step === "path" && (
          <PathStep
            value={submissionType}
            onChange={setSubmissionType}
            onNext={next}
            offeredPaths={offeredPaths}
          />
        )}

        {step === "division" && (
          <DivisionStep
            divisions={divisions}
            value={divisionId}
            onChange={setDivisionId}
            onBack={back}
            onNext={next}
          />
        )}

        {step === "account" && (
          <AccountStep
            email={email}
            firstName={firstName}
            lastName={lastName}
            password={password}
            confirmPassword={confirmPassword}
            phone={phone}
            dobDate={dobDate}
            submitting={submitting}
            error={error}
            onEmailChange={setEmail}
            onFirstNameChange={setFirstName}
            onLastNameChange={setLastName}
            onPasswordChange={setPassword}
            onConfirmPasswordChange={setConfirmPassword}
            onPhoneChange={setPhone}
            onDobChange={setDobDate}
            onBack={back}
            onSubmit={submitAccount}
            onSignIn={submitSignIn}
          />
        )}

        {step === "consent" && (
          <ConsentStep
            submissionId={submissionId!}
            email={email}
            parentEmail={parentEmail}
            consentSent={consentSent}
            consentMessage={consentMessage}
            onParentEmailChange={setParentEmail}
            onSendConsent={async () => {
              setSubmitting(true);
              try {
                const res = await api.startParentalConsent(
                  submissionId!,
                  { email, parentEmail }
                );
                setConsentSent(true);
                setConsentMessage(res.mockConsentMessage);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setSubmitting(false);
              }
            }}
            onConfirm={async () => {
              setSubmitting(true);
              try {
                // Only checks: the guardian consents from their own link.
                const res = await api.confirmParentalConsent(submissionId!, {
                  email
                });
                setSubmissionStatus(res.status);
                next();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setSubmitting(false);
              }
            }}
            onBack={back}
            submitting={submitting}
            error={error}
          />
        )}

        {step === "waivers" && (
          <WaiversStep
            documents={waivers}
            loadError={waiversError}
            onRetryLoad={() => {
              if (submissionId) void loadWaivers(submissionId, email.trim());
            }}
            signerName={signerName || fullName}
            sportCode={context.season.sportCode}
            eligibilityFlags={eligibilityFlags}
            photoRelease={photoRelease}
            photoReleaseAccepted={photoReleaseAccepted}
            onPhotoReleaseChange={setPhotoReleaseAccepted}
            error={error}
            onSign={signDocument}
            onBack={back}
            onNext={() => {
              setError(null);
              next();
            }}
          />
        )}

        {step === "tier" && (
          <TierStep
            tiers={tiers}
            value={pricingTierId}
            onChange={setPricingTierId}
            onBack={back}
            onNext={submitTier}
          />
        )}

        {step === "questions" && (
          <QuestionsStep
            definition={context.formDefinition}
            initialAnswers={answers}
            onChange={setAnswers}
            submissionType={submissionType}
            sportCode={context.season.sportCode}
            dobDate={dobDate}
            onDobChange={setDobDate}
            teamName={teamName}
            teamDivision={teamDivision}
            teamColor={teamColor}
            divisions={context.divisions}
            onTeamNameChange={setTeamName}
            onTeamDivisionChange={setTeamDivision}
            onTeamColorChange={setTeamColor}
            onBack={back}
            onNext={submitDetails}
          />
        )}

        {step === "review" && (
          <ReviewStep
            season={context.season}
            submissionType={submissionType!}
            email={email}
            fullName={fullName}
            tier={tiers.find((t) => t.id === pricingTierId) ?? null}
            eligibilityFlags={eligibilityFlags}
            error={error}
            submitting={submitting}
            onBack={back}
            onSubmit={continueToPayment}
          />
        )}

        {step === "payment" && (
          <PaymentStep
            tier={tiers.find((t) => t.id === pricingTierId) ?? null}
            submitting={submitting}
            error={error}
            onPay={(paymentOption, useWallet) => pay("succeeded", paymentOption, useWallet)}
            onPayOffline={() => pay("offline")}
            loadWallet={submissionId ? () => api.walletBalance(submissionId, email.trim()) : undefined}
            onBack={back}
          />
        )}

        {step === "done" && (
          <DoneStep
            email={email}
            submissionId={submissionId!}
            resumed={resumed}
            status={submissionStatus}
            isMinor={isMinor}
            context={context}
            submissionType={submissionType}
            api={api}
          />
        )}
      </div>

      <p className="mt-6 text-center text-[11px] text-fg-muted">
        Your answers are saved with this season&apos;s registration. Sign in with
        the same email to come back to it.
      </p>
    </div>
  );
}

function fmtDate(s: string, timeZone?: string) {
  // Pin locale AND zone so SSR (server zone) and the browser agree. The
  // season's zone also gives the date the league means: a window closing
  // 23:59 ET on Nov 13 used to read "Nov 14" on a UTC server and caused
  // a hydration mismatch on every funnel mount.
  const opts: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" };
  try {
    return new Date(s).toLocaleDateString("en-US", { ...opts, timeZone: timeZone || "UTC" });
  } catch {
    try {
      return new Date(s).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
    } catch {
      return s;
    }
  }
}

/**
 * 6-phase stepper that maps the engine's 9 internal states onto the
 * mockup's coarser phases:
 *
 *   1 Path         ← path
 *   2 Account      ← account
 *   3 Details      ← tier + questions
 *   4 Compliance   ← consent + waivers
 *   5 Payment      ← review + payment
 *   ⋯ Confirmation ← done
 *
 * Numbered circles + label-below layout, with a connector line that
 * turns green when crossed (matches the mockup chrome).
 */
type Phase = 1 | 2 | 3 | 4 | 5 | 6;

const PHASE_LABELS: Record<Phase, string> = {
  1: "Path",
  2: "Account",
  3: "Details",
  4: "Compliance",
  5: "Payment",
  6: "Confirmation"
};

function phaseFor(step: Step): Phase {
  // Mockup mapping: 1 Path · 2 Account · 3 Details · 4 Compliance ·
  // 5 Payment · 6 Confirmation. tier picker lives inside Payment in
  // the mockup (the invoice + payment-option card composes both); we
  // keep tier as a separate inner state for back-compat but pin it to
  // Phase 5 in the stepper.
  switch (step) {
    case "path":
    case "division":
      return 1;
    case "account":
      return 2;
    case "questions":
      return 3;
    case "consent":
    case "waivers":
      return 4;
    case "tier":
    case "review":
    case "payment":
      return 5;
    case "done":
      return 6;
  }
}

function PhaseStepper({ activePhase }: { activePhase: Phase }) {
  const phases: Phase[] = [1, 2, 3, 4, 5, 6];
  return (
    <ol className="flex w-full items-center gap-2 sm:gap-3">
      {phases.map((p, i) => {
        const isActive = p === activePhase;
        const isDone = p < activePhase;
        const isFuture = p > activePhase;
        const isLast = p === 6;
        return (
          <li key={p} className="flex flex-1 items-center gap-2 sm:gap-3">
            <div className="flex flex-col items-center gap-1.5">
              <span
                className={
                  isActive
                    ? "flex h-8 w-8 items-center justify-center rounded-full border-2 border-accent bg-accent font-mono text-[12px] font-medium text-bg"
                    : isDone
                      ? "flex h-8 w-8 items-center justify-center rounded-full border-2 border-emerald-500 bg-emerald-500 text-white"
                      : "flex h-8 w-8 items-center justify-center rounded-full border-2 border-border bg-bg-subtle font-mono text-[12px] font-medium text-fg-muted"
                }
              >
                {isDone ? (
                  <Check className="h-4 w-4" strokeWidth={2.5} />
                ) : isLast ? (
                  <span aria-hidden>⋯</span>
                ) : (
                  <span className="tabular-nums">{p}</span>
                )}
              </span>
              <span
                className={
                  isActive
                    ? "hidden whitespace-nowrap font-mono text-[11px] uppercase tracking-widest text-fg sm:inline"
                    : isDone
                      ? "hidden whitespace-nowrap font-mono text-[11px] uppercase tracking-widest text-emerald-600 dark:text-emerald-400 sm:inline"
                      : "hidden whitespace-nowrap font-mono text-[11px] uppercase tracking-widest text-fg-muted sm:inline"
                }
              >
                {PHASE_LABELS[p]}
              </span>
            </div>
            {i < phases.length - 1 ? (
              <div className="h-px flex-1 self-start mt-4 bg-border">
                <div
                  className={
                    p < activePhase
                      ? "h-full bg-emerald-500"
                      : "h-full bg-transparent"
                  }
                />
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function PathStep({
  value,
  onChange,
  onNext,
  offeredPaths
}: {
  value: SubmissionType | null;
  onChange: (v: SubmissionType) => void;
  onNext: () => void;
  /** Paths the season offers (kernel allowedSubmissionTypes). */
  offeredPaths: readonly string[];
}) {
  const visiblePaths = PATHS.filter((p) => offeredPaths.includes(p.value));
  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-border bg-surface-1 p-5">
        <h2 className="text-[14px] font-semibold tracking-tight text-fg">
          How are you registering?
        </h2>
        <p className="mt-0.5 text-[12px] text-fg-muted">
          Choose the path that applies to you
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {visiblePaths.map((p) => {
            const on = value === p.value;
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => onChange(p.value)}
                className={
                  on
                    ? "flex items-start gap-3 rounded-lg border border-accent bg-accent/5 p-4 text-left ring-2 ring-accent/30 transition-colors"
                    : "flex items-start gap-3 rounded-lg border border-border bg-bg-subtle p-4 text-left transition-colors hover:border-fg-muted"
                }
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[18px] ${p.iconBg}`}
                  aria-hidden
                >
                  {p.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold text-fg">
                    {p.title}
                  </span>
                  <span className="mt-1 block text-[12px] text-fg-muted">
                    {p.blurb}
                  </span>
                </span>
                {on ? (
                  <Check
                    className="h-4 w-4 shrink-0 text-accent"
                    strokeWidth={2.25}
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      </section>

      <div className="flex justify-end">
        <Button onClick={onNext} disabled={!value}>
          Next <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/**
 * P2-2 — division picker. Only shown when the season has 2+ divisions
 * (one auto-picks at funnel init; zero is org-only and skips this
 * step entirely). The pick lands in `registrations.division_id` via
 * the startSubmission call, which narrows downstream surfaces (Find a
 * team, captain inbox routing) to teams with an active DTE in the
 * chosen division.
 */
function DivisionStep({
  divisions,
  value,
  onChange,
  onBack,
  onNext
}: {
  divisions: Array<{ id: string; name: string; tier: string | null }>;
  value: string | null;
  onChange: (id: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-border bg-surface-1 p-5">
        <h2 className="text-[14px] font-semibold tracking-tight text-fg">
          Which division are you registering for?
        </h2>
        <p className="mt-0.5 text-[12px] text-fg-muted">
          Captains can only see your registration if you pick the same division as their team.
        </p>

        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {divisions.map((d) => {
            const on = value === d.id;
            return (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => onChange(d.id)}
                  className={
                    on
                      ? "flex w-full items-center gap-3 rounded-lg border border-accent bg-accent/5 p-4 text-left ring-2 ring-accent/30 transition-colors"
                      : "flex w-full items-center gap-3 rounded-lg border border-border bg-bg-subtle p-4 text-left transition-colors hover:border-fg-muted"
                  }
                >
                  <span
                    aria-hidden
                    className={
                      on
                        ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/20 font-mono text-[11px] font-semibold text-accent"
                        : "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg font-mono text-[11px] font-semibold text-fg-muted"
                    }
                  >
                    {d.tier ?? "—"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-semibold text-fg">
                      {d.name}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-fg-muted">
                      Tier {d.tier ?? "—"}
                    </span>
                  </span>
                  {on ? (
                    <Check
                      className="h-4 w-4 shrink-0 text-accent"
                      strokeWidth={2.25}
                    />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <Button onClick={onNext} disabled={!value}>
          Next <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/**
 * Mockup-aligned Phase 1 chrome — sign-in primary, create-account
 * secondary. The default tab is **Sign in** since most repeat traffic
 * is returning players resuming a draft. Tab toggle at the top swaps
 * between the two flows; only one form is visible at a time so admins
 * never misfile credentials in the wrong section.
 *
 * DOB is captured on Phase 2 (Details) per the mockup, so the parental-
 * consent decision is deferred until the eligibility re-check at the
 * end of Phase 2.
 */
function AccountStep({
  email,
  firstName,
  lastName,
  password,
  confirmPassword,
  phone,
  dobDate,
  submitting,
  error,
  onEmailChange,
  onFirstNameChange,
  onLastNameChange,
  onPasswordChange,
  onConfirmPasswordChange,
  onPhoneChange,
  onDobChange,
  onBack,
  onSubmit,
  onSignIn
}: {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  confirmPassword: string;
  phone: string;
  dobDate: string;
  submitting: boolean;
  error: string | null;
  onEmailChange: (v: string) => void;
  onFirstNameChange: (v: string) => void;
  onLastNameChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onConfirmPasswordChange: (v: string) => void;
  onPhoneChange: (v: string) => void;
  onDobChange: (v: string) => void;
  onBack: () => void;
  onSubmit: () => void;
  onSignIn: (emailOverride: string, password: string) => void;
}) {
  const [mode, setMode] = useState<"sign_in" | "create">("sign_in");
  // Independent state for the sign-in tab so it doesn't entangle with
  // the create-account inputs (filling sign-in email shouldn't pre-fill
  // the create form, and vice versa).
  const [signInEmail, setSignInEmail] = useState("");
  const [signInPassword, setSignInPassword] = useState("");

  // Today (local YYYY-MM-DD) — drives both the date input's `max` and
  // the DOB validation. DOB has to be a real past date; an empty value
  // is also invalid because the eligibility checks depend on it.
  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const emailOk = /.+@.+\..+/.test(email.trim());
  const nameOk = firstName.trim().length > 0 && lastName.trim().length > 0;
  const pwOk = password.length >= 8;
  const pwMatches = password === confirmPassword;
  const dobOk = !!dobDate && dobDate < todayIso;
  const valid = emailOk && nameOk && pwOk && pwMatches && dobOk;
  const signInEmailOk = /.+@.+\..+/.test(signInEmail.trim());

  return (
    <div className="space-y-5">
      {/* Tab toggle — sign-in is the default tab since most visitors
          land here from a saved link to resume their draft. */}
      <div
        role="tablist"
        aria-label="Account mode"
        className="inline-flex rounded-lg border border-border bg-bg-subtle p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === "sign_in"}
          onClick={() => setMode("sign_in")}
          className={
            mode === "sign_in"
              ? "rounded-md bg-surface-1 px-4 py-1.5 text-[13px] font-medium text-fg shadow-sm"
              : "rounded-md px-4 py-1.5 text-[13px] font-medium text-fg-muted hover:text-fg"
          }
        >
          Sign in
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "create"}
          onClick={() => setMode("create")}
          className={
            mode === "create"
              ? "rounded-md bg-surface-1 px-4 py-1.5 text-[13px] font-medium text-fg shadow-sm"
              : "rounded-md px-4 py-1.5 text-[13px] font-medium text-fg-muted hover:text-fg"
          }
        >
          Create account
        </button>
      </div>

      {mode === "sign_in" ? (
        <section className="rounded-xl border border-border bg-surface-1 p-5">
          <p className="text-[14px] font-semibold tracking-tight text-fg">
            Sign in to continue
          </p>
          <p className="mt-1 text-[12px] text-fg-muted">
            Use the same email you used last time. Your profile and any
            draft from this season load automatically.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Email *">
              <Input
                type="email"
                value={signInEmail}
                onChange={(e) => setSignInEmail(e.target.value)}
                placeholder="your@email.com"
                autoComplete="email"
                required
              />
            </Field>
            <Field label="Password *">
              <Input
                type="password"
                value={signInPassword}
                onChange={(e) => setSignInPassword(e.target.value)}
                placeholder="Your password"
                autoComplete="current-password"
                required
              />
            </Field>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setMode("create")}
              className="text-[12px] text-fg-muted underline-offset-2 hover:text-fg hover:underline"
            >
              New to SportsPulse? Create an account →
            </button>
            <Button
              type="button"
              disabled={!signInEmailOk || !signInPassword || submitting}
              onClick={() => {
                // Pass the captured email directly. The parent also
                // mirrors it into the funnel-wide email state so the
                // later pay() call uses the same value the submission
                // row was created with — fixes the 404 "submission not
                // found" reported after offline pay.
                const emailValue = signInEmail.trim();
                onEmailChange(emailValue);
                onSignIn(emailValue, signInPassword);
              }}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing in…
                </>
              ) : (
                <>
                  Sign in & continue <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </section>
      ) : (
        <section className="rounded-xl border border-border bg-surface-1 p-5">
          <p className="text-[14px] font-semibold tracking-tight text-fg">
            Create your account
          </p>
          <p className="mt-1 text-[12px] text-fg-muted">
            We'll use these details for league communications and roster
            entries.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="First name *">
              <Input
                value={firstName}
                onChange={(e) => onFirstNameChange(e.target.value)}
                placeholder="Johnny"
                required
              />
            </Field>
            <Field label="Last name *">
              <Input
                value={lastName}
                onChange={(e) => onLastNameChange(e.target.value)}
                placeholder="Kula"
                required
              />
            </Field>
          </div>
          <div className="mt-3 grid gap-4">
            <Field label="Email address *">
              <Input
                type="email"
                value={email}
                onChange={(e) => onEmailChange(e.target.value)}
                placeholder="johnny@pphl.com"
                required
              />
            </Field>
            <Field label="Phone number" hint="Optional — used for SMS reminders">
              <Input
                type="tel"
                value={phone}
                onChange={(e) => onPhoneChange(e.target.value)}
                placeholder="+1 (617) 555-0100"
              />
            </Field>
          </div>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Field
              label="Date of birth *"
              hint="Required for age verification, division-eligibility checks, and parental-consent rules for minors."
            >
              <Input
                type="date"
                value={dobDate}
                onChange={(e) => onDobChange(e.target.value)}
                max={todayIso}
                required
              />
            </Field>
          </div>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Field label="Password *">
              <Input
                type="password"
                value={password}
                onChange={(e) => onPasswordChange(e.target.value)}
                placeholder="Min 8 chars"
                autoComplete="new-password"
                required
              />
            </Field>
            <Field label="Confirm password *">
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => onConfirmPasswordChange(e.target.value)}
                placeholder="Repeat password"
                autoComplete="new-password"
                required
              />
            </Field>
          </div>
          <p className="mt-4 text-[12px] text-fg-muted">
            Your account is ready as soon as you continue. Sign in later with
            this email and password to see your registration.
          </p>
          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setMode("sign_in")}
              className="text-[12px] text-fg-muted underline-offset-2 hover:text-fg hover:underline"
            >
              ← Already have an account? Sign in
            </button>
          </div>
        </section>
      )}

      {error ? (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-[12px] text-rose-700 dark:text-rose-300">
          {error}
        </p>
      ) : null}
      {mode === "create" && !pwMatches && confirmPassword.length > 0 ? (
        <p className="rounded-md bg-amber-500/10 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-300">
          Passwords don't match.
        </p>
      ) : null}

      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          disabled={submitting}
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <Button onClick={onSubmit} disabled={!valid || submitting}>
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating
              account…
            </>
          ) : (
            <>
              Next: Details <ArrowRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function ConsentStep({
  submissionId,
  email,
  parentEmail,
  consentSent,
  consentMessage,
  onParentEmailChange,
  onSendConsent,
  onConfirm,
  onBack,
  submitting,
  error
}: {
  submissionId: string;
  email: string;
  parentEmail: string;
  consentSent: boolean;
  consentMessage: { to: string; subject: string; body: string } | null;
  onParentEmailChange: (v: string) => void;
  onSendConsent: () => void;
  onConfirm: () => void;
  onBack: () => void;
  submitting: boolean;
  error: string | null;
}) {
  const validParent = /.+@.+\..+/.test(parentEmail.trim());
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-fg">Parental consent required</h2>
        <p className="mt-1 text-sm text-fg-muted">
          You're under 18, so a parent or guardian must confirm before you
          can pay. We'll email them a link. Come back here once they have
          confirmed.
        </p>
      </div>

      <Field label="Parent / guardian email">
        <Input
          type="email"
          value={parentEmail}
          onChange={(e) => onParentEmailChange(e.target.value)}
          placeholder="parent@example.com"
        />
      </Field>

      <Button
        type="button"
        variant="secondary"
        disabled={!validParent || submitting}
        onClick={onSendConsent}
      >
        {submitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…
          </>
        ) : (
          <>Send consent request</>
        )}
      </Button>

      {consentSent && !consentMessage && (
        <p className="rounded-md bg-bg-subtle px-3 py-2 text-[13px] text-fg">
          We emailed {parentEmail}. When they confirm, click the button below.
        </p>
      )}

      {consentMessage && (
        <div className="space-y-2 rounded-md border border-border bg-bg-subtle p-3">
          <p className="text-[12px] font-medium text-fg">
            Email is not set up on this environment. Send this message to{" "}
            {consentMessage.to} yourself.
          </p>
          <textarea
            readOnly
            value={consentMessage.body}
            rows={Math.min(10, consentMessage.body.split("\n").length + 1)}
            className="w-full resize-y rounded-md border border-border bg-surface-1 p-2 font-mono text-[11px] leading-relaxed text-fg"
          />
        </div>
      )}

      {error && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between">
        <Button type="button" variant="ghost" onClick={onBack} disabled={submitting}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <Button
          onClick={onConfirm}
          disabled={!consentSent || submitting}
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Checking…
            </>
          ) : (
            <>My parent has confirmed <ArrowRight className="ml-2 h-4 w-4" /></>
          )}
        </Button>
      </div>
    </div>
  );
}

/**
 * Phase 3 (Compliance). Cards:
 *   1. Automated eligibility checks (flags from the eligibility check).
 *   2. Documents to sign: one scroll-and-type card per typed-signature
 *      document (liability waiver), one confirmation per acknowledgment
 *      (code of conduct). The list and the signed state come from the
 *      API for this registration; signing goes through the API.
 *   3. Photo / media release — optional toggle.
 *
 * Continue is enabled only when the API reports every required document
 * signed. The API refuses payment otherwise (REG-5), and the step names
 * what is still missing.
 */
function WaiversStep({
  documents,
  loadError,
  onRetryLoad,
  signerName,
  sportCode,
  eligibilityFlags,
  photoRelease,
  photoReleaseAccepted,
  onPhotoReleaseChange,
  onSign,
  onBack,
  onNext,
  error
}: {
  /** null until the API list has loaded. */
  documents: WaiverDoc[] | null;
  loadError: string | null;
  onRetryLoad: () => void;
  signerName: string;
  sportCode: string;
  eligibilityFlags: string[] | null;
  photoRelease: { enabled: boolean; content: string };
  photoReleaseAccepted: boolean;
  onPhotoReleaseChange: (v: boolean) => void;
  onSign: (key: string, signatureName: string) => Promise<void>;
  onBack: () => void;
  onNext: () => void;
  error: string | null;
}) {
  const docs = documents ?? [];
  const typedDocs = docs.filter((d) => (d.signMode ?? "typed_name") === "typed_name");
  const ackDocs = docs.filter((d) => d.signMode === "acknowledge");
  const outstanding = docs.filter((d) => !d.signed);
  const flags = eligibilityFlags ?? [];
  const isHockey = sportCode === "HOCKEY_ICE";
  // Three-state model — the previous 2-state showed green ✓ for checks
  // whose flag is never populated, which lied to the player. `pending`
  // is for checks the platform can't automate yet (manual admin review).
  type CheckState = "pass" | "fail" | "pending";
  type CheckRow = { label: string; state: CheckState; body: string };
  const ageFail =
    flags.includes("age_division_mismatch") ||
    flags.includes("dob_missing") ||
    flags.some((f) => f.startsWith("age_out_of_range"));
  const checks: CheckRow[] = [
    {
      label: "Age / division fit",
      state: ageFail ? "fail" : "pass",
      body: ageFail
        ? flags.includes("dob_missing")
          ? "Date of birth is missing — go back and add it in the Account step."
          : "Age may not match the configured division range. Admin will review."
        : "You're within the allowed age range for this division."
    },
    {
      label: "No duplicate account",
      state: flags.includes("duplicate_subject") ? "fail" : "pass",
      body: flags.includes("duplicate_subject")
        ? "Possible duplicate found — admin will review manually."
        : "No existing profile with matching name + DOB found."
    }
  ];
  if (isHockey) {
    const idMissing = flags.includes("usa_hockey_id_missing");
    const idInvalid = flags.includes("usa_hockey_id_format_invalid");
    checks.push({
      label: "USA Hockey ID",
      state: idMissing || idInvalid ? "fail" : "pass",
      body: idMissing
        ? "USA Hockey ID is missing — add it on the Player details step."
        : idInvalid
          ? "USA Hockey ID format is invalid (6–12 alphanumeric)."
          : "Format valid."
    });
    // Governing-body lookup + level/division match are both pending —
    // there is no automated verification yet, and showing a fake green
    // tick was lying to the player. Admin review picks both up.
    checks.push({
      label: "Governing body verification",
      state: "pending",
      body: "Will be verified against the USA Hockey roster during admin review."
    });
    checks.push({
      label: "Level / division match",
      state: "pending",
      body: "Self-reported level will be reviewed against the division during admin review."
    });
  }

  const continueDisabled = documents === null || outstanding.length > 0;
  const verb = (d: WaiverDoc) => (d.signMode === "acknowledge" ? "Accept" : "Sign");

  return (
    <div className="space-y-5">
      {/* Card 1 — eligibility checks */}
      <section className="rounded-xl border border-border bg-surface-1 p-5">
        <p className="text-[14px] font-semibold tracking-tight text-fg">
          Automated eligibility checks
        </p>
        <ul className="mt-4 divide-y divide-border">
          {checks.map((c) => {
            const iconClass =
              c.state === "fail"
                ? "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--tint-amber-bg)] text-[var(--tint-amber-fg)]"
                : c.state === "pending"
                  ? "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg-muted"
                  : "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--tint-emerald-bg)] text-[var(--tint-emerald-fg)]";
            return (
              <li
                key={c.label}
                className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0"
              >
                <span className={iconClass}>
                  {c.state === "fail" ? (
                    "!"
                  ) : c.state === "pending" ? (
                    <Clock className="h-3.5 w-3.5" strokeWidth={2} />
                  ) : (
                    <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                  )}
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-fg">{c.label}</p>
                  <p className="mt-0.5 text-[12px] text-fg-muted">{c.body}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {documents === null ? (
        <section className="rounded-xl border border-border bg-surface-1 p-5">
          {loadError ? (
            <div className="space-y-3">
              <p role="alert" className="text-[13px] text-rose-700 dark:text-rose-300">
                Could not load the documents you need to sign: {loadError}
              </p>
              <Button type="button" variant="secondary" onClick={onRetryLoad}>
                Try again
              </Button>
            </div>
          ) : (
            <p className="flex items-center gap-2 text-[13px] text-fg-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading the documents to sign…
            </p>
          )}
        </section>
      ) : null}

      {typedDocs.length > 0 ? (
        <section className="rounded-xl border border-border bg-surface-1 p-5">
          <p className="text-[14px] font-semibold tracking-tight text-fg">
            {typedDocs.length === 1 ? "Sign to continue" : `Documents to sign (${typedDocs.length})`}
          </p>
          <ul className="mt-4 space-y-3">
            {typedDocs.map((d) => (
              <WaiverCard
                key={d.key ?? d.documentId}
                doc={d}
                isRequired
                isSigned={!!d.signed}
                signedAt={d.signedAt ?? null}
                fullName={signerName}
                onSign={(name) => onSign(d.key ?? d.versionId, name)}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {ackDocs.map((d) => (
        <AcknowledgeCard
          key={d.key ?? d.documentId}
          doc={d}
          onAccept={() => onSign(d.key ?? d.versionId, signerName)}
        />
      ))}

      {/* Photo / media release (optional, never blocks) */}
      {photoRelease.enabled ? (
        <section className="rounded-xl border border-border bg-surface-1 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[14px] font-semibold tracking-tight text-fg">
              Photo / media release
            </p>
            <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
              Optional
            </span>
          </div>
          <label className="mt-3 flex cursor-pointer items-start justify-between gap-3 rounded-md border border-border bg-bg-subtle p-4">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-fg">{photoRelease.content}</p>
              <p className="mt-0.5 text-[12px] text-fg-muted">
                Optional. You can decline without affecting your registration.
              </p>
            </div>
            <ToggleSwitch
              checked={photoReleaseAccepted}
              onChange={onPhotoReleaseChange}
              label="Photo / media release"
            />
          </label>
        </section>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[13px] text-rose-700 dark:text-rose-300"
        >
          {error}
        </p>
      ) : null}

      {outstanding.length > 0 ? (
        <p className="text-[12px] text-fg-muted">
          Still to do: {outstanding.map((d) => `${verb(d).toLowerCase()} the ${d.name}`).join(", ")}.
        </p>
      ) : null}

      <div className="flex items-center justify-between">
        <Button type="button" variant="ghost" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <Button onClick={onNext} disabled={continueDisabled}>
          {documents === null
            ? "Loading…"
            : outstanding.length === 1
              ? `${verb(outstanding[0]!)} the ${outstanding[0]!.name}`
              : outstanding.length > 1
                ? `${outstanding.length} documents to sign`
                : "Next: Payment"}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/**
 * One-confirmation document (code of conduct). Switching it on records
 * the acknowledgment through the API; the switch shows the API's answer
 * and cannot be switched off once recorded.
 */
function AcknowledgeCard({
  doc,
  onAccept
}: {
  doc: WaiverDoc;
  onAccept: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <section className="rounded-xl border border-border bg-surface-1 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[14px] font-semibold tracking-tight text-fg">{doc.name}</p>
        {doc.signed ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
            <Check className="h-3 w-3" strokeWidth={2.25} />
            Accepted
          </span>
        ) : null}
      </div>
      <label className="mt-3 flex cursor-pointer items-start justify-between gap-3 rounded-md border border-border bg-bg-subtle p-4">
        <div className="min-w-0 flex-1">
          <p className="whitespace-pre-line text-[13px] font-medium text-fg">
            {doc.contentHtml}
          </p>
          <p className="mt-0.5 text-[12px] text-fg-muted">
            {doc.signed
              ? "Accepted. This is on record with the league."
              : "Required. Switch on to accept before you continue."}
          </p>
        </div>
        {busy ? (
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-fg-muted" />
        ) : (
          <ToggleSwitch
            checked={!!doc.signed}
            label={doc.name}
            onChange={async (v) => {
              if (doc.signed || !v) return;
              setBusy(true);
              setErr(null);
              try {
                await onAccept();
              } catch (e) {
                setErr((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          />
        )}
      </label>
      {err ? (
        <p role="alert" className="mt-2 text-[12px] text-rose-700 dark:text-rose-300">
          Couldn't record your acceptance: {err}
        </p>
      ) : null}
    </section>
  );
}

/** Shown instead of the funnel when the season is not taking registrations. */
function RegistrationClosed({
  seasonName,
  title,
  message
}: {
  seasonName: string;
  title: string;
  message: string;
}) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <header className="space-y-1">
        <h1 className="text-[28px] font-semibold tracking-tight text-fg">{title}</h1>
        <p className="text-[12px] text-fg-muted">{seasonName}</p>
      </header>
      <div className="mt-8 rounded-xl border border-border bg-surface-1 p-6">
        <p className="text-[14px] text-fg">{message}</p>
      </div>
    </div>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  label
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={
        checked
          ? "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full bg-blue-500 transition-colors"
          : "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full bg-fg-muted/30 transition-colors"
      }
    >
      <span
        className={
          checked
            ? "inline-block h-5 w-5 translate-x-5 rounded-full bg-white shadow transition-transform"
            : "inline-block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow transition-transform"
        }
      />
    </button>
  );
}

function TierStep({
  tiers,
  value,
  onChange,
  onBack,
  onNext
}: {
  tiers: PricingTier[];
  value: string | null;
  onChange: (v: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-fg">Pick a pricing tier</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Choose the tier that matches your situation. Payment plans available
          on tiers that show one.
        </p>
      </div>

      <div className="grid gap-3">
        {tiers.map((t) => {
          const on = value === t.id;
          const free = t.isFree || t.fullPriceCents === 0;
          // A full price stays listed so the player sees why, but cannot be
          // picked (the server refuses it too).
          const full = tierIsFull(t) && !on;
          return (
            <button
              key={t.id}
              type="button"
              disabled={full}
              onClick={() => onChange(t.id)}
              className={
                on
                  ? "flex items-start justify-between gap-4 rounded-lg border border-accent bg-accent/5 p-4 text-left ring-2 ring-accent/30"
                  : full
                    ? "flex cursor-not-allowed items-start justify-between gap-4 rounded-lg border border-border bg-surface-1 p-4 text-left opacity-60"
                    : "flex items-start justify-between gap-4 rounded-lg border border-border bg-surface-1 p-4 text-left hover:border-fg-muted"
              }
            >
              <div className="space-y-1">
                <p className="text-[13px] font-semibold text-fg">{t.name}</p>
                {t.description && (
                  <p className="text-[12px] leading-relaxed text-fg-muted">
                    {t.description}
                  </p>
                )}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {tierOffersPlan(t) && (
                    <Chip>Payment plan · {t.installmentCount}x</Chip>
                  )}
                  {t.isReturningTeamPricing && <Chip>Returning teams</Chip>}
                  {t.usageLimit ? (
                    <Chip>
                      {tierIsFull(t) ? "Full" : `${t.usageLimit - t.usageCount} of ${t.usageLimit} left`}
                    </Chip>
                  ) : null}
                </div>
              </div>
              <div className="text-right">
                <p className="font-mono text-[16px] font-semibold tabular-nums text-fg">
                  {free
                    ? "Free"
                    : `${(t.fullPriceCents / 100).toFixed(2)} ${t.currency}`}
                </p>
                {on && (
                  <Check
                    className="ml-auto mt-1 h-4 w-4 text-accent"
                    strokeWidth={2.25}
                  />
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <Button type="button" variant="ghost" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <Button onClick={onNext} disabled={!value}>
          Continue <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/**
 * Phase 2 (Details). Renders the mockup's two-card layout:
 *
 *   - Team information card — only when path=team. Captures team name,
 *     division, primary colour. Per the architectural directive
 *     ('/forms is the source of truth') the player-details fields below
 *     come entirely from the form's active version via FormRenderer —
 *     the mockup's specific fields (DOB, gender, position, USA Hockey ID,
 *     emergency contact, medical notes) are what one well-configured
 *     form produces, not hardcoded in the funnel.
 */
function QuestionsStep({
  definition,
  initialAnswers,
  onChange,
  submissionType,
  sportCode,
  dobDate,
  onDobChange,
  teamName,
  teamDivision,
  teamColor,
  divisions,
  onTeamNameChange,
  onTeamDivisionChange,
  onTeamColorChange,
  onBack,
  onNext
}: {
  definition: PublicSeasonContext["formDefinition"];
  initialAnswers: AnswerMap;
  onChange: (next: AnswerMap) => void;
  submissionType: SubmissionType | null;
  sportCode: string;
  dobDate: string;
  /** Edit-through to the parent funnel's dobDate. Lets returning users
   * who never set a DOB at sign-up correct it here without going back
   * to the Account step (which only exists in create mode). */
  onDobChange: (v: string) => void;
  teamName: string;
  /** Now holds the division UUID, not free text. */
  teamDivision: string;
  teamColor: string;
  divisions: PublicSeasonContext["divisions"];
  onTeamNameChange: (v: string) => void;
  onTeamDivisionChange: (v: string) => void;
  onTeamColorChange: (v: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const showTeamCard = submissionType === "team";
  // Player-profile card runs on every solo path: free agents NEED these
  // for the captain pool, and regular individual players need them so
  // their /roster profile shows up populated. Reserved answer keys
  // mirror the freeAgentPoolEntries columns 1:1 so the approve handler
  // can upsert without a translation layer.
  const showPlayerProfile =
    submissionType === "free_agent" || submissionType === "individual";
  // USA Hockey ID is hockey-only. Other sports get neither the input
  // nor the corresponding eligibility check rows downstream.
  const isHockey = sportCode === "HOCKEY_ICE";
  const teamValid =
    !showTeamCard ||
    (teamName.trim().length > 0 && teamDivision.trim().length > 0);

  // Reserved keys live in the shared answers map so the funnel's
  // existing persistence covers them (mergeMetadata in startSubmission).
  // Older drafts stored C1 / C2 / C3; show them as C or D (REG-21).
  const skillLevel = normalizeSkillLevel(initialAnswers.skill_level) ?? "";
  const positions = Array.isArray(initialAnswers.positions)
    ? (initialAnswers.positions as string[])
    : [];
  const availability =
    (initialAnswers.availability as Record<string, boolean> | undefined) ?? {};
  const faNote =
    typeof initialAnswers.fa_note === "string"
      ? (initialAnswers.fa_note as string)
      : "";
  const jerseyNumberRaw =
    initialAnswers.jersey_number !== undefined && initialAnswers.jersey_number !== null
      ? String(initialAnswers.jersey_number)
      : "";
  const usaHockeyIdRaw =
    typeof initialAnswers.usa_hockey_id === "string"
      ? (initialAnswers.usa_hockey_id as string)
      : "";
  const usaHockeyId = usaHockeyIdRaw.trim();
  const usaHockeyIdValid =
    !isHockey || /^[A-Z0-9]{6,12}$/i.test(usaHockeyId);

  // Computed age display — DOB was collected on the Account step and
  // travels with the submission's metadata, so here we surface it
  // readonly so the player sees what the eligibility check will use.
  const age = (() => {
    if (!dobDate) return null;
    const d = new Date(`${dobDate}T00:00:00`);
    if (Number.isNaN(d.getTime())) return null;
    const now = new Date();
    let a = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
    return a;
  })();

  function patchAnswers(patch: Record<string, unknown>) {
    onChange({ ...initialAnswers, ...patch });
  }

  function toggleDay(day: string) {
    patchAnswers({
      availability: { ...availability, [day]: !availability[day] }
    });
  }

  function togglePosition(code: string) {
    const has = positions.includes(code);
    patchAnswers({
      positions: has ? positions.filter((p) => p !== code) : [...positions, code]
    });
  }

  const playerProfileValid =
    !showPlayerProfile ||
    (skillLevel.length > 0 &&
      positions.length > 0 &&
      Object.values(availability).some((v) => v === true) &&
      usaHockeyIdValid);

  return (
    <div className="space-y-5">
      {showTeamCard ? (
        <section className="rounded-xl border border-border bg-surface-1 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[14px] font-semibold tracking-tight text-fg">
              Team information
            </p>
            <span className="rounded-full bg-blue-500/15 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-blue-700 dark:text-blue-300">
              Team reg
            </span>
          </div>
          <div className="mt-4">
            <Field label="Team name *">
              <Input
                value={teamName}
                onChange={(e) => onTeamNameChange(e.target.value)}
                placeholder="Unique within your division for this season"
                required
              />
            </Field>
          </div>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Field
              label="Division *"
              hint={
                divisions.length === 0
                  ? "This season has no divisions configured yet."
                  : "Pick the division your team will play in."
              }
            >
              <select
                value={teamDivision}
                onChange={(e) => onTeamDivisionChange(e.target.value)}
                required
                disabled={divisions.length === 0}
                className="h-10 w-full rounded-md border border-border bg-bg-subtle px-3 text-[13px] text-fg outline-none focus:border-accent disabled:opacity-50"
              >
                <option value="">
                  {divisions.length === 0
                    ? "No divisions available"
                    : "Pick a division…"}
                </option>
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                    {d.tier ? ` · ${d.tier}` : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Team colour">
              <input
                type="color"
                value={teamColor}
                onChange={(e) => onTeamColorChange(e.target.value)}
                className="h-10 w-full cursor-pointer rounded-md border border-border bg-surface-1 p-1"
                aria-label="Team primary colour"
              />
            </Field>
          </div>
        </section>
      ) : null}

      <section className="rounded-xl border border-border bg-surface-1 p-5">
        <p className="text-[14px] font-semibold tracking-tight text-fg">
          Player details
        </p>
        <p className="mt-1 text-[12px] text-fg-muted">
          Answers are saved against the question key — labels can be reworded
          in /forms without losing data. Configure these fields from the
          Form builder section in /forms/[id].
        </p>
        <div className="mt-4">
          <FormRenderer
            definition={definition}
            initialAnswers={initialAnswers}
            onChange={onChange}
          />
        </div>
      </section>

      {showPlayerProfile ? (
        <section className="rounded-xl border border-border bg-surface-1 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[14px] font-semibold tracking-tight text-fg">
              Player profile
            </p>
            <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-emerald-700 dark:text-emerald-300">
              {submissionType === "free_agent" ? "Free-agent pool" : "Roster"}
            </span>
          </div>
          <p className="mt-1 text-[12px] text-fg-muted">
            {submissionType === "free_agent"
              ? "Captains in your division use this to evaluate fit before claiming you. All four are required."
              : "Your skill level, position, and availability — used by your team's captain to slot you in lineups."}
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field
              label="Date of birth *"
              hint="Used for the eligibility check and parental-consent rules. Editable here so a returning user can correct a missing or wrong DOB without going back."
            >
              <div className="flex items-center gap-3">
                <Input
                  type="date"
                  value={dobDate}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => onDobChange(e.target.value)}
                  required
                  aria-invalid={!dobDate ? true : undefined}
                  className="flex-1"
                />
                {age !== null ? (
                  <span className="font-mono text-[11px] uppercase tracking-widest text-fg-muted">
                    age {age}
                  </span>
                ) : null}
              </div>
            </Field>
            {isHockey ? (
              <Field
                label="USA Hockey ID *"
                hint="6–12 alphanumeric. We re-verify against the USA Hockey roster after submission."
              >
                <Input
                  value={usaHockeyIdRaw}
                  onChange={(e) =>
                    patchAnswers({ usa_hockey_id: e.target.value.toUpperCase() })
                  }
                  placeholder="e.g. 1234567890"
                  required
                  aria-invalid={
                    usaHockeyId.length > 0 && !usaHockeyIdValid ? true : undefined
                  }
                />
                {usaHockeyId.length > 0 && !usaHockeyIdValid ? (
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-[var(--tint-rose-fg)]">
                    Format must be 6–12 letters or digits.
                  </p>
                ) : null}
              </Field>
            ) : null}
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field
              label="Skill level *"
              hint="The same levels the league uses for divisions. Admins check your level against the division."
            >
              <select
                value={skillLevel}
                onChange={(e) => patchAnswers({ skill_level: e.target.value })}
                required
                className="h-10 w-full rounded-md border border-border bg-bg-subtle px-3 text-[13px] text-fg outline-none focus:border-accent"
              >
                <option value="">Pick a level…</option>
                {SKILL_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {SKILL_LEVEL_LABELS[l]} ({SKILL_LEVEL_HINTS[l].toLowerCase()})
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Preferred positions *"
              hint="Tick every position you'd play. Captains see all your picks."
            >
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    { code: "C", label: "Center" },
                    { code: "LW", label: "Left Wing" },
                    { code: "RW", label: "Right Wing" },
                    { code: "D", label: "Defense" },
                    { code: "G", label: "Goalie" }
                  ] as const
                ).map((pos) => {
                  const on = positions.includes(pos.code);
                  return (
                    <button
                      key={pos.code}
                      type="button"
                      onClick={() => togglePosition(pos.code)}
                      className={
                        on
                          ? "h-9 rounded-md border border-accent bg-accent/10 px-3 text-[12px] font-medium text-accent"
                          : "h-9 rounded-md border border-border bg-bg-subtle px-3 text-[12px] font-medium text-fg-muted hover:border-border-strong hover:text-fg"
                      }
                    >
                      {pos.label}
                    </button>
                  );
                })}
              </div>
            </Field>
          </div>
          <div className="mt-4">
            <Field
              label="Availability *"
              hint="Tick every day you can typically play. Captains use this to match practice + game schedules."
            >
              <div className="flex flex-wrap gap-1.5">
                {(
                  ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const
                ).map((d) => {
                  const on = !!availability[d];
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleDay(d)}
                      className={
                        on
                          ? "h-9 rounded-md border border-accent bg-accent/10 px-3 font-mono text-[11px] uppercase tracking-widest text-accent"
                          : "h-9 rounded-md border border-border bg-bg-subtle px-3 font-mono text-[11px] uppercase tracking-widest text-fg-muted hover:border-border-strong hover:text-fg"
                      }
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </Field>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field
              label="Jersey number preference"
              hint="Optional. 0–99. Captains see this when assigning sweaters; conflicts are resolved at roster lock."
            >
              <Input
                type="number"
                min={0}
                max={99}
                value={jerseyNumberRaw}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "") {
                    patchAnswers({ jersey_number: undefined });
                  } else {
                    const n = Number(v);
                    patchAnswers({
                      jersey_number: Number.isFinite(n) ? Math.max(0, Math.min(99, n)) : undefined
                    });
                  }
                }}
                placeholder="e.g. 17"
              />
            </Field>
            <Field
              label="Note to captains"
              hint="Optional context, e.g. 'Travelling May 12-19, available rest of month.'"
            >
              <Input
                value={faNote}
                onChange={(e) => patchAnswers({ fa_note: e.target.value })}
                placeholder="Optional"
              />
            </Field>
          </div>
        </section>
      ) : null}

      <div className="flex items-center justify-between">
        <Button type="button" variant="ghost" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <Button onClick={onNext} disabled={!teamValid || !playerProfileValid}>
          Next: Compliance <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function ReviewStep({
  season,
  submissionType,
  email,
  fullName,
  tier,
  eligibilityFlags,
  error,
  submitting,
  onBack,
  onSubmit
}: {
  season: PublicSeasonContext["season"];
  submissionType: SubmissionType;
  email: string;
  fullName: string;
  tier: PricingTier | null;
  eligibilityFlags: string[] | null;
  error: string | null;
  submitting: boolean;
  onBack: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-fg">Review &amp; submit</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Last look. We'll create a draft against this season and email you
          the next step.
        </p>
      </div>

      <dl className="divide-y divide-border rounded-lg border border-border bg-surface-1 text-sm">
        <Row label="Season">{season.name}</Row>
        <Row label="Path">{labelForPath(submissionType)}</Row>
        <Row label="Email">{email}</Row>
        {fullName && <Row label="Name">{fullName}</Row>}
        {tier && (
          <Row label="Tier">
            {tier.name}
            {!tier.isFree && (
              <span className="ml-2 font-mono text-[12px] text-fg-muted">
                {(tier.fullPriceCents / 100).toFixed(2)} {tier.currency}
              </span>
            )}
          </Row>
        )}
      </dl>

      {eligibilityFlags && eligibilityFlags.length > 0 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-300">
          <p className="font-medium">Eligibility flags raised:</p>
          <ul className="ml-4 list-disc">
            {eligibilityFlags.map((f) => (
              <li key={f} className="font-mono">
                {f}
              </li>
            ))}
          </ul>
          <p className="mt-1">
            Per spec §6.3 these don't block payment — admin will review
            asynchronously and may request resubmission.
          </p>
        </div>
      )}

      {error && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between">
        <Button type="button" variant="ghost" onClick={onBack} disabled={submitting}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <Button onClick={onSubmit} disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Continuing…
            </>
          ) : (
            <>Continue to payment</>
          )}
        </Button>
      </div>
    </div>
  );
}

/**
 * Phase 4 (Payment). Three cards:
 *   1. Your invoice: the price and the total due.
 *   2. Choose a payment option: Full / Payment plan / Offline. The plan
 *      card lists the deposit and each installment from the kernel plan
 *      rule, the same amounts the server schedules (UC-15).
 *   3. Card details — Stripe-style card / expiry / CVC inputs. Real
 *      tokenisation is a separate ticket; the inputs are presentational
 *      until the Stripe Elements integration ships.
 *
 * Footer: ← Back · Step 5 of 6 · Pay $X →
 */
function PaymentStep({
  tier,
  submitting,
  error,
  onPay,
  onPayOffline,
  loadWallet,
  onBack
}: {
  tier: PricingTier | null;
  submitting: boolean;
  error: string | null;
  onPay: (paymentOption: "full" | "plan", useWallet: boolean) => void;
  onPayOffline: () => void;
  loadWallet?: () => Promise<{ balanceCents: number; currency: string; frozen: boolean }>;
  onBack: () => void;
}) {
  // Full payment is selected first; a plan is the player's choice.
  const [option, setOption] = useState<"full" | "plan" | "offline">("full");
  // Wallet credit in this league (FR-3.6.2): offered only when there is some.
  const [walletCents, setWalletCents] = useState(0);
  const [useWallet, setUseWallet] = useState(false);
  useEffect(() => {
    let live = true;
    loadWallet?.()
      .then((w) => {
        if (live && w.balanceCents > 0 && w.currency === (tier?.currency ?? "USD")) {
          setWalletCents(w.balanceCents);
          setUseWallet(true);
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const free = !tier || tier.isFree || tier.fullPriceCents === 0;
  const currency = tier?.currency ?? "USD";
  const fullPriceCents = tier?.fullPriceCents ?? 0;
  const totalCents = fullPriceCents;
  const intervalDays = tier?.installmentIntervalDays ?? 30;
  const plan =
    tier && tierOffersPlan(tier)
      ? planInstallments(totalCents, tier.depositCents, tier.installmentCount, intervalDays)
      : null;
  const depositCents = plan?.[0]?.amountCents ?? 0;
  const installments = plan?.slice(1) ?? [];

  const fmt = (cents: number) => formatMoney(cents, currency);

  // What actually fires on the primary CTA — pick handler by option.
  function handlePay() {
    if (option === "offline") onPayOffline();
    else onPay(option === "plan" && plan ? "plan" : "full", useWallet && walletCents > 0);
  }

  const dueToday = option === "plan" && plan ? depositCents : totalCents;
  const creditUsed = option !== "offline" && useWallet ? Math.min(walletCents, dueToday) : 0;
  const ctaAmount = dueToday - creditUsed;

  return (
    <div className="space-y-5">
      {/* Card 1 — Invoice */}
      <section className="rounded-xl border border-border bg-surface-1 p-5">
        <p className="text-[14px] font-semibold tracking-tight text-fg">
          Your invoice
        </p>
        <table className="mt-4 w-full">
          <tbody className="divide-y divide-border">
            <tr>
              <td className="py-2 pr-3 text-[13px] text-fg">
                {tier?.name ?? "Registration fee"}
              </td>
              <td className="py-2 text-right font-mono text-[13px] tabular-nums text-fg">
                {fmt(fullPriceCents)}
              </td>
            </tr>
            <tr className="border-t-2 border-border">
              <td className="py-2 pr-3 text-[13px] font-medium text-fg">
                Total due
              </td>
              <td className="py-2 text-right font-mono text-[14px] font-semibold tabular-nums text-fg">
                {free ? "Free" : fmt(totalCents)}
              </td>
            </tr>
          </tbody>
        </table>

      </section>

      {/* Card 2 — Payment options */}
      <section className="rounded-xl border border-border bg-surface-1 p-5">
        <p className="text-[14px] font-semibold tracking-tight text-fg">
          Choose a payment option
        </p>
        <ul className="mt-4 space-y-3">
          <PaymentOption
            active={option === "full"}
            onSelect={() => setOption("full")}
            title={`Full payment — ${fmt(totalCents)} today`}
            body="Single charge. No further payments."
          />
          {plan ? (
            <PaymentOption
              active={option === "plan"}
              onSelect={() => setOption("plan")}
              title={`Payment plan — ${fmt(depositCents)} deposit today`}
              body={`then ${installments.length} installment${installments.length === 1 ? "" : "s"}, one every ${intervalDays} days`}
              extra={
                <ul className="mt-3 space-y-1.5 text-[12px]">
                  <li className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="text-fg-muted">
                      Today (deposit) — {fmt(depositCents)}
                    </span>
                  </li>
                  {installments.map((p) => (
                    <li key={p.installmentNumber} className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-blue-500" />
                      <span className="text-fg-muted">
                        Installment {p.installmentNumber} — {fmt(p.amountCents)}, in {p.dueInDays} days
                      </span>
                    </li>
                  ))}
                  <li className="flex items-center justify-between border-t border-border pt-2 mt-2">
                    <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                      Total collected
                    </span>
                    <span className="font-mono text-[12px] tabular-nums text-fg">
                      {fmt(totalCents)}
                    </span>
                  </li>
                </ul>
              }
            />
          ) : null}
          <PaymentOption
            active={option === "offline"}
            onSelect={() => setOption("offline")}
            title="Offline / manual payment"
            body="Cash, cheque, or e-transfer. Admin marks you as paid when received."
          />
        </ul>
      </section>

      {walletCents > 0 && option !== "offline" && !free ? (
        <section className="rounded-xl border border-border bg-surface-1 p-5">
          <label className="flex items-start gap-3 text-[13px] text-fg">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={useWallet}
              onChange={(e) => setUseWallet(e.target.checked)}
            />
            <span>
              Use my credit: {fmt(walletCents)} available
              {useWallet ? (
                <span className="block text-[12px] text-fg-muted">
                  {fmt(creditUsed)} from your credit
                  {ctaAmount > 0 ? `, ${fmt(ctaAmount)} by card` : ". Nothing to pay by card."}
                </span>
              ) : null}
            </span>
          </label>
        </section>
      ) : null}

      {/* Card 3 — Card details (visual; Stripe Elements lands later) */}
      {option !== "offline" && ctaAmount > 0 ? (
        <section className="rounded-xl border border-border bg-surface-1 p-5">
          <p className="text-[14px] font-semibold tracking-tight text-fg">
            Card details
          </p>
          <div className="mt-4 grid gap-4">
            <Field label="Card number">
              <Input placeholder="1234 5678 9012 3456" autoComplete="cc-number" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Expiry">
                <Input placeholder="MM / YY" autoComplete="cc-exp" />
              </Field>
              <Field label="CVC">
                <Input placeholder="123" autoComplete="cc-csc" />
              </Field>
            </div>
          </div>
          <p className="mt-3 text-[11px] text-fg-muted">
            Test mode: no card is charged and card details are not stored.
            Payments are simulated so the whole registration can be tried.
          </p>
        </section>
      ) : null}

      {error ? (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-[12px] text-rose-700 dark:text-rose-300">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          disabled={submitting}
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <div className="flex items-center gap-2">
          <Button onClick={handlePay} disabled={submitting}>
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                {option === "offline"
                  ? "Submit for offline payment"
                  : ctaAmount > 0
                    ? `Pay ${fmt(ctaAmount)}`
                    : creditUsed > 0
                      ? `Pay ${fmt(creditUsed)} with credit`
                      : "Start payment plan"}
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function PaymentOption({
  active,
  onSelect,
  title,
  body,
  extra
}: {
  active: boolean;
  onSelect: () => void;
  title: string;
  body: string;
  extra?: React.ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={
          active
            ? "block w-full rounded-lg border border-blue-500 bg-blue-500/5 p-4 text-left ring-2 ring-blue-500/30"
            : "block w-full rounded-lg border border-border bg-bg-subtle p-4 text-left transition-colors hover:border-fg-muted"
        }
      >
        <p className="text-[13px] font-semibold text-fg">{title}</p>
        <p className="mt-0.5 text-[12px] text-fg-muted">{body}</p>
        {active && extra ? extra : null}
      </button>
    </li>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <dt className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        {label}
      </dt>
      <dd className="text-right text-[13px] text-fg">{children}</dd>
    </div>
  );
}

function DoneStep({
  email,
  submissionId,
  resumed,
  status,
  isMinor,
  context,
  submissionType,
  api
}: {
  email: string;
  submissionId: string;
  resumed: boolean;
  status: string | null;
  isMinor: boolean;
  context: PublicSeasonContext;
  submissionType: SubmissionType | null;
  api: PublicRegistrationApi;
}) {
  const guidance = guidanceFor(status, isMinor);
  // Build a humane reference number — e.g. "PPHL-2025-NH-08841" from
  // the season's initials + year + a slice of the submission id.
  const seasonAbbrev = context.season.name
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase())
    .filter(Boolean)
    .join("")
    .slice(0, 4);
  const yearPart = (context.season.startDate ?? "").slice(0, 4);
  const refNumber = `${seasonAbbrev || "REG"}-${yearPart}-${submissionId.slice(0, 8).toUpperCase()}`;

  // Real team_id (stamped by the approve handler) for the split-pay
  // share link. Fetch via getSubmission — the registration row may
  // already have it if the captain has been re-routed here post-approval.
  const [teamId, setTeamId] = useState<string | null>(null);
  useEffect(() => {
    if (submissionType !== "team") return;
    let cancelled = false;
    api
      .getSubmission(submissionId, email)
      .then((s) => {
        if (!cancelled) setTeamId(s.teamId);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [submissionType, submissionId, email, api]);

  // Split-pay link only renders when admin has approved AND a real
  // team exists. Previously the funnel built a URL from
  // `submissionId.slice(0, 8)` as a fake team id and pointed at an
  // invalid `/registration/.../player` path (BUG-J). The proper share
  // link uses the canonical `/register/<seasonId>?team=<teamId>` slot
  // so it can be used by the player funnel.
  const splitPayLink =
    submissionType === "team" && teamId
      ? `${typeof window !== "undefined" ? window.location.origin : ""}/register/${context.season.id}?team=${teamId}`
      : null;
  const splitPayPending = submissionType === "team" && !teamId;

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-border bg-surface-1 p-6">
        <div className="flex flex-col items-center gap-3 border-b border-border pb-5 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Check className="h-7 w-7" strokeWidth={2.25} />
          </div>
          <p className="text-[18px] font-semibold tracking-tight text-fg">
            {guidance.headline(resumed)}
          </p>
          <p className="font-mono text-[11px] uppercase tracking-widest text-fg-muted">
            {guidance.body}
          </p>
          <div className="rounded-md border border-border bg-bg-subtle px-4 py-2">
            <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
              Reference number
            </p>
            <p className="font-mono text-[14px] tabular-nums text-fg">
              {refNumber}
            </p>
          </div>
        </div>

        <p className="mt-4 text-[12px] text-fg-muted">
          A confirmation email has been sent to <span className="text-fg">{email}</span>{" "}
          with your receipt and next steps.
        </p>

        <dl className="mt-4 space-y-2">
          <DetailRow label="Season" value={context.season.name} />
          {submissionType ? (
            <DetailRow label="Path" value={labelForPath(submissionType)} />
          ) : null}
          {status ? (
            <DetailRow label="Status" value={status.replace(/_/g, " ")} />
          ) : null}
        </dl>
      </section>

      {splitPayLink ? (
        <section className="rounded-xl border border-border bg-surface-1 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[14px] font-semibold tracking-tight text-fg">
              Share player invite link
            </p>
            <span className="rounded-full bg-[var(--tint-emerald-bg)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-[var(--tint-emerald-fg)]">
              Split pay enabled
            </span>
          </div>
          <p className="mt-1 text-[12px] text-fg-muted">
            Send this link to your players. Each player completes their own
            payment share independently.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="flex-1 truncate rounded-md border border-border bg-bg-subtle px-3 py-2 font-mono text-[11px] text-[var(--tint-blue-fg)]">
              {splitPayLink}
            </code>
            <button
              type="button"
              onClick={() => {
                if (typeof navigator !== "undefined" && navigator.clipboard) {
                  navigator.clipboard.writeText(splitPayLink).catch(() => undefined);
                }
              }}
              className="inline-flex h-9 items-center rounded-md border border-border bg-bg-subtle px-3 font-mono text-[10px] uppercase tracking-widest text-fg hover:border-fg-muted"
            >
              Copy
            </button>
          </div>
        </section>
      ) : splitPayPending ? (
        <section className="rounded-xl border border-dashed border-border bg-surface-1 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[14px] font-semibold tracking-tight text-fg">
              Player invite link
            </p>
            <span className="rounded-full bg-[var(--tint-amber-bg)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-[var(--tint-amber-fg)]">
              Pending approval
            </span>
          </div>
          <p className="mt-1 text-[12px] text-fg-muted">
            Once admin approves your team registration we'll generate a
            shareable invite link for your roster. Check the My
            registrations tab in your player dashboard, or watch your
            email — the link will land there too.
          </p>
        </section>
      ) : null}

      <section className="rounded-xl border border-border bg-surface-1 p-5">
        <p className="text-[14px] font-semibold tracking-tight text-fg">
          What happens next?
        </p>
        <ol className="mt-3 space-y-2.5">
          <NextStep
            n={1}
            title="Admin eligibility review"
            body="League admin reviews your documents. You will be notified within 2 business days."
          />
          <NextStep
            n={2}
            title="Approval confirmation"
            body={
              submissionType === "free_agent"
                ? "Once approved, you'll appear in your division's free-agent pool. Captains can then claim you onto their roster."
                : submissionType === "team"
                  ? "Once approved, your team will appear in the division and you can start inviting players."
                  : "Once approved, you'll appear on the team roster and schedule."
            }
          />
          <NextStep
            n={3}
            title={`Season begins ${fmtDate(context.season.startDate)}`}
            body="Your schedule and game notifications will be active."
          />
        </ol>
      </section>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <dt className="text-[12px] text-fg-muted">{label}</dt>
      <dd className="font-mono text-[12px] tabular-nums text-fg">{value}</dd>
    </div>
  );
}

function NextStep({
  n,
  title,
  body
}: {
  n: number;
  title: string;
  body: string;
}) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bg-subtle font-mono text-[11px] tabular-nums text-fg-muted">
        {n}
      </span>
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-fg">{title}</p>
        <p className="mt-0.5 text-[12px] text-fg-muted">{body}</p>
      </div>
    </li>
  );
}

function guidanceFor(
  status: string | null,
  isMinor: boolean
): { headline: (resumed: boolean) => string; body: string } {
  switch (status) {
    case "pending_consent":
      return {
        headline: (r) => (r ? "Welcome back" : "Almost there"),
        body: isMinor
          ? "We've flagged you as under 18. Next step: parental consent — we'll send a link to your parent / guardian. (Email delivery wires up next pass; for now look for the in-app prompt.)"
          : "We need parental consent before payment can proceed."
      };
    case "pending_payment":
      return {
        headline: (r) => (r ? "Welcome back" : "Account created"),
        body: "Next: pay the registration fee. Payment opens in the next slice (mock Stripe)."
      };
    case "pending_review":
      return {
        headline: () => "Payment received",
        body: "Your submission is now in admin review. You'll hear back via email."
      };
    case "approved":
      return {
        headline: () => "You're on the roster!",
        body: "Welcome aboard. Your team / free-agent placement is live."
      };
    case "rejected":
      return {
        headline: () => "Submission not approved",
        body: "Admin couldn't approve this submission. A refund is in flight per league policy."
      };
    case "cancelled":
      return {
        headline: () => "Cancelled",
        body: "This submission was cancelled. You can start fresh any time."
      };
    default:
      return {
        headline: (r) => (r ? "Welcome back" : "You're in"),
        body: "We've started a draft registration against this season."
      };
  }
}

function labelForPath(t: SubmissionType): string {
  return PATHS.find((p) => p.value === t)?.title ?? t;
}

/**
 * Per-step header (mockup's two-line block under the stepper).
 * The subtitle is null when the funnel should fall back to the
 * default "<season> · Registration closes <date>" line.
 */
function phaseHeadingFor(step: Step): {
  title: string;
  subtitle: string | null;
} {
  // Inner subtitle numbering MUST match the outer PhaseStepper:
  // 1 Path · 2 Account · 3 Details · 4 Compliance · 5 Payment · 6 Confirmation.
  // The previous offset-by-one numbering (Account = "Phase 1", etc.)
  // is the same class of bug as the misordered stepOrder fix in this
  // file — the inner UI must agree with the outer stepper.
  switch (step) {
    case "path":
      return { title: "Player registration", subtitle: null };
    case "division":
      return {
        title: "Pick a division",
        subtitle: "Step 1b — Which division you're registering for"
      };
    case "account":
      return {
        title: "Create your account",
        subtitle: "Step 2 — Account creation & authentication"
      };
    case "questions":
      return {
        title: "Your details",
        subtitle: "Step 3 — Player & team information"
      };
    case "consent":
    case "waivers":
      return {
        title: "Compliance & waivers",
        subtitle:
          "Step 4 — Documents, eligibility checks, and digital signatures"
      };
    case "tier":
    case "review":
    case "payment":
      return {
        title: "Payment",
        subtitle: "Step 5 — Invoice & payment selection"
      };
    case "done":
      return {
        title: "Registration submitted",
        subtitle: "Step 6 — Confirmation & activation"
      };
  }
}
