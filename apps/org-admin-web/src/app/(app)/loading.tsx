import { RouteLoading } from "@sportspulse/ui";

// Default fallback for any console route while it streams.
// Specific routes can override with their own loading.tsx.
export default function Loading() {
  return <RouteLoading label="Loading organization workspace" />;
}
