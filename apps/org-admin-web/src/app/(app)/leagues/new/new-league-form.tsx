"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button, Eyebrow, Field, Input, Select } from "@sportspulse/ui";
import { orgAdminLeagues } from "@/lib/api/browser-api";

type Format = "regular" | "tournament" | "pickup" | "friendly";

// Mirror of the platform `sports` seed (codes are case-sensitive and
// FK'd from `leagues.sport_code`). Free-text input here ships 500s
// because users type "hockey" / "Hockey" — see BUG-019. Keep in sync
// with `packages/db/migrations/*` and the SA create-league dialog
// until we expose a public `/sports` endpoint.
const SPORTS: Array<{ value: string; label: string }> = [
  { value: "HOCKEY_ICE", label: "Ice hockey" },
  { value: "HOCKEY_FIELD", label: "Field hockey" },
  { value: "SOCCER", label: "Soccer / football" },
  { value: "BASKETBALL", label: "Basketball" },
  { value: "BASEBALL", label: "Baseball" },
  { value: "CRICKET", label: "Cricket" },
  { value: "FUTSAL", label: "Futsal" },
  { value: "HANDBALL", label: "Handball" },
  { value: "LACROSSE", label: "Lacrosse" },
  { value: "NETBALL", label: "Netball" },
  { value: "RUGBY_LEAGUE", label: "Rugby league" },
  { value: "RUGBY_UNION", label: "Rugby union" },
  { value: "VOLLEYBALL", label: "Volleyball" },
  { value: "AFL", label: "Australian rules football" }
];

const FORMAT_OPTIONS: Array<{ value: Format; label: string; hint: string }> = [
  {
    value: "regular",
    label: "Regular season",
    hint: "Round-robin schedule capped by a roster lock."
  },
  {
    value: "tournament",
    label: "Tournament",
    hint: "Bracketed playoff format, single weekend / event."
  },
  {
    value: "pickup",
    label: "Pickup",
    hint: "Drop-in games with rolling registration."
  },
  {
    value: "friendly",
    label: "Friendly / exhibition",
    hint: "Loose schedule, no standings."
  }
];

export function NewLeagueForm({
  orgId,
  orgName
}: {
  orgId: string;
  orgName: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [sportCode, setSportCode] = useState("HOCKEY_ICE");
  const [format, setFormat] = useState<Format>("regular");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError("League name is required (min 2 characters).");
      return;
    }
    const code = sportCode.trim();
    if (code.length < 2) {
      setError("Pick a sport.");
      return;
    }
    setBusy(true);
    try {
      const res = await orgAdminLeagues.create({
        orgId,
        name: trimmed,
        sportCode: code,
        format
      });
      router.replace(`/leagues`);
      router.refresh();
      // Fallback if router.replace doesn't navigate immediately.
      console.info("Created league", res.league.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-surface-1 p-6">
      <Eyebrow>// Details</Eyebrow>
      <Field label="League name" hint={`Visible to captains and players in ${orgName}.`}>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="PPHL Spring 2026"
          disabled={busy}
        />
      </Field>
      <Field
        label="Sport"
        hint="Pick from the sports configured on the platform."
      >
        <Select
          value={sportCode}
          onChange={(e) => setSportCode(e.target.value)}
          disabled={busy}
        >
          {SPORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Format" hint="Drives later schedule + playoff defaults.">
        <div className="grid gap-2 sm:grid-cols-2">
          {FORMAT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setFormat(opt.value)}
              disabled={busy}
              className={
                "rounded-lg border px-4 py-3 text-left transition-colors " +
                (format === opt.value
                  ? "border-accent bg-accent/5"
                  : "border-border hover:border-border-strong")
              }
            >
              <p className="text-sm font-medium text-fg">{opt.label}</p>
              <p className="mt-0.5 text-[11px] text-fg-muted">{opt.hint}</p>
            </button>
          ))}
        </div>
      </Field>

      {error ? (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-[12px] text-red-600 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.back()}
          disabled={busy}
        >
          Cancel
        </Button>
        <Button size="sm" onClick={handleSubmit} disabled={busy}>
          {busy ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" strokeWidth={2} />
          ) : null}
          Create league
        </Button>
      </div>
    </div>
  );
}
