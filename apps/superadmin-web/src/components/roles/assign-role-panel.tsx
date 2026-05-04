"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";
import {
  gameOps,
  iam,
  leagueMgmt,
  orgs as orgsApi
} from "@/lib/api/browser-api";
import type { Role, RoleScopeType } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

const SCOPE_TYPES: RoleScopeType[] = [
  "platform",
  "org",
  "league",
  "season",
  "division",
  "team",
  "game"
];

const ROLE_DEFAULT_SCOPE: Record<string, RoleScopeType> = {
  super_admin: "platform",
  org_admin: "org",
  league_admin: "league",
  season_admin: "season",
  division_admin: "division",
  team_admin: "team",
  coach: "team",
  registrar: "org",
  referee: "league",
  scorekeeper: "league",
  player: "team",
  parent: "org",
  spectator: "platform"
};

interface ScopeOption {
  id: string;
  label: string;
}

export function AssignRolePanel({
  userId,
  roles
}: {
  userId: string;
  roles: Role[];
}) {
  const router = useRouter();
  const sortedRoles = useMemo(
    () =>
      [...roles].sort((a, b) => {
        if (a.isSystem && !b.isSystem) return -1;
        if (!a.isSystem && b.isSystem) return 1;
        return a.code.localeCompare(b.code);
      }),
    [roles]
  );

  const [roleId, setRoleId] = useState(sortedRoles[0]?.id ?? "");
  const [scopeType, setScopeType] = useState<RoleScopeType>(
    sortedRoles[0] ? (ROLE_DEFAULT_SCOPE[sortedRoles[0].code] ?? "platform") : "platform"
  );
  const [scopeId, setScopeId] = useState("");
  const [scopeOptions, setScopeOptions] = useState<ScopeOption[]>([]);
  const [scopeLoading, setScopeLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const selectedRole = sortedRoles.find((r) => r.id === roleId);

  // Fetch scope candidates whenever the scope type changes.
  useEffect(() => {
    let cancelled = false;
    if (scopeType === "platform") {
      setScopeOptions([]);
      setScopeId("");
      return;
    }
    setScopeLoading(true);
    setScopeOptions([]);
    setScopeId("");

    const fetcher = async (): Promise<ScopeOption[]> => {
      switch (scopeType) {
        case "org": {
          const p = await orgsApi.list({ limit: 200 });
          return p.items.map((o) => ({ id: o.id, label: o.displayName }));
        }
        case "league": {
          const p = await leagueMgmt.listLeagues({});
          return p.items.map((l) => ({
            id: l.id,
            label: `${l.name} · ${l.sportCode}`
          }));
        }
        case "season": {
          const p = await leagueMgmt.listSeasons({});
          return p.items.map((s) => ({
            id: s.id,
            label: `${s.name} · ${s.sportCode}`
          }));
        }
        case "division": {
          const p = await leagueMgmt.listDivisions({});
          return p.items.map((d) => ({ id: d.id, label: d.name }));
        }
        case "team": {
          const p = await leagueMgmt.listTeams({});
          return p.items.map((t) => ({
            id: t.id,
            label: t.shortName ? `${t.name} (${t.shortName})` : t.name
          }));
        }
        case "game": {
          const p = await gameOps.listGames({ limit: 100 });
          return p.items.map((g) => {
            const d = new Date(g.scheduledStartTsUtc).toLocaleDateString(
              undefined,
              { month: "short", day: "numeric" }
            );
            return {
              id: g.id,
              label: `${d} · ${g.awayTeamId.slice(0, 6)} @ ${g.homeTeamId.slice(0, 6)}`
            };
          });
        }
        default:
          return [];
      }
    };

    fetcher()
      .then((opts) => {
        if (cancelled) return;
        setScopeOptions(opts);
        if (opts[0]) setScopeId(opts[0].id);
      })
      .catch(() => {
        if (cancelled) return;
        setScopeOptions([]);
      })
      .finally(() => {
        if (!cancelled) setScopeLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [scopeType]);

  function onRoleChange(id: string) {
    setRoleId(id);
    const role = sortedRoles.find((r) => r.id === id);
    if (role) {
      const def = ROLE_DEFAULT_SCOPE[role.code];
      if (def) setScopeType(def);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await iam.assignRole({
        userId,
        roleId,
        scopeType,
        scopeId: scopeType === "platform" ? null : scopeId || null
      });
      setSuccess(`Assigned ${selectedRole?.code ?? "role"} at ${scopeType}.`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const submitDisabled =
    loading ||
    !roleId ||
    (scopeType !== "platform" && (!scopeId || scopeOptions.length === 0));

  return (
    <form
      onSubmit={onSubmit}
      className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr_auto]"
    >
      <Field label="Role" htmlFor="ar-role">
        <Select
          id="ar-role"
          required
          value={roleId}
          onChange={(e) => onRoleChange(e.target.value)}
        >
          <optgroup label="System">
            {sortedRoles
              .filter((r) => r.isSystem)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code} — {r.name}
                </option>
              ))}
          </optgroup>
          {sortedRoles.some((r) => !r.isSystem) ? (
            <optgroup label="Custom">
              {sortedRoles
                .filter((r) => !r.isSystem)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.code} — {r.name}
                  </option>
                ))}
            </optgroup>
          ) : null}
        </Select>
      </Field>
      <Field label="Scope type" htmlFor="ar-scope-type">
        <Select
          id="ar-scope-type"
          value={scopeType}
          onChange={(e) => setScopeType(e.target.value as RoleScopeType)}
        >
          {SCOPE_TYPES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label={scopeType === "platform" ? "Scope" : `Pick ${scopeType}`}
        htmlFor="ar-scope-id"
        hint={
          scopeType === "platform"
            ? "Platform scope has no ID."
            : scopeLoading
              ? "Loading…"
              : scopeOptions.length === 0
                ? `No ${scopeType}s available — create one first.`
                : `${scopeOptions.length} available`
        }
      >
        <Select
          id="ar-scope-id"
          required={scopeType !== "platform"}
          disabled={scopeType === "platform" || scopeLoading}
          value={scopeId}
          onChange={(e) => setScopeId(e.target.value)}
        >
          {scopeType === "platform" ? (
            <option value="">—</option>
          ) : scopeLoading ? (
            <option value="">Loading…</option>
          ) : scopeOptions.length === 0 ? (
            <option value="">No {scopeType}s found</option>
          ) : (
            scopeOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))
          )}
        </Select>
      </Field>
      <div className="flex items-end gap-2">
        <Button type="submit" disabled={submitDisabled}>
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Assigning…
            </>
          ) : (
            <>
              <ShieldCheck className="mr-2 h-4 w-4" /> Assign
            </>
          )}
        </Button>
      </div>

      {error ? (
        <p className="lg:col-span-4 rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="lg:col-span-4 rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
          {success}
        </p>
      ) : null}
    </form>
  );
}
