"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import {
  FORM_PURPOSES,
  FORM_PURPOSE_LABELS,
  SYSTEM_ROLES,
  type FormPurpose
} from "@sportspulse/kernel";
import { leagueMgmt, registration } from "@/lib/api/browser-api";
import type { Division, League, Org, Season } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export function CreateFormButton({ orgs }: { orgs: Org[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={orgs.length === 0}>
        <Plus className="mr-2 h-4 w-4" />
        New form
      </Button>
      <CreateFormDialog
        open={open}
        onClose={() => setOpen(false)}
        orgs={orgs}
      />
    </>
  );
}

function CreateFormDialog({
  open,
  onClose,
  orgs
}: {
  open: boolean;
  onClose: () => void;
  orgs: Org[];
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    orgId: orgs[0]?.id ?? "",
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

  // Cascading scopes — leagues come from the picked org, seasons from
  // the picked league, divisions from the picked season. Each dropdown
  // refetches as the parent changes, so the UI never offers a child
  // value that doesn't actually belong to the parent.
  const [leagues, setLeagues] = useState<League[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);

  useEffect(() => {
    if (!form.orgId || form.scope === "org") return;
    let cancelled = false;
    leagueMgmt
      .listLeagues({ orgId: form.orgId })
      .then((page) => {
        if (cancelled) return;
        setLeagues(page.items);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [form.orgId, form.scope]);

  useEffect(() => {
    if (!form.leagueId || form.scope !== "division") return;
    let cancelled = false;
    leagueMgmt
      .listSeasons({ leagueId: form.leagueId })
      .then((page) => {
        if (cancelled) return;
        setSeasons(page.items);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [form.leagueId, form.scope]);

  useEffect(() => {
    if (!form.seasonId || form.scope !== "division") return;
    let cancelled = false;
    leagueMgmt
      .listDivisions({ seasonId: form.seasonId })
      .then((page) => {
        if (cancelled) return;
        setDivisions(page.items);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [form.seasonId, form.scope]);

  // Order role codes by their canonical rank — same ordering admins
  // see in the role picker, so the multi-select feels familiar.
  const roleOptions = useMemo(
    () =>
      [...SYSTEM_ROLES]
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
      // Resolve scopeId from the cascading pickers. The API rejects
      // create when scope != org without one — that's the bug we're
      // fixing here.
      let scopeId: string | undefined;
      if (form.scope === "league") scopeId = form.leagueId || undefined;
      if (form.scope === "division") scopeId = form.divisionId || undefined;
      if (form.scope !== "org" && !scopeId) {
        const what = form.scope === "league" ? "league" : "division";
        throw new Error(`Pick a ${what} for the form's scope before saving.`);
      }
      await registration.createForm({
        orgId: form.orgId,
        scope: form.scope,
        scopeId: scopeId ?? null,
        name: form.name,
        description: form.description || null,
        purpose: form.purpose,
        appliesToRoles: form.appliesToRoles
      });
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
      title="New registration form"
      description="Create a form shell. Add a schema version next, then publish to make it active."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Organization" htmlFor="orgId">
          <Select
            id="orgId"
            required
            value={form.orgId}
            onChange={(e) => setForm({ ...form, orgId: e.target.value })}
          >
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.displayName}
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
                // Reset child selections when scope changes — they're
                // only valid relative to the scope they were picked under.
                leagueId: "",
                seasonId: "",
                divisionId: ""
              })
            }
          >
            <option value="org">Org-wide</option>
            <option value="league">League-specific</option>
            <option value="division">Division-specific</option>
          </Select>
        </Field>

        {(form.scope === "league" || form.scope === "division") && (
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

        {form.scope === "division" && form.leagueId && (
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
            {FORM_PURPOSES.map((p) => (
              <option key={p} value={p}>
                {FORM_PURPOSE_LABELS[p]}
              </option>
            ))}
          </Select>
        </Field>
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

        {error ? (
          <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
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
              "Create form"
            )}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
