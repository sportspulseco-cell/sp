"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Copy,
  Loader2
} from "lucide-react";
import { leagueMgmt } from "@/lib/api/browser-api";
import type { Season } from "@/lib/api/types";
import type { EmailTemplate, PricingTier } from "@/lib/api/sdk";

const SECTION_LABELS: Record<string, string> = {
  season: "Season setup",
  pricing: "Pricing tiers",
  divisions: "Divisions",
  form: "Form builder",
  email: "Email templates",
  publish: "Review & publish"
};

export function ReviewPublishTab({
  season,
  completion,
  tiers,
  templates,
  onJump
}: {
  season: Season;
  completion: Record<string, "done" | "warning" | "idle" | "active">;
  tiers: PricingTier[];
  templates: EmailTemplate[];
  onJump: (id: string) => void;
}) {
  const blockers: { id: string; message: string }[] = [];
  if (completion.season !== "done") {
    blockers.push({
      id: "season",
      message: "Season setup has missing required fields."
    });
  }
  if (tiers.filter((t) => t.isActive).length === 0) {
    blockers.push({
      id: "pricing",
      message:
        "At least one pricing tier must be active before the season can go live."
    });
  }
  if (templates.filter((t) => t.isActive).length === 0) {
    blockers.push({
      id: "email",
      message:
        "Add at least one active email template (recommended: on_payment + on_approved)."
    });
  }

  const canPublish = blockers.length === 0;
  const isLive =
    season.status === "registration_open" ||
    season.status === "in_progress" ||
    season.status === "playoffs";

  const router = useRouter();
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  // Player-facing public URLs the admin can copy + share. The funnel
  // lives in superadmin-web at /registration/{id} AND in player-web
  // at /register/{id} — both render the same shared funnel.
  const publicBase =
    process.env.NEXT_PUBLIC_PLAYER_WEB_URL ?? "https://sp-player-red.vercel.app";
  const adminBase =
    process.env.NEXT_PUBLIC_SUPERADMIN_WEB_URL ??
    (typeof window !== "undefined" ? window.location.origin : "");
  const playerLink = `${publicBase}/register/${season.id}`;
  const adminPreviewLink = `${adminBase}/registration/${season.id}`;

  async function publish() {
    setPublishing(true);
    setPublishError(null);
    try {
      await leagueMgmt.changeSeasonStatus(season.id, "registration_open");
      router.refresh();
    } catch (e) {
      setPublishError((e as Error).message);
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="font-mono text-[11px] uppercase tracking-widest text-fg-muted">
          // 06 · Review & Publish
        </p>
        <h1 className="mt-2 text-[32px] font-semibold tracking-tighter text-fg">
          Review & publish
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-fg-muted">
          Validate every section, then flip the season to{" "}
          <span className="font-mono">live</span>.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {Object.entries(completion).map(([id, state]) => (
          <button
            key={id}
            type="button"
            onClick={() => onJump(id)}
            className="group flex items-center justify-between rounded-xl border border-border bg-surface-1 p-4 text-left hover:border-border-strong"
          >
            <div className="flex items-center gap-3">
              <span
                className={
                  state === "done"
                    ? "flex h-7 w-7 items-center justify-center rounded-md bg-success/15 text-success"
                    : state === "warning"
                      ? "flex h-7 w-7 items-center justify-center rounded-md bg-warning/15 text-warning"
                      : "flex h-7 w-7 items-center justify-center rounded-md bg-surface-2 text-fg-muted"
                }
              >
                {state === "done" ? (
                  <CheckCircle2 className="h-4 w-4" strokeWidth={2.25} />
                ) : state === "warning" ? (
                  <AlertCircle className="h-4 w-4" strokeWidth={2.25} />
                ) : (
                  <span className="font-mono text-[11px]">·</span>
                )}
              </span>
              <div>
                <p className="text-[14px] font-medium tracking-tight text-fg">
                  {SECTION_LABELS[id] ?? id}
                </p>
                <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                  {state === "done"
                    ? "Ready"
                    : state === "warning"
                      ? "Needs attention"
                      : "Not started"}
                </p>
              </div>
            </div>
            <ChevronRight
              className="h-4 w-4 text-fg-muted transition-transform group-hover:translate-x-0.5"
              strokeWidth={1.75}
            />
          </button>
        ))}
      </div>

      <section className="rounded-xl border border-border bg-surface-1 p-6">
        <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          Pre-flight checklist
        </p>
        <ul className="mt-4 space-y-2.5">
          {blockers.length === 0 ? (
            <li className="flex items-center gap-2.5 text-[14px] text-success">
              <CheckCircle2 className="h-4 w-4" strokeWidth={2.25} />
              All blockers cleared. Ready to publish.
            </li>
          ) : (
            blockers.map((b) => (
              <li
                key={b.id + b.message}
                className="flex items-center gap-2.5 text-[13px] text-warning"
              >
                <AlertCircle className="h-4 w-4 shrink-0" strokeWidth={2.25} />
                <span className="flex-1">{b.message}</span>
                <button
                  type="button"
                  onClick={() => onJump(b.id)}
                  className="font-mono text-[10px] uppercase tracking-widest text-fg-muted underline-offset-2 hover:underline"
                >
                  Fix
                </button>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="rounded-xl border border-border bg-surface-1 p-6">
        <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          Registration links
        </p>
        <p className="mt-1 text-[12px] text-fg-muted">
          Share these with players and captains. The player link is the
          public funnel; the admin preview lets you walk through the same
          flow from inside superadmin-web.
        </p>
        <div className="mt-4 space-y-3">
          <LinkRow label="Player registration" url={playerLink} />
          <LinkRow label="Admin preview" url={adminPreviewLink} />
        </div>
      </section>

      <div className="flex items-center justify-between rounded-xl border border-border bg-bg-elev p-5">
        <div>
          <p className="text-[14px] font-medium tracking-tight text-fg">
            {isLive ? "Season is live" : "Publish season"}
          </p>
          <p className="mt-1 text-[12px] text-fg-muted">
            {isLive ? (
              <>
                Status: <span className="font-mono">{season.status}</span>.
                Public registration links above are live.
              </>
            ) : (
              <>
                Sets <span className="font-mono">{season.name}</span> status to{" "}
                <span className="font-mono">registration_open</span> and
                activates the public registration page.
              </>
            )}
          </p>
          {publishError && (
            <p className="mt-1 text-[12px] text-rose-600 dark:text-rose-400">
              {publishError}
            </p>
          )}
        </div>
        <button
          type="button"
          disabled={!canPublish || publishing || isLive}
          onClick={publish}
          className="inline-flex items-center gap-2 rounded-full bg-fg px-5 py-2 font-mono text-[11px] font-medium uppercase tracking-widest text-bg disabled:cursor-not-allowed disabled:opacity-40"
        >
          {publishing ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Publishing…
            </>
          ) : isLive ? (
            "Already live"
          ) : canPublish ? (
            "Publish"
          ) : (
            `Blocked (${blockers.length})`
          )}
        </button>
      </div>
    </div>
  );
}

function LinkRow({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-bg-subtle px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          {label}
        </p>
        <p className="mt-0.5 truncate font-mono text-[12px] text-fg">{url}</p>
      </div>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            // Older browsers / non-secure contexts — pop a fallback prompt.
            window.prompt("Copy this URL", url);
          }
        }}
        className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-surface-1 px-2.5 font-mono text-[10px] uppercase tracking-widest text-fg-muted hover:border-fg-muted hover:text-fg"
      >
        {copied ? (
          <>
            <CheckCircle2 className="h-3 w-3" strokeWidth={2} /> Copied
          </>
        ) : (
          <>
            <Copy className="h-3 w-3" strokeWidth={2} /> Copy
          </>
        )}
      </button>
    </div>
  );
}
