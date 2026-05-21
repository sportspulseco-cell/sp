import { CheckCircle2, XCircle, Clock } from "lucide-react";
import { ParentalConsentClient } from "./consent-client";

const API =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

type ConsentContext = {
  submissionId: string;
  status: string;
  childDisplayName: string;
  seasonName: string | null;
  orgName: string | null;
  expired: boolean;
  confirmedAt: string | null;
};

async function fetchContext(token: string): Promise<ConsentContext | null> {
  try {
    const res = await fetch(
      `${API}/public/registration/parental-consent/${encodeURIComponent(token)}`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    return (await res.json()) as ConsentContext;
  } catch {
    return null;
  }
}

export const dynamic = "force-dynamic";
export const metadata = { title: "Parental consent — SportsPulse" };

/**
 * Parent-facing consent portal. The parent clicks the URL we emailed
 * them and lands here. Anonymous (no Supabase session) — middleware
 * whitelists `/parental-consent`. Backlog #8.
 */
export default async function ParentalConsentPage({
  params
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const ctx = await fetchContext(token);

  return (
    <div className="min-h-screen bg-bg text-fg">
      <div className="mx-auto max-w-xl px-6 py-16">
        <header className="space-y-2 border-b border-border pb-6">
          <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            // SportsPulse · Parental consent
          </p>
          <h1 className="text-[28px] font-semibold tracking-tighter text-fg">
            Confirm your child&apos;s registration
          </h1>
        </header>

        {!ctx ? (
          <Card
            tone="rose"
            icon={<XCircle className="h-6 w-6" strokeWidth={1.75} />}
            title="Invalid or unrecognised link"
            body="This consent link doesn't match any registration we can find. It may have been mistyped or already expired. Ask the player to resend the consent email."
          />
        ) : ctx.expired ? (
          <Card
            tone="amber"
            icon={<Clock className="h-6 w-6" strokeWidth={1.75} />}
            title="This link has expired"
            body="Consent links expire 24 hours after they're sent. Ask the player to resend the consent email — they can do that from the registration funnel."
          />
        ) : ctx.confirmedAt ? (
          <Card
            tone="emerald"
            icon={<CheckCircle2 className="h-6 w-6" strokeWidth={1.75} />}
            title="Consent already on file"
            body={`You confirmed ${ctx.childDisplayName}'s registration on ${new Date(ctx.confirmedAt).toLocaleDateString("en-CA")}. Nothing else to do here.`}
          />
        ) : ctx.status !== "pending_consent" ? (
          <Card
            tone="amber"
            icon={<Clock className="h-6 w-6" strokeWidth={1.75} />}
            title="Registration no longer awaiting consent"
            body={`This registration is in state "${ctx.status}". If you weren't expecting that, contact the league admin.`}
          />
        ) : (
          <ParentalConsentClient
            token={token}
            childDisplayName={ctx.childDisplayName}
            seasonName={ctx.seasonName}
            orgName={ctx.orgName}
          />
        )}

        <p className="mt-12 text-[11px] text-fg-muted">
          You&apos;re seeing this page because someone listed you as the
          parent or guardian of a minor registering for a SportsPulse
          league. If you weren&apos;t expecting this, you can safely
          ignore — no action means the registration won&apos;t advance.
        </p>
      </div>
    </div>
  );
}

function Card({
  tone,
  icon,
  title,
  body
}: {
  tone: "rose" | "emerald" | "amber";
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  const toneClass: Record<typeof tone, string> = {
    rose: "border-[var(--tint-rose-fg)]/30 bg-[var(--tint-rose-bg)] dark:bg-[var(--tint-rose-bg)] text-[var(--tint-rose-fg)]",
    emerald:
      "border-[var(--tint-emerald-fg)]/30 bg-[var(--tint-emerald-bg)] dark:bg-[var(--tint-emerald-bg)] text-[var(--tint-emerald-fg)]",
    amber:
      "border-[var(--tint-amber-fg)]/30 bg-[var(--tint-amber-bg)] dark:bg-[var(--tint-amber-bg)] text-[var(--tint-amber-fg)]"
  };
  return (
    <section className={`mt-8 rounded-2xl border p-6 ${toneClass[tone]}`}>
      <div className="flex items-start gap-3">
        <div className="shrink-0">{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-[18px] font-semibold tracking-tight text-fg">
            {title}
          </p>
          <p className="mt-1 text-[13px] text-fg-muted">{body}</p>
        </div>
      </div>
    </section>
  );
}
