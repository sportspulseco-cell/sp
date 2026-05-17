import Link from "next/link";
import {
  ExternalLink,
  FileSignature,
  Inbox,
  Sparkles,
  TrendingUp
} from "lucide-react";
import type { PublicSeasonContext } from "@sportspulse/registration-funnel";
import { ReviewQueue } from "@/components/registrations/review-queue";
import { registration } from "@/lib/api/server-api";
import { Reveal } from "@/components/motion/reveal";
import { Counter } from "@/components/motion/counter";
import {
  EkgLine,
  LiveDot,
  MarqueeRail,
  ScanSheen
} from "@/components/motion/kinetic";
import { ProgressBar } from "../dashboard/live-widgets";
import { FunnelClient } from "../../registration/[id]/funnel-client";

export const metadata = { title: "Registrations — SportsPulse" };
export const dynamic = "force-dynamic";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

async function getContext(seasonId: string): Promise<PublicSeasonContext | null> {
  try {
    const res = await fetch(
      `${API}/public/registration/seasons/${seasonId}`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    return (await res.json()) as PublicSeasonContext;
  } catch {
    return null;
  }
}

/**
 * /registrations is the review surface — kinetic editorial hero with a
 * strip of live registration cards, a marquee of recent submission
 * events, the review queue underneath, and the inline wizard preview
 * at the bottom (per repo owner directive: the wizard is integral here,
 * not a separate route).
 *
 * The kinetic strip mirrors /dashboard's pattern but with cards
 * specialised to registration data: Inbox / Throughput / Form binding.
 */
export default async function RegistrationsPage() {
  const [formsPage, regsPage] = await Promise.all([
    registration
      .listForms({ purpose: "season_registration" })
      .catch(() => ({ items: [], nextCursor: null })),
    registration.listRegistrations().catch(() => ({ items: [] }))
  ]);

  const seasonForms = formsPage.items
    .filter((f) => !!f.seasonId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const activeForm = seasonForms[0] ?? null;
  const ctx = activeForm?.seasonId
    ? await getContext(activeForm.seasonId)
    : null;

  const items = regsPage.items ?? [];
  const pending = items.filter(
    (r) =>
      r.status === "submitted" ||
      r.status === "under_review" ||
      r.status === "pending_review"
  ).length;
  const approved = items.filter((r) => r.status === "approved").length;
  const rejected = items.filter((r) => r.status === "rejected").length;
  const total = items.length;
  const decided = approved + rejected;
  const approvalRate = decided === 0 ? 0 : Math.round((approved / decided) * 100);

  // Throughput — submissions in the last 7 days, by createdAt.
  const now = Date.now();
  const sevenDays = 7 * 24 * 3600 * 1000;
  const recent = items.filter(
    (r) => now - new Date(r.createdAt).getTime() < sevenDays
  );

  // Most recent submissions, sorted desc, for the marquee.
  const recentSorted = [...items]
    .sort((a, b) =>
      (b.submittedAt ?? b.createdAt).localeCompare(a.submittedAt ?? a.createdAt)
    )
    .slice(0, 8);

  const marqueeItems =
    recentSorted.length > 0
      ? recentSorted.map((r) => ({
          key: r.id,
          node: (
            <span className="inline-flex items-center gap-2">
              <span className="font-mono">{r.id.slice(0, 8)}</span>
              <span className="text-fg-subtle">·</span>
              <span>{r.status.replace(/_/g, " ")}</span>
              <span className="text-fg-subtle">·</span>
              <span>{relTime(r.submittedAt ?? r.createdAt)}</span>
            </span>
          )
        }))
      : [
          { key: "0", node: <>no registrations yet</> },
          { key: "1", node: <>send your form to a player to seed the queue</> },
          { key: "2", node: <>or run the demo seed</> }
        ];

  return (
    <div className="space-y-12">
      {/* HERO with kinetic strip embedded */}
      <section className="relative isolate overflow-hidden rounded-2xl border border-border bg-surface-1">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-grid-light mask-fade-edges opacity-90"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-radial-fade-light"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 left-1/2 h-[420px] w-[820px] -translate-x-1/2 animate-pulse-slow rounded-full bg-[--accent]/10 blur-[140px]"
        />

        <div className="relative px-7 pb-10 pt-12 lg:px-10 lg:pb-14 lg:pt-16">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.22em] text-fg-muted">
            <LiveDot tone={pending > 0 ? "accent" : "success"} />
            <span className="text-fg/80">// review</span>
            <span className="text-fg-subtle">·</span>
            <span>queue</span>
          </div>

          <h1 className="mt-5 max-w-[18ch] text-balance font-sans text-[clamp(40px,7vw,96px)] font-semibold leading-[0.92] tracking-tighter text-fg">
            Every registration, in flight.
          </h1>

          <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-fg-muted">
            Player and team submissions across every org. Live throughput
            on the right; the review queue below; the wizard your players
            see is rendered inline at the bottom.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-2.5">
            {activeForm ? (
              <Link
                href={`/forms/${activeForm.id}`}
                className="group inline-flex items-center gap-2 rounded-full bg-fg px-5 py-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-bg transition-transform hover:scale-[1.02] active:scale-100"
              >
                <FileSignature className="h-3.5 w-3.5" strokeWidth={1.75} />
                Edit form
              </Link>
            ) : null}
            {activeForm?.seasonId ? (
              <a
                // Absolute URL into player-web; relative path stayed on
                // superadmin and showed the admin's session view of the
                // funnel rather than the fresh-visitor experience the
                // tooltip promised (BUG-044a, family of BUG-042).
                href={`${process.env.NEXT_PUBLIC_PLAYER_WEB_URL ?? "https://sp-player-red.vercel.app"}/register/${activeForm.seasonId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-border-strong bg-bg-subtle px-5 py-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-fg-muted transition-colors hover:border-fg-muted hover:text-fg"
              >
                <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} />
                Public funnel
              </a>
            ) : null}
            <Link
              href="/forms"
              className="inline-flex items-center gap-2 rounded-full border border-border-strong bg-bg-subtle px-5 py-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-fg-muted transition-colors hover:border-fg-muted hover:text-fg"
            >
              <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />
              All forms
            </Link>
          </div>

          {/* KINETIC STRIP — 3 specialised cards */}
          <Reveal delay={0.18} y={32} className="mt-14 lg:mt-20">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <InboxCard pending={pending} total={total} />
              <ThroughputCard
                last7={recent.length}
                approvalRate={approvalRate}
                decided={decided}
              />
              <FormBindingCard
                form={activeForm}
                ctx={ctx}
                hasRecent={recent.length > 0}
              />

              {/* Footer 4-cell band */}
              <div className="md:col-span-3">
                <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-4">
                  <StatCell
                    label="In queue"
                    value={pending}
                    tone={pending > 0 ? "warn" : "ok"}
                  />
                  <StatCell label="Approved" value={approved} />
                  <StatCell label="Rejected" value={rejected} />
                  <StatCell label="Last 7d" value={recent.length} />
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* MARQUEE — recent submissions ticker */}
      <MarqueeRail items={marqueeItems} className="-mx-2 rounded-xl" />

      {/* REVIEW QUEUE */}
      <Reveal>
        <div>
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-fg-muted">
            // queue
          </p>
          <h2 className="mb-6 text-[22px] font-semibold tracking-tight text-fg">
            Pending review
          </h2>
          <ReviewQueue />
        </div>
      </Reveal>

      {/* INLINE WIZARD — integral to /registrations */}
      <Reveal>
        <section className="space-y-4">
          <header className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-fg-muted">
                // wizard
              </p>
              <h2 className="mt-2 text-[22px] font-semibold tracking-tight text-fg">
                What your players see
              </h2>
              <p className="mt-1 text-[13px] text-fg-muted">
                {ctx
                  ? `Rendering against ${ctx.season.name} · schema sourced from /forms`
                  : "No season-bound form yet — configure one in /forms first."}
              </p>
            </div>
          </header>

          {ctx ? (
            <div className="overflow-hidden rounded-xl border border-border bg-bg-subtle">
              <FunnelClient context={ctx} />
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-bg-subtle p-8 text-center">
              <FileSignature
                className="mx-auto h-6 w-6 text-fg-muted"
                strokeWidth={1.5}
              />
              <p className="mt-3 text-[14px] font-medium text-fg">
                No registration form configured yet
              </p>
              <p className="mt-1 text-[12px] text-fg-muted">
                Run{" "}
                <code className="font-mono">
                  pnpm --filter @sportspulse/db seed:registration-form-demo
                </code>{" "}
                or{" "}
                <Link href="/forms" className="underline">
                  create one in /forms
                </Link>{" "}
                and bind it to a season.
              </p>
            </div>
          )}
        </section>
      </Reveal>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Live cards
 * -------------------------------------------------------------------------*/

function InboxCard({ pending, total }: { pending: number; total: number }) {
  const isWaiting = pending > 0;
  return (
    <article className="relative overflow-hidden rounded-xl border border-border bg-surface-1 p-5">
      {isWaiting ? <ScanSheen /> : null}
      <div className="relative flex items-center justify-between">
        <p
          className={
            isWaiting
              ? "flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-amber-700"
              : "flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-fg-muted"
          }
        >
          {isWaiting ? <LiveDot tone="accent" /> : <Inbox className="h-3 w-3" strokeWidth={1.75} />}
          {isWaiting ? "needs review" : "inbox · clear"}
        </p>
        <Inbox className="h-3.5 w-3.5 text-fg-muted" strokeWidth={1.75} />
      </div>
      <div className="relative mt-5">
        <Counter
          value={pending}
          className="font-mono text-4xl font-semibold tabular-nums tracking-tighter text-fg"
        />
      </div>
      <p className="relative mt-3 text-[12px] text-fg-muted">
        {pending} pending · {total} total submissions
      </p>
      <div className="relative mt-3">
        {isWaiting ? null : <EkgLine width={88} height={24} tone="success" />}
      </div>
    </article>
  );
}

function ThroughputCard({
  last7,
  approvalRate,
  decided
}: {
  last7: number;
  approvalRate: number;
  decided: number;
}) {
  return (
    <article className="relative overflow-hidden rounded-xl border border-border bg-surface-1 p-5">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-fg-muted">
          Throughput · 7d
        </p>
        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-700">
          <TrendingUp className="h-3 w-3" strokeWidth={2} />
          {last7} this week
        </span>
      </div>
      <div className="mt-5 flex items-baseline gap-3">
        <Counter
          value={approvalRate}
          className="font-mono text-4xl font-semibold tabular-nums tracking-tighter text-fg"
        />
        <span className="font-mono text-base text-fg-muted">% approved</span>
      </div>
      <ProgressBar value={approvalRate} />
      <p className="mt-2 text-[11px] text-fg-muted">
        {decided} decided · {last7} new in last 7 days
      </p>
    </article>
  );
}

function FormBindingCard({
  form,
  ctx,
  hasRecent
}: {
  form: { id: string; name: string; seasonId: string | null } | null;
  ctx: PublicSeasonContext | null;
  hasRecent: boolean;
}) {
  if (!form) {
    return (
      <article className="relative overflow-hidden rounded-xl border border-dashed border-border bg-surface-1 p-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-fg-muted">
          Bound form
        </p>
        <p className="mt-5 text-[13px] font-medium text-fg">No form bound</p>
        <p className="mt-1 text-[12px] text-fg-muted">
          Create a season-bound form in /forms to start collecting
          submissions here.
        </p>
        <Link
          href="/forms"
          className="mt-4 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[--accent] hover:underline"
        >
          → /forms
        </Link>
      </article>
    );
  }
  return (
    <article className="relative overflow-hidden rounded-xl border border-border bg-surface-1 p-5">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-fg-muted">
          Bound form
        </p>
        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-cyan-700">
          <LiveDot tone="cyan" />
          {hasRecent ? "active" : "ready"}
        </span>
      </div>
      <p className="mt-5 truncate text-[18px] font-semibold tracking-tight text-fg">
        {form.name}
      </p>
      <p className="mt-1 truncate font-mono text-[10px] uppercase tracking-[0.18em] text-fg-muted">
        {ctx ? ctx.season.name : "season pending"}
      </p>
      <div className="mt-4 flex items-center gap-2">
        <Link
          href={`/forms/${form.id}`}
          className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-2.5 font-mono text-[10px] uppercase tracking-[0.18em] text-fg hover:border-fg-muted"
        >
          <FileSignature className="h-3 w-3" strokeWidth={1.75} />
          edit
        </Link>
        {form.seasonId ? (
          <a
            // Absolute URL into player-web (BUG-044b, family of BUG-042).
            href={`${process.env.NEXT_PUBLIC_PLAYER_WEB_URL ?? "https://sp-player-red.vercel.app"}/register/${form.seasonId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-2.5 font-mono text-[10px] uppercase tracking-[0.18em] text-fg-muted hover:border-fg-muted hover:text-fg"
          >
            <ExternalLink className="h-3 w-3" strokeWidth={1.75} />
            preview
          </a>
        ) : null}
      </div>
    </article>
  );
}

function StatCell({
  label,
  value,
  tone = "ok"
}: {
  label: string;
  value: number;
  tone?: "ok" | "warn";
}) {
  return (
    <div className="bg-surface-1 px-5 py-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-muted">
        {label}
      </p>
      <p className="mt-2 flex items-baseline gap-2">
        <Counter
          value={value}
          className="font-mono text-2xl font-semibold tabular-nums tracking-tighter text-fg"
        />
        {tone === "warn" && value > 0 ? <LiveDot tone="accent" /> : null}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * "5 min ago" formatter for the marquee.
 * -------------------------------------------------------------------------*/

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
