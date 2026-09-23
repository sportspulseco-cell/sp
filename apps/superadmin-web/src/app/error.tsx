"use client";

import { ErrorFallback } from "@sportspulse/ui";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return <ErrorFallback reset={reset} />;
}
