"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { compliance } from "@/lib/api/browser-api";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

export function PublishDocumentVersionForm({
  documentId
}: {
  documentId: string;
}) {
  const router = useRouter();
  const [contentHtml, setContentHtml] = useState("");
  const [languageCode, setLanguageCode] = useState("en");
  const [jurisdiction, setJurisdiction] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await compliance.publishDocumentVersion(documentId, {
        contentHtml,
        languageCode,
        jurisdictionCountryCode: jurisdiction || null
      });
      setContentHtml("");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Content (HTML)" htmlFor="contentHtml">
        <textarea
          id="contentHtml"
          required
          rows={10}
          value={contentHtml}
          onChange={(e) => setContentHtml(e.target.value)}
          placeholder="<h1>Player Waiver…</h1><p>I, the undersigned, …</p>"
          className="w-full rounded-md border border-border bg-surface-1 px-3 py-2 font-mono text-[12px] text-fg placeholder:text-fg-muted focus-visible:border-accent focus-visible:outline-none focus-visible:shadow-focus"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Language" htmlFor="languageCode">
          <Input
            id="languageCode"
            value={languageCode}
            onChange={(e) => setLanguageCode(e.target.value)}
            placeholder="en"
          />
        </Field>
        <Field
          label="Jurisdiction"
          htmlFor="jurisdiction"
          hint="ISO country code, optional."
        >
          <Input
            id="jurisdiction"
            value={jurisdiction}
            onChange={(e) => setJurisdiction(e.target.value)}
            placeholder="US"
          />
        </Field>
      </div>

      {error ? (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={loading || !contentHtml} className="w-full">
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Publishing…
          </>
        ) : (
          <>
            <Sparkles className="mr-2 h-4 w-4" /> Publish version
          </>
        )}
      </Button>
    </form>
  );
}
