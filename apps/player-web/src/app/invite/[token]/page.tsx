import Link from "next/link";
import { statusLabel } from "@sportspulse/kernel";
import { createClient } from "@/lib/supabase/server";
import { AcceptInviteButton } from "./accept-invite-button";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

type InviteContext = {
  teamName: string;
  seasonName: string;
  kind: string;
  /** free_agent_offer: a team's offer from the free-agent pool (CAP-9). */
  offerKind?: "free_agent_offer" | "team_invite";
  status: string;
};

async function fetchInvite(token: string): Promise<InviteContext | null> {
  try {
    const res = await fetch(
      `${API}/public/registration/invites/${encodeURIComponent(token)}`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    return (await res.json()) as InviteContext;
  } catch {
    return null;
  }
}

export const dynamic = "force-dynamic";
export const metadata = { title: "Team invite · Player" };

/**
 * Captain invite landing (UC-04). The captain shares
 * player-web/invite/<token>; anyone can see which team it is, and a
 * signed-in player joins with one click. Middleware whitelists /invite.
 */
export default async function InvitePage({
  params
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [invite, supabase] = await Promise.all([fetchInvite(token), createClient()]);
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const here = `/invite/${encodeURIComponent(token)}`;

  return (
    <div className="min-h-screen bg-bg text-fg">
      <div className="mx-auto max-w-xl space-y-6 px-6 py-16">
        <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          // SportsPulse · Team invite
        </p>
        {!invite ? (
          <Message title="Invite not found">
            This link is not valid. Ask your captain to send a new one.
          </Message>
        ) : invite.status !== "pending" && invite.status !== "extended" ? (
          <Message title={`This invite is ${statusLabel(invite.status).toLowerCase()}`}>
            Ask the captain of {invite.teamName} for a new invite.
          </Message>
        ) : (
          <div className="space-y-5 rounded-xl border border-border bg-surface-1 p-6">
            <div>
              <h1 className="text-[24px] font-semibold tracking-tight text-fg">
                Join {invite.teamName}
              </h1>
              <p className="mt-1 text-[14px] text-fg-muted">
                {invite.offerKind === "free_agent_offer"
                  ? `${invite.teamName} offered you a spot for ${invite.seasonName} from the free-agent pool. Accept to join the roster, or decline to stay in the pool.`
                  : invite.seasonName}
              </p>
              <p className="mt-2 text-[13px] text-fg-muted">
                Players join a team by registering for the season (form, waivers and payment). If you
                have not registered yet, Join opens the registration with {invite.teamName} set.
              </p>
            </div>
            {user ? (
              <AcceptInviteButton
                token={token}
                teamName={invite.teamName}
                canDecline={invite.kind === "personal"}
              />
            ) : (
              <div className="flex flex-wrap gap-3">
                <Link
                  href={`/sign-in?next=${encodeURIComponent(here)}`}
                  className="inline-flex h-10 items-center rounded-md bg-accent px-4 text-sm font-medium text-accent-fg"
                >
                  Sign in to join
                </Link>
                <Link
                  href={`/sign-up?next=${encodeURIComponent(here)}`}
                  className="inline-flex h-10 items-center rounded-md border border-border px-4 text-sm font-medium text-fg"
                >
                  Create an account
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Message({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface-1 p-6">
      <h1 className="text-[20px] font-semibold tracking-tight text-fg">{title}</h1>
      <p className="mt-2 text-[14px] text-fg-muted">{children}</p>
    </div>
  );
}
