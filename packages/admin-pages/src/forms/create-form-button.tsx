"use client";

/**
 * Shared "New form" button + dialog used by both sa-web and org-admin-web.
 *
 * Transport-agnostic: the consuming app injects `listLeagues`,
 * `listSeasons`, `listDivisions`, and `createForm` callbacks (their
 * browser-api SDK). On success the dialog calls `onCreated(formId)` —
 * each app routes to its own `/forms/[id]`, so the sa-web URL never
 * leaks into org-admin.
 *
 * Pattern mirrors OrgSetupWizard (commit b99de22).
 */

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Loader2, Plus } from "lucide-react";
import {
  FORM_PURPOSES,
  FORM_PURPOSE_LABELS,
  SYSTEM_ROLES,
  type FormPurpose
} from "@sportspulse/kernel";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  Field,
  Input,
  Select
} from "@sportspulse/ui";

export interface CreateFormOrg {
  id: string;
  displayName: string;
}
export interface CreateFormLeague {
  id: string;
  name: string;
}
export interface CreateFormSeason {
  id: string;
  name: string;
}
export interface CreateFormDivision {
  id: string;
  name: string;
}

export interface CreateFormInput {
  orgId: string;
  scope: "org" | "league" | "division";
  scopeId: string | null;
  name: string;
  description: string | null;
  purpose: FormPurpose;
  appliesToRoles: string[];
  /** Season this registration form is for (season_registration forms). */
  seasonId?: string | null;
}

export interface CreateFormButtonProps {
  /**
   * Orgs available to the caller. Sa-web passes the full list; org-admin
   * locks to one entry (the active org). Empty array disables the button.
   */
  orgs: CreateFormOrg[];
  listLeagues: (orgId: string) => Promise<CreateFormLeague[]>;
  listSeasons: (leagueId: string) => Promise<CreateFormSeason[]>;
  listDivisions: (seasonId: string) => Promise<CreateFormDivision[]>;
  createForm: (input: CreateFormInput) => Promise<{ id: string }>;
  /** Called with the new form's id after a successful create. */
  onCreated: (formId: string) => void;
  /** Hide the org picker (true when there's only one option). */
  lockOrg?: boolean;
  /**
   * The organisation in view (e.g. the page's org filter). With several
   * orgs and no default, the admin must choose (CAP-23: the dialog used
   * to preselect the alphabetically first tenant).
   */
  defaultOrgId?: string;
}

export function CreateFormButton(props: CreateFormButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        disabled={props.orgs.length === 0}
      >
        <Plus className="mr-2 h-4 w-4" />
        New form
      </Button>
      <CreateFormDialog
        {...props}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

function CreateFormDialog({
  open,
  onClose,
  orgs,
  listLeagues,
  listSeasons,
  listDivisions,
  createForm,
  onCreated,
  lockOrg,
  defaultOrgId
}: CreateFormButtonProps & {
  open: boolean;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    orgId: orgs.length === 1 ? orgs[0]!.id : defaultOrgId && orgs.some((o) => o.id === defaultOrgId) ? defaultOrgId : "",
    scope: "org" as "org" | "league" | "division",
    leagueId: "" as string,
    seasonId: "" as string,
    divisionId: "" as string,
    purpose: "season_registration" as FormPurpose,
    appliesToRoles: [] as string[],
    name: "",
    description: ""
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [leagues, setLeagues] = useState<CreateFormLeague[]>([]);
  const [seasons, setSeasons] = useState<CreateFormSeason[]>([]);
  const [divisions, setDivisions] = useState<CreateFormDivision[]>([]);

  // A season-registration form belongs to one season: ask for it here,
  // not on a later tab (REG-20).
  const needsSeason = form.purpose === "season_registration";

  useEffect(() => {
    if (!form.orgId || (form.scope === "org" && !needsSeason)) return;
    let cancelled = false;
    listLeagues(form.orgId)
      .then((items) => {
        if (!cancelled) setLeagues(items);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [form.orgId, form.scope, needsSeason, listLeagues]);

  useEffect(() => {
    if (!form.leagueId || (form.scope !== "division" && !needsSeason)) return;
    let cancelled = false;
    listSeasons(form.leagueId)
      .then((items) => {
        if (!cancelled) setSeasons(items);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [form.leagueId, form.scope, needsSeason, listSeasons]);

  useEffect(() => {
    if (!form.seasonId || form.scope !== "division") return;
    let cancelled = false;
    listDivisions(form.seasonId)
      .then((items) => {
        if (!cancelled) setDivisions(items);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [form.seasonId, form.scope, listDivisions]);

  const roleOptions = useMemo(
    () =>
      [...SYSTEM_ROLES]
        // No form targets platform super admins (REG-20).
        .filter((r) => r.code !== "super_admin")
        .sort((a, b) => a.rank - b.rank)
        .map((r) => ({ code: r.code, name: r.name })),
    []
  );

  function toggleRole(code: string) {
    setForm((f) => {
      const has = f.appliesToRoles.includes(code);
      return {
        ...f,
        appliesToRoles: has
          ? f.appliesToRoles.filter((c) => c !== code)
          : [...f.appliesToRoles, code]
      };
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      let scopeId: string | null = null;
      if (form.scope === "league") scopeId = form.leagueId || null;
      if (form.scope === "division") scopeId = form.divisionId || null;
      if (!form.orgId) throw new Error("Pick the organization this form belongs to.");
      if (form.scope !== "org" && !scopeId) {
        const what = form.scope === "league" ? "league" : "division";
        throw new Error(`Pick a ${what} for the form's scope before saving.`);
      }
      if (needsSeason && !form.seasonId) {
        throw new Error("Pick the season this registration form is for.");
      }
      const created = await createForm({
        orgId: form.orgId,
        scope: form.scope,
        scopeId,
        name: form.name,
        description: form.description || null,
        purpose: form.purpose,
        appliesToRoles: form.appliesToRoles,
        seasonId: needsSeason ? form.seasonId || null : null
      });
      onClose();
      onCreated(created.id);
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
      title="New registration form"
      description="Create a form shell. Add a schema version next, then publish to make it active."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {!lockOrg && orgs.length > 1 ? (
          <Field label="Organization" htmlFor="orgId">
            <Select
              id="orgId"
              required
              value={form.orgId}
              onChange={(e) =>
                setForm({ ...form, orgId: e.target.value, leagueId: "", seasonId: "", divisionId: "" })
              }
            >
              <option value="">Select an organization…</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.displayName}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field
          label="Purpose"
          htmlFor="purpose"
          hint="Where this form is used. Season-registration forms power the public funnel; role-profile forms back the per-role onboarding wizard; team-application is the free-agent flow."
        >
          <Select
            id="purpose"
            value={form.purpose}
            onChange={(e) =>
              setForm({ ...form, purpose: e.target.value as FormPurpose })
            }
          >
            {FORM_PURPOSES.map((p: FormPurpose) => (
              <option key={p} value={p}>
                {FORM_PURPOSE_LABELS[p]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Scope" htmlFor="scope">
          <Select
            id="scope"
            value={form.scope}
            onChange={(e) =>
              setForm({
                ...form,
                scope: e.target.value as typeof form.scope,
                // A season-registration form keeps its league and season.
                leagueId: needsSeason ? form.leagueId : "",
                seasonId: needsSeason ? form.seasonId : "",
                divisionId: ""
              })
            }
          >
            <option value="org">Org-wide</option>
            <option value="league">League-specific</option>
            <option value="division">Division-specific</option>
          </Select>
        </Field>

        {form.orgId && (form.scope === "league" || form.scope === "division" || needsSeason) && (
          <Field label="League" htmlFor="leagueId">
            <Select
              id="leagueId"
              required
              value={form.leagueId}
              onChange={(e) =>
                setForm({
                  ...form,
                  leagueId: e.target.value,
                  seasonId: "",
                  divisionId: ""
                })
              }
            >
              <option value="">Select a league…</option>
              {leagues.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {(form.scope === "division" || needsSeason) && form.leagueId && (
          <Field label="Season" htmlFor="seasonId">
            <Select
              id="seasonId"
              required
              value={form.seasonId}
              onChange={(e) =>
                setForm({
                  ...form,
                  seasonId: e.target.value,
                  divisionId: ""
                })
              }
            >
              <option value="">Select a season…</option>
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {form.scope === "division" && form.seasonId && (
          <Field label="Division" htmlFor="divisionId">
            <Select
              id="divisionId"
              required
              value={form.divisionId}
              onChange={(e) =>
                setForm({ ...form, divisionId: e.target.value })
              }
            >
              <option value="">Select a division…</option>
              {divisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field
          label="Applies to roles"
          hint="Empty = applies to every role in scope. Pick one or more codes when the form should only render for specific roles (e.g. role-profile forms targeting `coach`)."
        >
          <div className="grid grid-cols-2 gap-1.5 rounded-md border border-border bg-bg-subtle p-2 sm:grid-cols-3">
            {roleOptions.map((r) => {
              const checked = form.appliesToRoles.includes(r.code);
              return (
                <label
                  key={r.code}
                  className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[12px] text-fg hover:bg-surface-2"
                >
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-fg"
                    checked={checked}
                    onChange={() => toggleRole(r.code)}
                  />
                  <span className="truncate">{r.name}</span>
                </label>
              );
            })}
          </div>
        </Field>
        <Field label="Name" htmlFor="name">
          <Input
            id="name"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="2026 Spring Player Registration"
          />
        </Field>
        <Field label="Description" htmlFor="description">
          <Input
            id="description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Optional"
          />
        </Field>

        {error ? <Alert tone="error">{error}</Alert> : null}

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
              "Create form"
            )}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
