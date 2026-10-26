"use client";

import { ErrorFallback } from "@sportspulse/ui";

// A console page threw: the shell stays, the body offers a retry.
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return <ErrorFallback embedded reset={reset} />;
}
