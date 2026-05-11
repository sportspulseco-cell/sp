"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarRange,
  CheckCircle2,
  Circle,
  CircleDollarSign,
  ClipboardList,
  ExternalLink,
  Eye,
  FileText,
  Mail,
  Layers,
  Send,
  AlertCircle,
  type LucideIcon
} from "lucide-react";
import { Badge, statusTone } from "@sportspulse/ui";
import { cn } from "@/lib/utils";
import type { Division, Season } from "@/lib/api/types";
import type { EmailTemplate, PricingTier } from "@/lib/api/sdk";
import { SeasonDetailsTab } from "./tabs/season-details-tab";
import { PricingTab } from "./tabs/pricing-tab";
import { DivisionsTab } from "./tabs/divisions-tab";
import { FormBuilderTab } from "./tabs/form-builder-tab";
import { EmailTemplatesTab } from "./tabs/email-templates-tab";
import { ReviewPublishTab } from "./tabs/review-publish-tab";

type CompletionState = "done" | "warning" | "idle" | "active";

interface TabDef {
  id: string;
  index: number;
  title: string;
  subtitle: string;
  icon: LucideIcon;
}

const TABS: TabDef[] = [
  { id: "season", index: 1, title: "Season Setup", subtitle: "Window, type, rollover", icon: CalendarRange },
  { id: "pricing", index: 2, title: "Pricing", subtitle: "Tiers + payment plans", icon: CircleDollarSign },
  { id: "divisions", index: 3, title: "Divisions", subtitle: "Age + level constraints", icon: Layers },
  { id: "form", index: 4, title: "Form Builder", subtitle: "Custom questions + waivers", icon: FileText },
  { id: "email", index: 5, title: "Email Templates", subtitle: "Per event type", icon: Mail },
  { id: "publish", index: 6, title: "Review & Publish", subtitle: "Validation + go-live", icon: Send }
];

type AvailableSeason = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: string;
};

export function SeasonSetupShell({
  season,
  initialPricingTiers,
  initialEmailTemplates,
  divisions,
  availableSeasons = []
}: {
  season: Season;
  initialPricingTiers: PricingTier[];
  initialEmailTemplates: EmailTemplate[];
  divisions: Division[];
  availableSeasons?: AvailableSeason[];
}) {
  const [active, setActive] = useState<string>("season");
  const [pricingTiers, setPricingTiers] =
    useState<PricingTier[]>(initialPricingTiers);
  const [emailTemplates, setEmailTemplates] =
    useState<EmailTemplate[]>(initialEmailTemplates);

  // Per-section completion logic — drives the sidebar indicators.
  const completion = useMemo<Record<string, CompletionState>>(
    () => ({
      season: season.name && season.startDate && season.endDate ? "done" : "warning",
      pricing:
        pricingTiers.length === 0
          ? "idle"
          : pricingTiers.some((t) => t.isActive)
            ? "done"
            : "warning",
      divisions: divisions.length > 0 ? "done" : "idle",
      form: "idle",
      email: emailTemplates.length === 0 ? "idle" : "done",
      publish: "idle"
    }),
    [season, pricingTiers, emailTemplates, divisions]
  );

  return (
    <div className="space-y-6">
      <TopBar
        season={season}
        availableSeasons={availableSeasons}
        onPublish={() => setActive("publish")}
      />
      <div className="grid gap-8 lg:grid-cols-[280px_minmax(0,1fr)]">
        <SidebarNav
          season={season}
          active={active}
          onSelect={setActive}
          completion={completion}
        />

      <main className="min-w-0">
        {active === "season" && <SeasonDetailsTab season={season} />}
        {active === "pricing" && (
          <PricingTab
            seasonId={season.id}
            divisions={divisions}
            tiers={pricingTiers}
            onTiersChange={setPricingTiers}
          />
        )}
        {active === "divisions" && (
          <DivisionsTab divisions={divisions} season={season} />
        )}
        {active === "form" && <FormBuilderTab seasonId={season.id} />}
        {active === "email" && (
          <EmailTemplatesTab
            seasonId={season.id}
            templates={emailTemplates}
            onTemplatesChange={setEmailTemplates}
          />
        )}
        {active === "publish" && (
          <ReviewPublishTab
            season={season}
            completion={completion}
            tiers={pricingTiers}
            templates={emailTemplates}
            onJump={setActive}
          />
        )}
        </main>
      </div>
    </div>
  );
}

function TopBar({
  season,
  availableSeasons,
  onPublish
}: {
  season: Season;
  availableSeasons: AvailableSeason[];
  onPublish: () => void;
}) {
  const router = useRouter();
  const previewHref = `/registration/${season.id}`;
  // Use a dropdown when at least 2 seasons exist in the same league;
  // single-season leagues just show the name (no point picking).
  const showPicker = availableSeasons.length > 1;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-1 px-5 py-3">
      <div className="flex items-center gap-3">
        {showPicker ? (
          <label className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
              Season
            </span>
            <select
              value={season.id}
              onChange={(e) => {
                const next = e.target.value;
                if (next && next !== season.id) {
                  router.push(`/registrations/seasons/${next}/setup`);
                }
              }}
              className="rounded-md border border-border bg-surface-1 px-2 py-1 text-[14px] font-semibold tracking-tight text-fg focus:border-accent focus:outline-none"
            >
              {availableSeasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="text-[16px] font-semibold tracking-tight text-fg">
            {season.name}
          </p>
        )}
        <Badge tone={statusTone(season.status)} mono>
          {season.status.replace(/_/g, " ")}
        </Badge>
      </div>
      <div className="flex items-center gap-2">
        <Link
          href="/registrations"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-3 font-mono text-[10px] uppercase tracking-widest text-fg-muted hover:border-fg-muted hover:text-fg"
          title="Submissions queue"
        >
          <ClipboardList className="h-3.5 w-3.5" strokeWidth={1.75} />
          Submissions
        </Link>
        <Link
          href={previewHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-3 font-mono text-[10px] uppercase tracking-widest text-fg-muted hover:border-fg-muted hover:text-fg"
          title="Open the public registration funnel in a new tab"
        >
          <Eye className="h-3.5 w-3.5" strokeWidth={1.75} />
          Preview form
          <ExternalLink className="h-3 w-3 opacity-60" strokeWidth={1.75} />
        </Link>
        <button
          type="button"
          onClick={onPublish}
          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-fg px-3 font-mono text-[10px] font-medium uppercase tracking-widest text-bg"
        >
          Publish
        </button>
      </div>
    </div>
  );
}

function SidebarNav({
  season,
  active,
  onSelect,
  completion
}: {
  season: Season;
  active: string;
  onSelect: (id: string) => void;
  completion: Record<string, CompletionState>;
}) {
  return (
    <aside className="rounded-xl border border-border bg-bg-subtle p-3">
      <div className="px-2 pb-3">
        <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          // Season Setup
        </p>
        <p className="mt-1 truncate text-[14px] font-semibold tracking-tight text-fg">
          {season.name}
        </p>
        <p className="font-mono text-[11px] text-fg-muted">{season.status}</p>
      </div>

      <ul className="space-y-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = active === tab.id;
          const state = completion[tab.id] ?? "idle";
          return (
            <li key={tab.id}>
              <button
                type="button"
                onClick={() => onSelect(tab.id)}
                className={cn(
                  "group flex w-full items-start gap-3 rounded-md border-l-2 px-3 py-2.5 text-left transition-colors",
                  isActive
                    ? "border-accent bg-surface-2"
                    : "border-transparent hover:bg-surface-2"
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px] font-mono",
                    state === "done"
                      ? "bg-success/15 text-success"
                      : state === "warning"
                        ? "bg-warning/15 text-warning"
                        : "bg-surface-2 text-fg-muted"
                  )}
                >
                  {state === "done" ? (
                    <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.25} />
                  ) : state === "warning" ? (
                    <AlertCircle className="h-3.5 w-3.5" strokeWidth={2.25} />
                  ) : (
                    <span className="tabular-nums">{tab.index}</span>
                  )}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-1.5">
                    <Icon
                      className={cn(
                        "h-3.5 w-3.5",
                        isActive ? "text-fg" : "text-fg-muted"
                      )}
                      strokeWidth={1.75}
                    />
                    <span
                      className={cn(
                        "text-[13px] font-medium",
                        isActive ? "text-fg" : "text-fg"
                      )}
                    >
                      {tab.title}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-fg-muted">
                    {tab.subtitle}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
