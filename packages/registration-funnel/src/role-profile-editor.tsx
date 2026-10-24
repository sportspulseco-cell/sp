"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Save } from "lucide-react";
import {
  ROLE_PROFILE_SCHEMAS,
  SYSTEM_ROLE_BY_CODE,
  validateRoleProfileAnswers,
  type AnswerMap,
  type FormDefinition
} from "@sportspulse/kernel";
import { Alert, Button } from "@sportspulse/ui";
import { FormRenderer } from "./form-renderer";

/**
 * Role-profile editing shared by every screen that edits the fields an
 * admin fills in Invite user → "Set up profile": the admin's Edit user
 * profile dialog, the player app's Profile page, and onboarding. One
 * loader (admin-configured role_profile form first, kernel
 * ROLE_PROFILE_SCHEMAS as fallback), one validator, one renderer, so
 * the field list, labels and rules never drift between apps.
 *
 * Stored at profiles.metadata.roleProfile.<roleCode>; transport is
 * injected so each app binds its own SDK.
 */

export interface RoleProfileTransport {
  getRoleProfile: (userId: string, roleCode: string) => Promise<{ data: AnswerMap }>;
  getRoleProfileForm: (roleCode: string) => Promise<{
    source: "admin" | "kernel-default";
    schema: Record<string, unknown> | null;
  }>;
  setRoleProfile: (userId: string, body: { roleCode: string; data: AnswerMap }) => Promise<unknown>;
}

export interface LoadedRoleProfile {
  answers: AnswerMap;
  definition: FormDefinition;
  source: "admin" | "kernel-default";
}

const EMPTY: FormDefinition = { schemaVersion: 1, questions: [] };

/** Saved answers + the form to render them with. */
export async function loadRoleProfile(
  api: RoleProfileTransport,
  userId: string,
  roleCode: string
): Promise<LoadedRoleProfile> {
  const [profile, form] = await Promise.all([
    api.getRoleProfile(userId, roleCode),
    api.getRoleProfileForm(roleCode).catch(() => ({ source: "kernel-default" as const, schema: null }))
  ]);
  const admin =
    form.source === "admin" && form.schema ? (form.schema as unknown as FormDefinition) : null;
  return {
    answers: profile.data ?? {},
    definition: admin ?? ROLE_PROFILE_SCHEMAS[roleCode] ?? EMPTY,
    source: admin ? "admin" : "kernel-default"
  };
}

export interface RoleProfileState {
  loading: boolean;
  loadError: string | null;
  definition: FormDefinition;
  source: "admin" | "kernel-default";
  answers: AnswerMap;
  setAnswers: (a: AnswerMap) => void;
  /** Field errors for the current answers (required + formats). */
  errors: Record<string, string>;
  hasFields: boolean;
  /** Validates, then saves; throws with the first problem if invalid. */
  save: () => Promise<void>;
}

/** Load / edit / validate / save one user's profile for one role. */
export function useRoleProfile(
  api: RoleProfileTransport,
  userId: string,
  roleCode: string | null,
  enabled = true
): RoleProfileState {
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [definition, setDefinition] = useState<FormDefinition>(EMPTY);
  const [source, setSource] = useState<"admin" | "kernel-default">("kernel-default");
  const [answers, setAnswers] = useState<AnswerMap>({});

  useEffect(() => {
    if (!enabled || !roleCode) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    loadRoleProfile(api, userId, roleCode)
      .then((r) => {
        if (cancelled) return;
        setAnswers(r.answers);
        setDefinition(r.definition);
        setSource(r.source);
      })
      .catch((e) => {
        if (!cancelled) setLoadError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // api is a fresh object per render in callers; key on identity of the target.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, userId, roleCode]);

  const errors = useMemo(() => validateRoleProfileAnswers(definition, answers), [definition, answers]);

  const save = useCallback(async () => {
    if (!roleCode) return;
    const first = Object.values(errors)[0];
    if (first) throw new Error(first);
    await api.setRoleProfile(userId, { roleCode, data: answers });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleCode, userId, answers, errors]);

  return {
    loading,
    loadError,
    definition,
    source,
    answers,
    setAnswers,
    errors,
    hasFields: definition.questions.length > 0,
    save
  };
}

/** The fields of a loaded profile, with its problems listed under them. */
export function RoleProfileFields({
  state,
  roleCode,
  showErrors
}: {
  state: RoleProfileState;
  roleCode: string;
  /** Show field problems (after a save attempt, so a fresh form isn't all red). */
  showErrors: boolean;
}) {
  if (state.loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-[13px] text-fg-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading saved values…
      </div>
    );
  }
  if (state.loadError) return <Alert tone="error">Could not load the profile: {state.loadError}</Alert>;
  if (!state.hasFields) {
    const name = SYSTEM_ROLE_BY_CODE[roleCode]?.name ?? roleCode;
    return (
      <p className="rounded-md border border-dashed border-border bg-bg-subtle px-3 py-6 text-center text-[13px] text-fg-muted">
        No profile fields are defined for the {name} role.
      </p>
    );
  }
  const problems = Object.values(state.errors);
  return (
    <div className="space-y-4">
      <FormRenderer
        key={roleCode}
        definition={state.definition}
        initialAnswers={state.answers}
        onChange={state.setAnswers}
      />
      {showErrors && problems.length > 0 ? (
        <Alert tone="error">
          <ul className="list-disc pl-4">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Alert>
      ) : null}
    </div>
  );
}

/** Standalone editor with its own Save button (player Profile page). */
export function RoleProfileEditor({
  api,
  userId,
  roleCode
}: {
  api: RoleProfileTransport;
  userId: string;
  roleCode: string;
}) {
  const state = useRoleProfile(api, userId, roleCode);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSave() {
    setTried(true);
    setFlash(null);
    setError(null);
    if (Object.keys(state.errors).length > 0) return;
    setSaving(true);
    try {
      await state.save();
      setFlash("Profile saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <RoleProfileFields state={state} roleCode={roleCode} showErrors={tried} />
      {error ? <Alert tone="error">{error}</Alert> : null}
      {flash ? <Alert tone="success">{flash}</Alert> : null}
      {state.hasFields && !state.loading && !state.loadError ? (
        <div className="flex justify-end">
          <Button type="button" onClick={onSave} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-3.5 w-3.5" />
            )}
            Save profile
          </Button>
        </div>
      ) : null}
    </div>
  );
}
