import Link from "next/link";
import {
  Check,
  AlertCircle,
  ExternalLink,
  Eye,
  MoreHorizontal
} from "lucide-react";
import { cn } from "@/lib/utils";
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

const SECTION_DEFS: { key: Exclude<SectionKey, "submissions">; index: number; label: string }[] = [
  { key: "season", index: 1, label: "Season setup" },
  { key: "pricing", index: 2, label: "Pricing" },
  { key: "divisions", index: 3, label: "Divisions" },
  { key: "form_builder", index: 4, label: "Form builder" },
  { key: "email_templates", index: 5, label: "Email templates" },
  { key: "review", index: 6, label: "Review & publish" }
];

/**
 * Sticky chrome + 6-section sidebar nav matching the mockups.
 *
 * Section status is computed by the parent page (count of pricing tiers,
 * presence of seasonId, divisions without an assigned tier, etc.) and
 * passed in as `sections`. The "Submissions" row is rendered separately
 * with its total count.
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
  /** When set, enables the "Preview registration funnel" link */
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

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[20px] font-semibold tracking-tight text-fg">
            {formName || "New registration"}
          </p>
          <p className="mt-0.5 font-mono text-[11px] uppercase tracking-widest text-fg-muted">
            {seasonName ? `${seasonName} · ` : ""}
            {orgName}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "rounded-full px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest",
              draft
                ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            )}
          >
            {draft ? "Draft" : "Live"}
          </span>
          <Link
            href={`/forms/${formId}?section=review`}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-3 font-mono text-[10px] uppercase tracking-widest text-fg hover:border-fg-muted"
          >
            <Eye className="h-3.5 w-3.5" strokeWidth={1.75} />
            Preview form
          </Link>
          {seasonId ? (
            <Link
              href={`/registration/${seasonId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-blue-500/40 bg-blue-500/10 px-3 font-mono text-[10px] uppercase tracking-widest text-blue-700 hover:bg-blue-500/15 dark:text-blue-300"
            >
              <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} />
              Live wizard
            </Link>
          ) : null}
          <Link
            href={`/forms/${formId}?section=review`}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-fg px-3 font-mono text-[10px] uppercase tracking-widest text-bg hover:bg-fg-muted"
          >
            Publish
          </Link>
          <button
            type="button"
            aria-label="More"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-fg-muted hover:border-fg-muted hover:text-fg"
          >
            <MoreHorizontal className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="rounded-xl border border-border bg-bg-subtle p-3">
          <div className="px-2 pb-3">
            <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
              // Registration setup
            </p>
            <p className="mt-1 text-[12px] text-fg-muted">
              All sections save as draft
            </p>
          </div>
          <ul className="space-y-0.5">
            {SECTION_DEFS.map((d) => {
              const state =
                sections.find((s) => s.key === d.key) ??
                ({ status: "idle" } as Pick<SectionState, "status" | "issueCount">);
              const isActive = active === d.key;
              return (
                <li key={d.key}>
                  <Link
                    href={hrefFor(d.key)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors",
                      isActive
                        ? "bg-surface-2 text-fg"
                        : "text-fg-muted hover:bg-surface-2 hover:text-fg"
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px]",
                        state.status === "done"
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                          : state.status === "issue"
                            ? "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                            : "bg-fg-muted/15 text-fg-muted"
                      )}
                    >
                      {state.status === "done" ? (
                        <Check className="h-3 w-3" strokeWidth={2.5} />
                      ) : state.status === "issue" ? (
                        <AlertCircle className="h-3 w-3" strokeWidth={2.5} />
                      ) : (
                        <span className="tabular-nums">{d.index}</span>
                      )}
                    </span>
                    <span className="flex-1 text-[13px]">{d.label}</span>
                    {state.status === "done" ? (
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
                        done
                      </span>
                    ) : state.status === "issue" ? (
                      <span className="rounded-full bg-amber-500/20 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-amber-700 dark:text-amber-300">
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
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors",
                active === "submissions"
                  ? "bg-surface-2 text-fg"
                  : "text-fg-muted hover:bg-surface-2 hover:text-fg"
              )}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-fg-muted/15 font-mono text-[10px] tabular-nums text-fg-muted">
                {submissionsCount}
              </span>
              <span className="flex-1 text-[13px]">Submissions</span>
            </Link>
          </div>
        </aside>

        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
