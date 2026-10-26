"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Mail, Plus } from "lucide-react";
import { Alert, Button, Field, Input, Select } from "@sportspulse/ui";
import { registrationV2 } from "@/lib/api/browser-api";

/**
 * Captain-side invite issuance. The season picker lists only the
 * seasons the team is live in and defaults to the team's current one;
 * both come from the server page (same kernel rule as the roster page),
 * so the two surfaces can never default to different seasons (CAP-15,
 * CAP-24). Then either:
 *   - emails a personal invite (kind=personal, expires 7d), or
 *   - generates a generic team URL (kind=generic, expires 365d).
 */
/**
 * Player app origin for invite links. NEXT_PUBLIC_PLAYER_WEB_URL wins;
 * otherwise swap this app's "team" host for "player"
 * (team.sportspulse.us -> player.sportspulse.us, staging-team -> staging-player).
 */
function playerAppOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_PLAYER_WEB_URL;
  if (configured) return configured.replace(/\/$/, "");
  const { protocol, host } = window.location;
  if (host.startsWith("localhost")) return `${protocol}//localhost:3004`;
  return `${protocol}//${host.replace(/(^|-)team\./, "$1player.")}`;
}

export function CreateInviteForm({
  teamId,
  seasons,
  defaultSeasonId
}: {
  teamId: string;
  /** Seasons the team is live in, most current first. */
  seasons: Array<{ id: string; name: string }>;
  /** The team's current season; null when the team is in no season. */
  defaultSeasonId: string | null;
}) {
  const router = useRouter();
  const [seasonId, setSeasonId] = useState(defaultSeasonId ?? "");
  const [email, setEmail] = useState("");
  const [kind, setKind] = useState<"personal" | "generic">("personal");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  if (seasons.length === 0) {
    return (
      <div className="rounded-md border border-border bg-bg-subtle px-4 py-3 text-[13px] text-fg-muted">
        Your team is not entered in a season yet, so there is nothing to
        invite players into.{" "}
        <Link
          href="/captain/register"
          className="inline-flex items-center gap-1 font-medium text-accent hover:underline"
        >
          Register the team first
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
        </Link>
      </div>
    );
  }

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
      // Personal invites are emailed with this same link; show it too so
      // the captain can share it directly.
      const link = `${playerAppOrigin()}/invite/${inv.token}`;
      setOkMsg(
        kind === "generic"
          ? `Team link created. Share it with your players: ${link}`
          : `Invite created for ${email}. They get an email with this link: ${link}`
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
        <Alert tone="error" className="sm:col-span-4">
          {err}
        </Alert>
      ) : null}
      {okMsg ? (
        <Alert tone="success" role="status" className="sm:col-span-4">
          {okMsg}
        </Alert>
      ) : null}
    </form>
  );
}
