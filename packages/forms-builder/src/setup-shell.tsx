"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Check,
  AlertCircle,
  ExternalLink,
  Eye,
  MoreHorizontal,
  Send
} from "lucide-react";
import { cn } from "@sportspulse/ui";
import type { ReactNode } from "react";

export type SectionKey =
  | "season"
  | "pricing"
  | "divisions"
  | "form_builder"
  | "email_templates"
  | "review"
  | "submissions";

export type SectionStatus = "done" | "issue" | "idle";

export interface SectionState {
  key: SectionKey;
  index: number;
  label: string;
  /** Suffix pill on the section row: "done" | "1issue" | undefined */
  status: SectionStatus;
  /** Optional issue count (renders as "Nissue") when status === "issue" */
  issueCount?: number;
}

const SECTION_DEFS: {
  key: Exclude<SectionKey, "submissions">;
  index: number;
  label: string;
}[] = [
  { key: "season", index: 1, label: "Season setup" },
  { key: "pricing", index: 2, label: "Pricing" },
  { key: "divisions", index: 3, label: "Divisions" },
  { key: "form_builder", index: 4, label: "Form builder" },
  { key: "email_templates", index: 5, label: "Email templates" },
  { key: "review", index: 6, label: "Review & publish" }
];

/**
 * Inlined LiveDot (was in sa-web's components/motion/kinetic). Tiny
 * pinging-ring status dot. Kept local to the package so consumers
 * don't need to import a separate motion primitive.
 */
function LiveDot({
  tone = "accent",
  className
}: {
  tone?: "accent" | "success" | "error" | "cyan";
  className?: string;
}) {
  const ringByTone: Record<string, string> = {
    accent: "bg-[--accent]/70",
    success: "bg-emerald-500/70",
    error: "bg-rose-500/70",
    cyan: "bg-cyan-500/70"
  };
  const dotByTone: Record<string, string> = {
    accent: "bg-[--accent]",
    success: "bg-emerald-500",
    error: "bg-rose-500",
    cyan: "bg-cyan-500"
  };
  return (
    <span className={cn("relative inline-flex h-2 w-2", className)}>
      <span
        aria-hidden
        className={cn(
          "absolute inline-flex h-full w-full animate-ping rounded-full",
          ringByTone[tone]
        )}
      />
      <span
        className={cn(
          "relative inline-flex h-2 w-2 rounded-full",
          dotByTone[tone]
        )}
      />
    </span>
  );
}

/**
 * Sticky chrome + 6-section sidebar nav matching the mockups, in the
 * editorial register matching the rest of the admin:
 *   - Header reads as a chapter opener: mono "// REGISTRATION · season"
 *     overline + display headline form name + chapter rule
 *   - Hairline progress meter showing X/6 sections done
 *   - Sidebar active state uses layoutId-animated accent rail (slides
 *     between sections as you click)
 *   - Section index badges use mono `01 02 03` numbering
 *
 * API kept stable (formId, formName, seasonName, seasonId, orgName,
 * active, sections, submissionsCount, draft, searchParams, children)
 * so the parent page doesn't have to change.
 */
export function RegistrationSetupShell({
  formId,
  formName,
  seasonName,
  seasonId,
  orgName,
  active,
  sections,
  submissionsCount,
  draft,
  searchParams,
  children
}: {
  formId: string;
  formName: string;
  seasonName: string | null;
  /**
   * When set, enables the "Live wizard" link. The link opens
   * player-web in a new tab — admins see the funnel as a fresh
   * visitor and may be prompted to sign in. The expected behaviour
   * is documented in the link's title-tooltip (audit §1.4 / P3-4).
   */
  seasonId: string | null;
  orgName: string;
  active: SectionKey;
  sections: SectionState[];
  submissionsCount: number;
  draft: boolean;
  searchParams: Record<string, string | undefined>;
  children: ReactNode;
}) {
  function hrefFor(key: SectionKey): string {
    const sp = new URLSearchParams();
    sp.set("section", key);
    for (const [k, v] of Object.entries(searchParams)) {
      if (k !== "section" && v) sp.set(k, v);
    }
    return `/forms/${formId}?${sp.toString()}`;
  }

  const doneCount = sections.filter((s) => s.status === "done").length;
  const totalSetupSections = SECTION_DEFS.length;
  const progressPct = Math.round((doneCount / totalSetupSections) * 100);

  return (
    <div className="space-y-7">
      {/* CHAPTER HEADER — editorial mono eyebrow + display headline */}
      <header className="relative pb-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 flex-1">
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-[0.22em] text-fg-muted"
            >
              <LiveDot tone={draft ? "accent" : "success"} />
              <span className="text-fg/80">// registration</span>
              <span className="text-fg-subtle">·</span>
              <span>{seasonName ?? "season pending"}</span>
              <span className="text-fg-subtle">·</span>
              <span>{orgName}</span>
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.55,
                delay: 0.05,
                ease: [0.22, 1, 0.36, 1]
              }}
              className="mt-3 max-w-[28ch] text-balance font-sans text-[clamp(28px,3.6vw,44px)] font-semibold leading-[0.98] tracking-tighter text-fg"
            >
              {formName || "New registration"}
            </motion.h1>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.5,
              delay: 0.12,
              ease: [0.22, 1, 0.36, 1]
            }}
            className="flex items-center gap-2"
          >
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.22em]",
                draft
                  ? "bg-amber-500/10 text-amber-700"
                  : "bg-emerald-500/10 text-emerald-700"
              )}
            >
              {draft ? <LiveDot tone="accent" /> : <LiveDot tone="success" />}
              {draft ? "draft" : "live"}
            </span>
            <Link
              href={`/forms/${formId}?section=review`}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-bg-subtle px-3 font-mono text-[10px] uppercase tracking-[0.18em] text-fg-muted transition-colors hover:border-fg-muted hover:text-fg"
            >
              <Eye className="h-3.5 w-3.5" strokeWidth={1.75} />
              Preview
            </Link>
            {seasonId ? (
              <a
                // Absolute URL into player-web. A relative href stayed
                // on sp-superadmin.vercel.app where the funnel doesn't
                // render — BUG-042 (Live wizard hits the wrong app).
                href={`${process.env.NEXT_PUBLIC_PLAYER_WEB_URL ?? "https://sp-player-red.vercel.app"}/register/${seasonId}`}
                target="_blank"
                rel="noopener noreferrer"
                title="Opens player-web in a new tab — you'll see the funnel as a fresh visitor, so expect a sign-in prompt."
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-blue-500/40 bg-blue-500/10 px-3 font-mono text-[10px] uppercase tracking-[0.18em] text-blue-700 transition-colors hover:bg-blue-500/15"
              >
                <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} />
                Live wizard
              </a>
            ) : null}
            <Link
              href={`/forms/${formId}?section=review`}
              className="group inline-flex h-8 items-center gap-1.5 rounded-full bg-fg px-4 font-mono text-[10px] uppercase tracking-[0.18em] text-bg transition-transform hover:scale-[1.03]"
            >
              <Send className="h-3.5 w-3.5" strokeWidth={2} />
              Publish
            </Link>
            <button
              type="button"
              aria-label="More"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-fg-muted transition-colors hover:border-fg-muted hover:text-fg"
            >
              <MoreHorizontal className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </motion.div>
        </div>

        {/* Progress meter — animated fill showing X/6 setup sections done */}
        <div className="mt-7 flex items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-fg-muted">
            setup · {doneCount}/{totalSetupSections}
          </span>
          <div className="relative h-px flex-1 overflow-hidden bg-border">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-y-0 left-0 bg-[--accent]"
            />
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-fg-muted tabular-nums">
            {progressPct}%
          </span>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[268px_minmax(0,1fr)]">
        <aside className="rounded-xl border border-border bg-bg-subtle p-3">
          <div className="px-2 pb-3">
            <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-fg-subtle">
              <span className="text-fg-subtle/70">//</span>
              <span>registration · setup</span>
            </p>
            <p className="mt-1 text-[12px] text-fg-muted">
              All sections save as draft
            </p>
          </div>
          <ul className="space-y-px">
            {SECTION_DEFS.map((d) => {
              const state =
                sections.find((s) => s.key === d.key) ??
                ({ status: "idle" } as Pick<
                  SectionState,
                  "status" | "issueCount"
                >);
              const isActive = active === d.key;
              return (
                <li key={d.key}>
                  <Link
                    href={hrefFor(d.key)}
                    className={cn(
                      "group relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors",
                      isActive
                        ? "text-fg"
                        : "text-fg-muted hover:bg-surface-2 hover:text-fg"
                    )}
                  >
                    {isActive ? (
                      <motion.span
                        layoutId="form-setup-active"
                        aria-hidden
                        className="absolute inset-0 rounded-md bg-[--accent]/10 ring-1 ring-inset ring-[--accent]/20"
                        transition={{
                          type: "spring",
                          stiffness: 380,
                          damping: 32
                        }}
                      />
                    ) : null}
                    {isActive ? (
                      <motion.span
                        layoutId="form-setup-active-bar"
                        aria-hidden
                        className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-[--accent]"
                        transition={{
                          type: "spring",
                          stiffness: 380,
                          damping: 32
                        }}
                      />
                    ) : null}
                    <span
                      className={cn(
                        "relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px] tabular-nums",
                        state.status === "done"
                          ? "bg-emerald-500/15 text-emerald-700"
                          : state.status === "issue"
                            ? "bg-amber-500/20 text-amber-700"
                            : isActive
                              ? "bg-[--accent]/15 text-[--accent]"
                              : "bg-fg-muted/15 text-fg-muted"
                      )}
                    >
                      {state.status === "done" ? (
                        <Check className="h-3 w-3" strokeWidth={2.5} />
                      ) : state.status === "issue" ? (
                        <AlertCircle className="h-3 w-3" strokeWidth={2.5} />
                      ) : (
                        <span>{String(d.index).padStart(2, "0")}</span>
                      )}
                    </span>
                    <span className="relative flex-1 text-[13px]">
                      {d.label}
                    </span>
                    {state.status === "done" ? (
                      <span className="relative rounded-full bg-emerald-500/15 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-emerald-700">
                        done
                      </span>
                    ) : state.status === "issue" ? (
                      <span className="relative rounded-full bg-amber-500/20 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-amber-700">
                        {(state.issueCount ?? 1) > 1
                          ? `${state.issueCount} issues`
                          : "1 issue"}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="mt-4 border-t border-border pt-3">
            <Link
              href={hrefFor("submissions")}
              className={cn(
                "group relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors",
                active === "submissions"
                  ? "text-fg"
                  : "text-fg-muted hover:bg-surface-2 hover:text-fg"
              )}
            >
              {active === "submissions" ? (
                <>
                  <motion.span
                    layoutId="form-setup-active"
                    aria-hidden
                    className="absolute inset-0 rounded-md bg-[--accent]/10 ring-1 ring-inset ring-[--accent]/20"
                    transition={{
                      type: "spring",
                      stiffness: 380,
                      damping: 32
                    }}
                  />
                  <motion.span
                    layoutId="form-setup-active-bar"
                    aria-hidden
                    className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-[--accent]"
                    transition={{
                      type: "spring",
                      stiffness: 380,
                      damping: 32
                    }}
                  />
                </>
              ) : null}
              <span className="relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-fg-muted/15 font-mono text-[10px] tabular-nums text-fg-muted">
                {submissionsCount}
              </span>
              <span className="relative flex-1 text-[13px]">Submissions</span>
            </Link>
          </div>
        </aside>

        <main className="min-w-0">
          <motion.div
            key={active}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
}
