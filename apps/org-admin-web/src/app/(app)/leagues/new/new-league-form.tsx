"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button, Eyebrow, Field, Input } from "@sportspulse/ui";
import { orgAdminLeagues } from "@/lib/api/browser-api";

type Format = "regular" | "tournament" | "pickup" | "friendly";

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
  const [sportCode, setSportCode] = useState("hockey");
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
    const code = sportCode.trim().toLowerCase();
    if (code.length < 2) {
      setError("Sport code is required (e.g. hockey, soccer).");
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
        label="Sport code"
        hint="Short identifier — must match a sport already seeded on the platform (hockey, soccer, basketball, etc)."
      >
        <Input
          value={sportCode}
          onChange={(e) => setSportCode(e.target.value)}
          placeholder="hockey"
          disabled={busy}
        />
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
