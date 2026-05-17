"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button, Eyebrow, Field, Input, Select } from "@sportspulse/ui";
import { orgAdminTeams } from "@/lib/api/browser-api";

// Mirrors the `public.sports` seed — same list as the new-league form
// (BUG-019). Free-text sport code shipped 500s because the API FK is
// case-sensitive UPPERCASE.
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

export function NewTeamForm({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [sportCode, setSportCode] = useState("HOCKEY_ICE");
  const [logoUrl, setLogoUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    if (name.trim().length < 2) {
      setError("Team name is required.");
      return;
    }
    if (sportCode.trim().length < 2) {
      setError("Sport code is required.");
      return;
    }
    setBusy(true);
    try {
      const res = await orgAdminTeams.create({
        orgId,
        name: name.trim(),
        sportCode: sportCode.trim(),
        shortName: shortName.trim() || undefined,
        logoUrl: logoUrl.trim() || undefined
      });
      // Hard-nav so the destination page renders fresh data (BUG-038).
      window.location.replace(`/teams/${res.team.id}`);
      return;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-surface-1 p-6">
      <Eyebrow>// Details</Eyebrow>
      <Field label="Team name">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Sharks"
          disabled={busy}
        />
      </Field>
      <Field label="Short name (optional)" hint="Used in tight UI (schedule cards, lineups).">
        <Input
          value={shortName}
          onChange={(e) => setShortName(e.target.value)}
          placeholder="SHK"
          maxLength={16}
          disabled={busy}
        />
      </Field>
      <Field label="Sport" hint="Pick from the sports seeded on the platform.">
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
      <Field label="Logo URL (optional)">
        <Input
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.target.value)}
          placeholder="https://…/sharks.png"
          disabled={busy}
        />
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
          Create team
        </Button>
      </div>
    </div>
  );
}
