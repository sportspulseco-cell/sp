"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { writeClipboard } from "./lib/clipboard";

/**
 * A link an admin shares (a league's public registration page): the URL,
 * a Copy button that says when it worked, and Open.
 */
export function CopyLink({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState<"yes" | "no" | null>(null);
  async function copy() {
    setCopied((await writeClipboard(value)) ? "yes" : "no");
    setTimeout(() => setCopied(null), 2500);
  }
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">{label}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-bg-subtle px-3 py-2 font-mono text-[12px] text-blue-600 dark:text-blue-300">
          {value}
        </code>
        <button
          type="button"
          onClick={copy}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-3 font-mono text-[10px] uppercase tracking-widest text-fg hover:border-fg-muted"
        >
          {copied === "yes" ? <Check className="h-3 w-3" strokeWidth={1.75} /> : <Copy className="h-3 w-3" strokeWidth={1.75} />}
          {copied === "yes" ? "Copied" : copied === "no" ? "Select and copy" : "Copy"}
        </button>
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-3 font-mono text-[10px] uppercase tracking-widest text-fg hover:border-fg-muted"
        >
          <ExternalLink className="h-3 w-3" strokeWidth={1.75} />
          Open
        </a>
      </div>
    </div>
  );
}
