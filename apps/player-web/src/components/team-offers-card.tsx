"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2, Mail, X } from "lucide-react";
import { Alert, Button, Eyebrow, useLocalDate, navigateInPlace } from "@sportspulse/ui";
import type { MyTeamInvite } from "@sportspulse/api-client";
import { captain } from "@/lib/api/browser-api";

type Answer = { kind: "accepted" | "declined"; teamName: string };

/**
 * Team offers and invites waiting for the player's answer (UC-03, CAP-9).
 * A captain or league admin offered a spot from the free-agent pool, or
 * a captain invited them by email. Accept joins the roster through the
 * same API the invite link uses; Decline leaves them in the pool and
 * tells whoever made the offer. Each answer replaces the row with what
 * the API confirmed. Renders nothing when there is nothing to answer.
 */
export function TeamOffersCard({ items }: { items: MyTeamInvite[] }) {
  const localDate = useLocalDate();
  const router = useRouter();
  const [open, setOpen] = useState<MyTeamInvite[]>(items);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [answered, setAnswered] = useState<Answer[]>([]);

  if (open.length === 0 && answered.length === 0) return null;

  async function answer(inv: MyTeamInvite, kind: "accept" | "decline") {
    setBusy(`${inv.id}:${kind}`);
    setError(null);
    try {
      if (kind === "accept") {
        const res = await captain.acceptInvite(inv.token);
        // No season registration yet: register with this team set (UC-04).
        if (res.status === "registration_required" && res.registerPath) {
          navigateInPlace((h) => router.push(h), res.registerPath, 8000);
          return;
        }
      } else await captain.declineInvite(inv.token);
      setOpen((prev) => prev.filter((p) => p.id !== inv.id));
      setAnswered((prev) => [
        ...prev,
        { kind: kind === "accept" ? "accepted" : "declined", teamName: inv.teamName }
      ]);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section
      aria-label="Team offers"
      className="rounded-xl border border-accent/30 bg-accent/[0.04] p-5"
    >
      <Eyebrow>Team offers</Eyebrow>
      {open.length > 0 ? (
        <p className="mt-1 text-[13px] text-fg-muted">
          {open.length === 1
            ? "A team wants you on their roster. Accept to join, or decline."
            : `${open.length} teams want you on their roster. Accept one to join, or decline.`}
        </p>
      ) : null}

      {error ? (
        <div className="mt-3">
          <Alert tone="error">{error}</Alert>
        </div>
      ) : null}

      <ul className="mt-3 space-y-2">
        {answered.map((a, i) => (
          <li
            key={`answered-${i}`}
            className="rounded-md border border-border bg-bg px-4 py-3 text-[13px] text-fg"
          >
            {a.kind === "accepted" ? (
              <>
                You joined {a.teamName}.{" "}
                <Link href="/team" className="text-accent underline">
                  See your team
                </Link>
              </>
            ) : (
              <>You declined the {a.teamName} offer. You stay in the free-agent pool.</>
            )}
          </li>
        ))}
        {open.map((inv) => (
          <li
            key={inv.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-bg px-4 py-3"
          >
            <div className="min-w-0">
              <p className="text-[14px] font-medium text-fg">
                <Mail className="mr-1.5 inline h-3.5 w-3.5 text-fg-muted" strokeWidth={1.75} />
                {inv.teamName}
              </p>
              <p className="mt-0.5 text-[11px] text-fg-muted">
                {inv.kind === "free_agent_offer" ? "Offer from the free-agent pool" : "Team invite"}
                {inv.seasonName ? ` · ${inv.seasonName}` : ""}
                {inv.expiresAt ? ` · answer by ${localDate(inv.expiresAt, "monthDay")}` : ""}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => answer(inv, "accept")}
                disabled={busy !== null}
              >
                {busy === `${inv.id}:accept` ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="mr-1.5 h-3.5 w-3.5" strokeWidth={2} />
                )}
                Accept
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => answer(inv, "decline")}
                disabled={busy !== null}
              >
                {busy === `${inv.id}:decline` ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <X className="mr-1.5 h-3.5 w-3.5" strokeWidth={2} />
                )}
                Decline
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
