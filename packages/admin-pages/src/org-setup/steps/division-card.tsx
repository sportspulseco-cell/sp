"use client";

import { useState } from "react";
import { PlayoffSpotsFields } from "../../divisions/playoff-spots-fields";
import { PointsRuleFields, pointsRuleForm } from "../../divisions/points-rule-fields";
import {
  DEFAULT_DIVISION_GAME_RULES,
  DIVISION_NUMBER_LIMITS,
  divisionNumberProblem,
  type DivisionNumberKey
} from "@sportspulse/kernel";
import { ChevronDown, ChevronUp, Copy, GripVertical, Trash2 } from "lucide-react";
import { Badge, Input, Select, Button } from "@sportspulse/ui";
import { cn } from "@sportspulse/ui";
import {
  DEFAULT_MAX_TEAMS,
  NEW_REGION,
  TIEBREAKER_LABELS,
  divisionDraftProblem,
  type BodyChecking,
  type BracketType,
  type ClockType,
  type DivisionDraft,
  type Gender,
  type HomeIceRule,
  type OvertimeRule,
  type Tier
} from "../types";
import {
  BODY_CHECKING,
  BRACKETS,
  CLOCK_TYPES,
  GENDERS,
  HOME_ICE,
  OVERTIME_RULES,
  SERIES,
  TIERS,
  genderLabel,
  tierLabel
} from "../../divisions/option-labels";
import { Field } from "./league-step";

// The option labels live in ../../divisions/option-labels (a plain module
// the server-rendered detail pages can read too); kept here for callers.
export { BODY_CHECKING, BRACKETS, CLOCK_TYPES, GENDERS, HOME_ICE, OVERTIME_RULES, SERIES, TIERS };

export function DivisionCard({
  index,
  total,
  division,
  regions,
  expanded,
  onToggle,
  onPatch,
  onCopy,
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
  /** Same settings, no name, directly below this card. */
  onCopy: () => void;
  onRemove: () => void;
}) {
  // Publish waits while a card has a problem; a collapsed card says so here.
  const problem = divisionDraftProblem(division);
  return (
    <section className="rounded-xl border border-border bg-surface-1">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div className="flex flex-wrap items-center gap-3">
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
          <Badge mono>{tierLabel(division.tier)}</Badge>
          <Badge mono tone="info">
            {genderLabel(division.genderEligibility)}
          </Badge>
          {problem ? <Badge tone={division.name ? "danger" : "neutral"}>{division.name ? "Needs a fix" : "Name this division"}</Badge> : null}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            onClick={onCopy}
            variant="outline" size="sm" className="gap-1.5"
            aria-label={`Copy Division ${index + 1}`}
          >
            <Copy className="h-3 w-3" strokeWidth={2} />
            Copy
          </Button>
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
        </div>
      </header>
      {division.name && problem ? <p role="alert" className="px-5 pt-3 text-sm text-fg-danger">{problem}</p> : null}

      {expanded ? (
        <div className="space-y-6 px-5 py-5">
          <IdentityBlock division={division} regions={regions} onPatch={onPatch} />
          <details className="rounded-md border border-border p-4">
            <summary className="cursor-pointer text-sm font-medium">Game rules <span className="font-normal text-fg-muted">· {division.gameRules.numberOfPeriods} × {division.gameRules.periodLengthMin} min</span></summary>
            <div className="mt-4"><GameRulesBlock division={division} onPatch={onPatch}/></div>
          </details>
          <details className="rounded-md border border-border p-4"><summary className="cursor-pointer text-sm font-medium">Standings points & tie-breakers</summary><div className="mt-4 space-y-5">
            <PointsRuleFields value={division.points ?? pointsRuleForm(null)} onChange={points=>onPatch({points})}/>
            <TiebreakersBlock division={division} onPatch={onPatch}/>
          </div></details>
          <details className="rounded-md border border-border p-4"><summary className="cursor-pointer text-sm font-medium">Playoff rules <span className="font-normal text-fg-muted">· {division.playoffConfig.enabled?'Enabled':'Off'}</span></summary><div className="mt-4"><PostSeasonBlock division={division} onPatch={onPatch}/></div></details>
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
  // Hint stays until the copy is named.
  const copied = !!division.copiedFrom && division.name === "";
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      <Field
        label="Division name"
        required
        hint={copied ? `Copied from ${division.copiedFrom}; give it a name` : undefined}
      >
        <Input
          type="text"
          value={division.name}
          onChange={(e) => onPatch({ name: e.target.value.slice(0, 120) })}
          maxLength={120}
          placeholder="e.g. AHL"
          required
          // A fresh copy opens with the cursor in the one field it needs.
          autoFocus={copied}
        />
      </Field>

      <Field
        label="Skill / tier"
        required
        hint="Used to match players with divisions."
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
            ? "Choose an area, or add one for this organization."
            : regionLabel
              ? `Teams in this division play in ${regionLabel}.`
              : "Optional. The area where these teams play."
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
        hint="Who can register in this division."
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
        hint="Leave blank for no minimum."
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
        hint="Leave blank for no maximum."
        error={
          division.ageRangeMin !== null &&
          division.ageRangeMax !== null &&
          division.ageRangeMax < division.ageRangeMin
            ? "Max age must be at least min age."
            : undefined
        }
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

      <WholeNumberField
        name="maxTeams"
        label="Max teams"
        required
        hint="Maximum teams accepted into this division."
        value={division.maxTeams}
        defaultValue={DEFAULT_MAX_TEAMS}
        onCommit={(maxTeams) => onPatch({ maxTeams })}
      />

      <WholeNumberField
        name="minStartersToStart"
        label="Min skaters to start"
        hint="Required to start a game."
        value={division.gameRules.minStartersToStart}
        defaultValue={DEFAULT_DIVISION_GAME_RULES.minStartersToStart}
        onCommit={(minStartersToStart) =>
          onPatch({ gameRules: { ...division.gameRules, minStartersToStart } })
        }
      />
    </div>
  );
}

/* =========================== Whole numbers ========================== */

/**
 * A whole-number box that keeps what the admin typed, including nothing,
 * until they leave it. Committing on every keystroke snapped a cleared box
 * back to its default, so "17" typed over "20" became "2017" and Publish
 * sent it (PPHL, 4 Nov 2026). On blur the number is committed as typed;
 * when it is outside the kernel range, the kernel sentence shows under the
 * box and Publish waits. An empty box goes back to the default.
 */
function WholeNumberField({
  name,
  label,
  hint,
  required,
  value,
  defaultValue,
  onCommit
}: {
  name: DivisionNumberKey;
  label: string;
  hint?: string;
  required?: boolean;
  value: number;
  defaultValue: number;
  onCommit: (next: number) => void;
}) {
  const [text, setText] = useState(String(value));
  // The parent changed the value (a copy was made, a default restored): follow it.
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setText(String(value));
  }
  const limit = DIVISION_NUMBER_LIMITS[name];
  return (
    <Field label={label} required={required} hint={hint} error={divisionNumberProblem(name, value) ?? undefined}>
      <Input
        type="number"
        inputMode="numeric"
        step={1}
        min={limit.min}
        max={limit.max}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const typed = text.trim() === "" ? Number.NaN : Number(text);
          const next = Number.isNaN(typed) ? defaultValue : typed;
          setText(String(next));
          if (next !== value) onCommit(next);
        }}
      />
    </Field>
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
        <WholeNumberField
          name="numberOfPeriods"
          label="Number of periods"
          required
          hint="How many periods in a regulation game. Hockey standard is 3, lacrosse normally has quarters."
          value={r.numberOfPeriods}
          defaultValue={DEFAULT_DIVISION_GAME_RULES.numberOfPeriods}
          onCommit={(numberOfPeriods) => onPatch({ gameRules: { ...r, numberOfPeriods } })}
        />

        <WholeNumberField
          name="periodLengthMin"
          label="Period length (min)"
          required
          hint="Length of each period in minutes. Affects total game duration and time-on-ice tracking. Standard hockey is 20 minutes."
          value={r.periodLengthMin}
          defaultValue={DEFAULT_DIVISION_GAME_RULES.periodLengthMin}
          onCommit={(periodLengthMin) => onPatch({ gameRules: { ...r, periodLengthMin } })}
        />

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

        <WholeNumberField
          name="maxGuestPlayersPerGame"
          label="Max guest players per game"
          hint="Subs / backups borrowed from another team for a single game. Capped per game so teams can't stack with ringers."
          value={r.maxGuestPlayersPerGame}
          defaultValue={DEFAULT_DIVISION_GAME_RULES.maxGuestPlayersPerGame}
          onCommit={(maxGuestPlayersPerGame) => onPatch({ gameRules: { ...r, maxGuestPlayersPerGame } })}
        />

        <WholeNumberField
          name="maxRosterSize"
          label="Max roster size"
          hint="Cap on permanent roster size for the season. Hockey leagues typically allow 18–25; lacrosse can go higher."
          value={r.maxRosterSize}
          defaultValue={DEFAULT_DIVISION_GAME_RULES.maxRosterSize}
          onCommit={(maxRosterSize) => onPatch({ gameRules: { ...r, maxRosterSize } })}
        />
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
            <Field label="Playoff overtime" hint="Choose a playoff rule, or keep the regular-season rule.">
              <Select value={p.overtimeRule ?? ""} onChange={e=>onPatch({playoffConfig:{...p,overtimeRule:(e.target.value || null) as OvertimeRule | null}})}>
                <option value="">Same as regular season</option>
                {OVERTIME_RULES.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </Field>
            <PlayoffSpotsFields
              value={p.playoffSpots}
              onChange={(playoffSpots) => onPatch({ playoffConfig: { ...p, playoffSpots } })}
              max={32}
            />

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
