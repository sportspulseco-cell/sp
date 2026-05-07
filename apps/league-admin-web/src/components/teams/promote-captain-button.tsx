"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Star } from "lucide-react";
import { Button, Dialog, DialogActions, Field, Select } from "@sportspulse/ui";
import { iam, roster } from "@/lib/api/browser-api";

/**
 * League-admin → "Promote captain" action on a team row. Opens a
 * dialog listing the team's active memberships (potential captains),
 * lets the admin pick one + post a role-assignment with role=captain
 * scoped to that team. The player keeps their player role; captain
 * is a *dual* role assignment, not a replacement.
 */
export function PromoteCaptainButton({ teamId }: { teamId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        title="Promote a rostered player to captain of this team"
      >
        <Star className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.75} />
        <span className="font-mono text-[10px] uppercase tracking-widest">
          Promote captain
        </span>
      </Button>
      {open ? (
        <PromoteDialog teamId={teamId} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

function PromoteDialog({
  teamId,
  onClose
}: {
  teamId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [memberships, setMemberships] = useState<
    Array<{ personId: string; userId: string | null; label: string }>
  >([]);
  const [captainRoleId, setCaptainRoleId] = useState<string | null>(null);
  const [pickedUserId, setPickedUserId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // 1) resolve the captain role id (canonical, by code)
        const rolesPage = await iam.listRoles({ search: "captain" });
        const captainRole = rolesPage.items.find((r) => r.code === "captain");
        if (!captainRole) {
          throw new Error("Captain role not found in this database");
        }
        if (cancelled) return;
        setCaptainRoleId(captainRole.id);

        // 2) load the team's active memberships, then enrich w/ user_id
        // via the persons SDK so we can post a role-assignment (which
        // wants user_id, not person_id).
        const ms = await roster.listMemberships({ teamId, activeOnly: true });
        if (cancelled) return;
        const persons = await Promise.all(
          ms.items.map((m) =>
            iam.getPerson(m.personId).catch(() => null)
          )
        );
        const list = ms.items.map((m, i) => {
          const p = persons[i];
          const fullName = p
            ? [p.legalFirstName, p.legalLastName].filter(Boolean).join(" ")
            : "";
          return {
            personId: m.personId,
            userId: p?.userId ?? null,
            label: fullName
              ? `${fullName} (#${m.jerseyNumber ?? "?"})`
              : `Person ${m.personId.slice(0, 8)} (#${m.jerseyNumber ?? "?"})`
          };
        });
        if (cancelled) return;
        setMemberships(list.filter((m) => m.userId));
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  async function onSubmit() {
    if (!captainRoleId) return;
    if (!pickedUserId) {
      setError("Pick a player to promote");
      return;
    }
    setSubmitting(true);
    setError(null);
    setOkMsg(null);
    try {
      await iam.assignRole({
        userId: pickedUserId,
        roleId: captainRoleId,
        scopeType: "team",
        scopeId: teamId
      });
      setOkMsg("Captain role assigned. They'll see the captain console next sign-in.");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Promote a player to captain"
      description="Captain is a dual role — the player keeps their player assignment AND gains roster + invite + free-agent powers for this team."
    >
      <div className="space-y-4">
        <Field label="Player to promote" htmlFor="player">
          <Select
            id="player"
            value={pickedUserId}
            onChange={(e) => setPickedUserId(e.target.value)}
          >
            <option value="">Select a rostered player…</option>
            {memberships.map((m) => (
              <option key={m.personId} value={m.userId ?? ""}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
        {memberships.length === 0 ? (
          <p className="text-[12px] text-fg-muted">
            No rostered players have linked user accounts on this team yet —
            captains need to be auth users so the role assignment has a
            target. Add players via roster moves first.
          </p>
        ) : null}

        {error ? (
          <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
            {error}
          </p>
        ) : null}
        {okMsg ? (
          <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
            {okMsg}
          </p>
        ) : null}

        <DialogActions>
          <Button type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button
            type="button"
            onClick={onSubmit}
            disabled={submitting || !pickedUserId}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                Promoting…
              </>
            ) : (
              <>
                <Star className="mr-1.5 h-4 w-4" strokeWidth={1.75} />
                Promote to captain
              </>
            )}
          </Button>
        </DialogActions>
      </div>
    </Dialog>
  );
}
