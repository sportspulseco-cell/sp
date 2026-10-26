"use client";

import { PointsRuleFields, pointsRuleForm } from "../../divisions/points-rule-fields";
import { SKILL_LEVEL_LABELS, SKILL_LEVELS } from "@sportspulse/kernel";
import { ChevronDown, ChevronUp, GripVertical, Trash2 } from "lucide-react";
import { Badge, Input, Select, Button } from "@sportspulse/ui";
import { cn } from "@sportspulse/ui";
import {
  NEW_REGION,
  TIEBREAKER_LABELS,
  type BodyChecking,
  type BracketType,
  type ClockType,
  type DivisionDraft,
  type Gender,
  type HomeIceRule,
  type OvertimeRule,
  type SeriesFormat,
  type Tier,
  type TiebreakerCode
} from "../types";
import { Field } from "./league-step";

// Same A–D labels players pick their level from (REG-21), plus Premier.
export const TIERS: { value: NonNullable<Tier>; label: string }[] = [
  ...SKILL_LEVELS.map((value) => ({ value, label: SKILL_LEVEL_LABELS[value] })),
  { value: "Premier", label: "Premier" }
];

export const GENDERS: { value: Gender; label: string }[] = [
  { value: "open", label: "Open (any)" },
  { value: "male", label: "Men" },
  { value: "female", label: "Women" },
  { value: "mixed", label: "Mixed" }
];

const CLOCK_TYPES: { value: ClockType; label: string }[] = [
  { value: "stopped", label: "Stopped clock" },
  { value: "running", label: "Running clock" }
];

const BODY_CHECKING: { value: BodyChecking; label: string }[] = [
  { value: "permitted", label: "Permitted" },
  { value: "not_permitted_penalty", label: "Not permitted, penalty" },
  { value: "not_permitted_no_penalty", label: "Not permitted, no penalty" }
];

const OVERTIME_RULES: { value: OvertimeRule; label: string }[] = [
  { value: "none", label: "None: score is final" },
  { value: "sudden_death", label: "Sudden death (first goal wins)" },
  { value: "shootout", label: "Penalty shootout (skip OT)" },
  { value: "5_min", label: "5 min overtime period" },
  { value: "10_min", label: "10 min overtime period" }
];

const SERIES: { value: SeriesFormat; label: string; description: string }[] = [
  {
    value: "best_of_1",
    label: "Single game (best of 1)",
    description:
      "One game determines the winner. Quick-fire single elimination."
  },
  {
    value: "best_of_3",
    label: "Best of 3: first to win 2 games",
    description:
      "Max 3 games per matchup. Catches a single-game fluke. Requires roughly double the ice time of single-game format. Most common in rec leagues."
  },
  {
    value: "best_of_5",
    label: "Best of 5: first to win 3 games",
    description:
      "Max 5 games. Produces the most meaningful result. Used in competitive A divisions and finals. Significant ice-time commitment."
  },
  {
    value: "best_of_7",
    label: "Best of 7: first to win 4 games",
    description:
      "Max 7 games per round. NHL-style. Rare in rec leagues but available for competitive top divisions with long seasons."
  }
];

const BRACKETS: { value: BracketType; label: string; description: string }[] = [
  {
    value: "single_elim",
    label: "Single elimination",
    description: "One loss and you're out. Fast and decisive."
  },
  {
    value: "double_elim",
    label: "Double elimination",
    description:
      "Teams get a second chance via a loser bracket. More games but rewards consistency."
  },
  {
    value: "round_robin",
    label: "Round-robin",
    description: "Every team plays every other. Twice the games."
  }
];

const HOME_ICE: { value: HomeIceRule; label: string; description: string }[] = [
  {
    value: "higher_seed_first",
    label: "Higher seed hosts first game(s)",
    description:
      "Determines which team hosts in a series. Higher-seed-hosting gives 1 and 3 the most common option in seeded leagues."
  },
  {
    value: "alternating",
    label: "Alternating",
    description: "Home/away alternates each game in the series."
  },
  {
    value: "neutral",
    label: "Neutral site",
    description: "All games at a neutral location."
  }
];

export function DivisionCard({
  index,
  total,
  division,
  regions,
  expanded,
  onToggle,
  onPatch,
  onRemove
}: {
  index: number;
  total: number;
  division: DivisionDraft;
  /** Active regions of the selected org; the card can also add one inline. */
  regions: Array<{ id: string; name: string }>;
  expanded: boolean;
  onToggle: () => void;
  onPatch: (patch: Partial<DivisionDraft>) => void;
  onRemove: () => void;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface-1">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToggle}
            className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-bg-subtle"
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
          <p className="text-[14px] font-semibold tracking-tight text-fg">
            Division {index + 1}
            {division.name ? `: ${division.name}` : ""}
          </p>
          <Badge mono>{division.tier ?? "—"}</Badge>
          <Badge mono tone="info">
            {division.genderEligibility}
          </Badge>
        </div>
        {total > 1 ? (
          <Button
            type="button"
            onClick={onRemove}
            variant="destructive" size="sm" className="gap-1.5"
          >
            <Trash2 className="h-3 w-3" strokeWidth={2} />
            Remove
          </Button>
        ) : null}
      </header>

      {expanded ? (
        <div className="space-y-6 px-5 py-5">
          <IdentityBlock division={division} regions={regions} onPatch={onPatch} />
          <GameRulesBlock division={division} onPatch={onPatch} />
          <PointsRuleFields
            value={division.points ?? pointsRuleForm(null)}
            onChange={(points) => onPatch({ points })}
          />
          <TiebreakersBlock division={division} onPatch={onPatch} />
          <PostSeasonBlock division={division} onPatch={onPatch} />
        </div>
      ) : null}
    </section>
  );
}

/* ============================== Identity ============================ */

function IdentityBlock({
  division,
  regions,
  onPatch
}: {
  division: DivisionDraft;
  regions: Array<{ id: string; name: string }>;
  onPatch: (patch: Partial<DivisionDraft>) => void;
}) {
  const regionLabel =
    division.regionId === NEW_REGION
      ? division.regionName
      : regions.find((r) => r.id === division.regionId)?.name;
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Division name" required>
        <Input
          type="text"
          value={division.name}
          onChange={(e) => onPatch({ name: e.target.value.slice(0, 120) })}
          maxLength={120}
          placeholder="e.g. AHL"
          required
        />
      </Field>

      <Field
        label="Skill / tier"
        required
        hint="Self-reported skill bucket. Used to set skater player registrations and filter free agent picks searched into the same division."
      >
        <Select
          value={division.tier ?? ""}
          onChange={(e) => onPatch({ tier: (e.target.value || null) as Tier })}
        >
          {TIERS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Region"
        hint={
          regions.length === 0 && division.regionId !== NEW_REGION
            ? "Optional tier between the season and its divisions (e.g. Massachusetts, New Hampshire). This organization has none yet; add one here."
            : regionLabel
              ? `Teams in this division play in ${regionLabel}.`
              : "Optional tier between the season and its divisions."
        }
      >
        <Select
          value={division.regionId ?? ""}
          onChange={(e) =>
            onPatch({
              regionId: e.target.value || null,
              regionName: e.target.value === NEW_REGION ? division.regionName : ""
            })
          }
        >
          <option value="">No region</option>
          {regions.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
          <option value={NEW_REGION}>+ New region…</option>
        </Select>
        {division.regionId === NEW_REGION ? (
          <Input
            type="text"
            value={division.regionName}
            onChange={(e) => onPatch({ regionName: e.target.value.slice(0, 120) })}
            maxLength={120}
            placeholder="Region name, e.g. New Hampshire"
            aria-label="New region name"
            className="mt-2"
            required
          />
        ) : null}
      </Field>

      <Field
        label="Gender eligibility"
        required
        hint="Who is eligible to register. Validated at registration and roster add."
      >
        <Select
          value={division.genderEligibility}
          onChange={(e) =>
            onPatch({ genderEligibility: e.target.value as Gender })
          }
        >
          {GENDERS.map((g) => (
            <option key={g.value} value={g.value}>
              {g.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Min age"
        hint="Youngest player allowed (years). Leave blank for no minimum."
      >
        <Input
          type="number"
          min={0}
          max={120}
          value={division.ageRangeMin ?? ""}
          onChange={(e) =>
            onPatch({
              ageRangeMin:
                e.target.value === "" ? null : parseInt(e.target.value, 10)
            })
          }
          placeholder="e.g. 18"
        />
      </Field>

      <Field
        label="Max age"
        hint="Oldest player allowed (years). Leave blank for no maximum."
      >
        <Input
          type="number"
          min={0}
          max={120}
          value={division.ageRangeMax ?? ""}
          onChange={(e) =>
            onPatch({
              ageRangeMax:
                e.target.value === "" ? null : parseInt(e.target.value, 10)
            })
          }
          placeholder="e.g. 99"
        />
      </Field>

      <Field
        label="Age group label"
        hint='Friendly label shown on registration pages, e.g. "18+ adult", "U15", "Open age".'
      >
        <Input
          type="text"
          value={division.ageGroupLabel}
          onChange={(e) =>
            onPatch({ ageGroupLabel: e.target.value.slice(0, 60) })
          }
          placeholder="e.g. 18+ adult"
        />
      </Field>

      <Field
        label="Max teams"
        required
        hint="Hard cap on teams accepted into this division. Once reached, new team registrations are halted. Should be at least 4 to seed a tier."
      >
        <Input
          type="number"
          min={2}
          max={64}
          value={division.maxTeams}
          onChange={(e) =>
            onPatch({ maxTeams: Math.max(2, parseInt(e.target.value) || 2) })
          }
          required
        />
      </Field>

      <Field
        label="Min skaters to start"
        hint="If a team can't ice this many skaters at puck drop, the game is forfeited."
      >
        <Input
          type="number"
          min={1}
          max={20}
          value={division.gameRules.minStartersToStart}
          onChange={(e) =>
            onPatch({
              gameRules: {
                ...division.gameRules,
                minStartersToStart: Math.max(1, parseInt(e.target.value) || 1)
              }
            })
          }
        />
      </Field>
    </div>
  );
}

/* ============================ Game rules ============================ */

function GameRulesBlock({
  division,
  onPatch
}: {
  division: DivisionDraft;
  onPatch: (patch: Partial<DivisionDraft>) => void;
}) {
  const r = division.gameRules;
  return (
    <div className="space-y-4 border-t border-border pt-4">
      <p className="text-[13px] font-semibold tracking-tight text-fg">
        Game rules
      </p>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <Field
          label="Number of periods"
          required
          hint="How many periods in a regulation game. Hockey standard is 3, lacrosse normally has quarters."
        >
          <Input
            type="number"
            min={1}
            max={6}
            value={r.numberOfPeriods}
            onChange={(e) =>
              onPatch({
                gameRules: {
                  ...r,
                  numberOfPeriods: Math.max(1, parseInt(e.target.value) || 3)
                }
              })
            }
          />
        </Field>

        <Field
          label="Period length (min)"
          required
          hint="Length of each period in minutes. Affects total game duration and time-on-ice tracking. Standard hockey is 20 minutes."
        >
          <Input
            type="number"
            min={1}
            max={60}
            value={r.periodLengthMin}
            onChange={(e) =>
              onPatch({
                gameRules: {
                  ...r,
                  periodLengthMin: Math.max(1, parseInt(e.target.value) || 20)
                }
              })
            }
          />
        </Field>

        <Field
          label="Clock type"
          required
          hint="Stopped time pauses the clock on whistles. Official + league standard. Running time never stops, faster but used in casual leagues to keep things tight."
        >
          <Select
            value={r.clockType}
            onChange={(e) =>
              onPatch({
                gameRules: { ...r, clockType: e.target.value as ClockType }
              })
            }
          >
            {CLOCK_TYPES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Overtime"
          required
          hint="What happens if the game is tied after regulation. Sudden death = first goal wins. Shootout skips OT and goes straight to penalty shots."
        >
          <Select
            value={r.overtimeRule}
            onChange={(e) =>
              onPatch({
                gameRules: { ...r, overtimeRule: e.target.value as OvertimeRule }
              })
            }
          >
            {OVERTIME_RULES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Body checking"
          required
          hint="Default penalty handling for body contact. Drives referee guidance and roster eligibility."
        >
          <Select
            value={r.bodyChecking}
            onChange={(e) =>
              onPatch({
                gameRules: { ...r, bodyChecking: e.target.value as BodyChecking }
              })
            }
          >
            {BODY_CHECKING.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Max guest players per game"
          hint="Subs / backups borrowed from another team for a single game. Capped per game so teams can't stack with ringers."
        >
          <Input
            type="number"
            min={0}
            max={50}
            value={r.maxGuestPlayersPerGame}
            onChange={(e) =>
              onPatch({
                gameRules: {
                  ...r,
                  maxGuestPlayersPerGame: Math.max(
                    0,
                    parseInt(e.target.value) || 4
                  )
                }
              })
            }
          />
        </Field>

        <Field
          label="Max roster size"
          hint="Cap on permanent roster size for the season. Hockey leagues typically allow 18–25; lacrosse can go higher."
        >
          <Input
            type="number"
            min={1}
            max={60}
            value={r.maxRosterSize}
            onChange={(e) =>
              onPatch({
                gameRules: {
                  ...r,
                  maxRosterSize: Math.max(1, parseInt(e.target.value) || 20)
                }
              })
            }
          />
        </Field>
      </div>
    </div>
  );
}

/* =========================== Tiebreakers =========================== */

function TiebreakersBlock({
  division,
  onPatch
}: {
  division: DivisionDraft;
  onPatch: (patch: Partial<DivisionDraft>) => void;
}) {
  function move(idx: number, dir: -1 | 1) {
    const next = [...division.tiebreakers];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap]!, next[idx]!];
    onPatch({ tiebreakers: next });
  }
  return (
    <div className="space-y-3 border-t border-border pt-4">
      <div>
        <p className="text-[13px] font-semibold tracking-tight text-fg">
          Tiebreaker rules
          <span className="ml-2 rounded-full bg-[var(--tint-rose-bg)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-[var(--tint-rose-fg)]">
            Required
          </span>
        </p>
        <p className="mt-1 text-[12px] text-fg-muted">
          Applied in order from top to bottom when two teams have equal points
          in the standings. Reorder using the arrows.
        </p>
      </div>
      <ol className="space-y-1">
        {division.tiebreakers.map((code, i) => (
          <li
            key={code}
            className="flex items-center gap-3 rounded-md border border-border bg-bg-subtle px-3 py-2"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent font-mono text-[11px] font-semibold text-bg">
              {i + 1}
            </span>
            <GripVertical className="h-4 w-4 text-fg-muted" strokeWidth={1.5} />
            <span className="flex-1 text-[12px] text-fg">
              {TIEBREAKER_LABELS[code]}
            </span>
            <button
              type="button"
              onClick={() => move(i, -1)}
              disabled={i === 0}
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded border border-border text-fg-muted disabled:opacity-40",
                i === 0 ? "cursor-not-allowed" : "hover:border-fg-muted"
              )}
              aria-label="Move up"
            >
              <ChevronUp className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => move(i, 1)}
              disabled={i === division.tiebreakers.length - 1}
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded border border-border text-fg-muted disabled:opacity-40",
                i === division.tiebreakers.length - 1
                  ? "cursor-not-allowed"
                  : "hover:border-fg-muted"
              )}
              aria-label="Move down"
            >
              <ChevronDown className="h-3 w-3" />
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* =========================== Post-season =========================== */

function PostSeasonBlock({
  division,
  onPatch
}: {
  division: DivisionDraft;
  onPatch: (patch: Partial<DivisionDraft>) => void;
}) {
  const p = division.playoffConfig;
  return (
    <div className="space-y-4 border-t border-border pt-4">
      <div>
        <p className="text-[13px] font-semibold tracking-tight text-fg">
          Post-season
          <span className="ml-2 rounded-full bg-[var(--tint-rose-bg)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-[var(--tint-rose-fg)]">
            Required
          </span>
        </p>
        <p className="mt-1 text-[12px] text-fg-muted">
          Post-season / playoffs configuration. Determines when and how teams
          meet in tournament-style elimination.
        </p>
      </div>

      <label className="flex items-center gap-3 rounded-md border border-border bg-bg-subtle p-3">
        <input
          type="checkbox"
          checked={p.enabled}
          onChange={(e) =>
            onPatch({ playoffConfig: { ...p, enabled: e.target.checked } })
          }
          className="h-4 w-4 rounded border-border"
        />
        <span className="text-[13px] text-fg">
          Playoffs enabled for this division
        </span>
      </label>

      {p.enabled ? (
        <>
          <div className="grid gap-5 sm:grid-cols-3">
            <Field
              label="Playoff spots"
              required
              hint="How many teams qualify from the regular-season standings. Top 4 = only top 4 teams make playoffs. Top 8 = top 8 teams advance."
            >
              <Input
                type="number"
                min={2}
                max={32}
                value={p.playoffSpots}
                onChange={(e) =>
                  onPatch({
                    playoffConfig: {
                      ...p,
                      playoffSpots: Math.max(2, parseInt(e.target.value) || 8)
                    }
                  })
                }
              />
            </Field>

            <Field
              label="Playoff start date"
              required
              hint="When the first playoff game can be played. Must be after the regular-season finale."
            >
              <Input
                type="date"
                value={p.startDate}
                onChange={(e) =>
                  onPatch({ playoffConfig: { ...p, startDate: e.target.value } })
                }
              />
            </Field>

            <Field
              label="Playoff end date"
              required
              hint="Championship game must be played on or before this date. Must not exceed the season end date."
            >
              <Input
                type="date"
                value={p.endDate}
                onChange={(e) =>
                  onPatch({ playoffConfig: { ...p, endDate: e.target.value } })
                }
                min={p.startDate || undefined}
              />
            </Field>
          </div>

          <div>
            <Field
              label="Playoff type (series format)"
              required
            >
              <ul className="mt-2 space-y-2">
                {SERIES.map((s) => {
                  const selected = p.seriesFormat === s.value;
                  return (
                    <li key={s.value}>
                      <button
                        type="button"
                        onClick={() =>
                          onPatch({
                            playoffConfig: { ...p, seriesFormat: s.value }
                          })
                        }
                        className={cn(
                          "flex w-full items-start gap-3 rounded-md border p-3 text-left transition-colors",
                          selected
                            ? "border-accent bg-accent/5 ring-2 ring-accent/30"
                            : "border-border hover:border-fg-muted"
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
                            selected ? "border-accent bg-accent" : "border-border"
                          )}
                        >
                          {selected ? (
                            <span className="h-2 w-2 rounded-full bg-bg" />
                          ) : null}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-[13px] font-medium text-fg">
                            {s.label}
                          </span>
                          <span className="mt-0.5 block text-[11px] text-fg-muted">
                            {s.description}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Field>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Bracket type"
              hint={
                BRACKETS.find((b) => b.value === p.bracketType)?.description ?? ""
              }
            >
              <Select
                value={p.bracketType}
                onChange={(e) =>
                  onPatch({
                    playoffConfig: {
                      ...p,
                      bracketType: e.target.value as BracketType
                    }
                  })
                }
              >
                {BRACKETS.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Home ice"
              hint={
                HOME_ICE.find((h) => h.value === p.homeIceRule)?.description ?? ""
              }
            >
              <Select
                value={p.homeIceRule}
                onChange={(e) =>
                  onPatch({
                    playoffConfig: {
                      ...p,
                      homeIceRule: e.target.value as HomeIceRule
                    }
                  })
                }
              >
                {HOME_ICE.map((h) => (
                  <option key={h.value} value={h.value}>
                    {h.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </>
      ) : null}
    </div>
  );
}
