"use client";

/* Hallmark · pre-emit critique: P4 H4 E4 S4 R5 V3 */
import { useTransition } from "react";
import { Button } from "./button";

export function ErrorFallback({ reset }: { reset: () => void }) {
  const [pending, startTransition] = useTransition();

  return (
    <main className="flex min-h-[60vh] items-center justify-center bg-bg px-5 py-12 text-fg">
      <div role="alert" className="w-full max-w-lg rounded-xl border border-border bg-surface-1 p-7 shadow-sm sm:p-10">
        <p className="font-mono text-[11px] uppercase tracking-widest text-accent">SportsPulse</p>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">We couldn&apos;t load this page</h1>
        <p className="mt-3 text-sm leading-6 text-fg-muted">
          We couldn&apos;t display the latest data. Try again; if the problem continues, contact your league administrator.
        </p>
        <Button
          className="mt-7"
          disabled={pending}
          onClick={() => startTransition(reset)}
        >
          {pending ? "Trying again…" : "Try again"}
        </Button>
      </div>
    </main>
  );
}
