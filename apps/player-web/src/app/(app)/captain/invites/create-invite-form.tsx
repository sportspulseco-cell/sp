"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail, Plus } from "lucide-react";
import { Button, Field, Input, Select } from "@sportspulse/ui";
import { iam, leagueMgmt, registrationV2 } from "@/lib/api/browser-api";
import type { Season } from "@sportspulse/api-client";

/**
 * Captain-side invite issuance. Picks a season the captain's team is
 * registered in (we don't have a team→season join exposed yet, so the
 * captain picks from the org's open seasons), then either:
 *   - emails a personal invite (kind=personal, expires 7d), or
 *   - generates a generic team URL (kind=generic, expires 365d).
 */
export function CreateInviteForm({ teamId }: { teamId: string }) {
  const router = useRouter();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [seasonId, setSeasonId] = useState("");
  const [email, setEmail] = useState("");
  const [kind, setKind] = useState<"personal" | "generic">("personal");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  // Fetch seasons in the captain's org so we have a season picker.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const scope = await iam.meScope();
        const orgId = scope.orgIds[0];
        if (!orgId) return;
        const page = await leagueMgmt.listSeasons({ orgId });
        if (cancelled) return;
        const list = page.items;
        setSeasons(list);
        if (list[0]) setSeasonId(list[0].id);
      } catch {
        // non-fatal: captain just won't be able to pick a season
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setOkMsg(null);
    try {
      if (!seasonId) throw new Error("Pick a season");
      if (kind === "personal" && !email.trim()) {
        throw new Error("Email is required for personal invites");
      }
      const inv = await registrationV2.createTeamInvite({
        teamId,
        seasonId,
        kind,
        ...(kind === "personal" ? { inviteeEmail: email.trim() } : {})
      });
      setOkMsg(
        kind === "generic"
          ? `Team URL: /invite/${inv.token}`
          : `Invite sent to ${email}`
      );
      setEmail("");
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
    >
      <Field label="Season" htmlFor="season">
        <Select
          id="season"
          value={seasonId}
          onChange={(e) => setSeasonId(e.target.value)}
        >
          <option value="">Select a season…</option>
          {seasons.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Kind" htmlFor="kind">
        <Select
          id="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as "personal" | "generic")}
        >
          <option value="personal">Personal email</option>
          <option value="generic">Generic team URL</option>
        </Select>
      </Field>
      {kind === "personal" ? (
        <Field label="Player email" htmlFor="email">
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="player@example.com"
          />
        </Field>
      ) : (
        <Field label="" htmlFor="empty">
          <p className="text-[11px] text-fg-muted">
            A shareable URL is generated. Anyone with the link can register.
          </p>
        </Field>
      )}
      <div className="flex h-9 items-end">
        <Button type="submit" disabled={busy}>
          {busy ? (
            <>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              Sending…
            </>
          ) : (
            <>
              {kind === "personal" ? (
                <Mail className="mr-1.5 h-4 w-4" strokeWidth={1.75} />
              ) : (
                <Plus className="mr-1.5 h-4 w-4" strokeWidth={1.75} />
              )}
              {kind === "personal" ? "Send invite" : "Create URL"}
            </>
          )}
        </Button>
      </div>
      {err ? (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-[12px] text-rose-600 dark:text-rose-400 sm:col-span-4">
          {err}
        </p>
      ) : null}
      {okMsg ? (
        <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-700 dark:text-emerald-300 sm:col-span-4">
          {okMsg}
        </p>
      ) : null}
    </form>
  );
}
