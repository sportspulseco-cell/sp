"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button, Eyebrow, Field, Input } from "@sportspulse/ui";
import { orgAdminTeams } from "@/lib/api/browser-api";

export function NewTeamForm({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [sportCode, setSportCode] = useState("hockey");
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
        sportCode: sportCode.trim().toLowerCase(),
        shortName: shortName.trim() || undefined,
        logoUrl: logoUrl.trim() || undefined
      });
      router.replace(`/teams/${res.team.id}`);
      router.refresh();
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
      <Field
        label="Sport code"
        hint="Must match a sport seeded on the platform (hockey, soccer, basketball…)."
      >
        <Input
          value={sportCode}
          onChange={(e) => setSportCode(e.target.value)}
          placeholder="hockey"
          disabled={busy}
        />
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
