import { PageHeader } from "@sportspulse/ui";
import { SubstitutesClient } from "./substitutes-client";
export const dynamic = "force-dynamic";
export const metadata = { title: "Substitute requests · SportsPulse" };
export default function SubstitutesPage() {
  return <div className="space-y-6"><PageHeader title="Substitute requests" description="Review captain requests before private regional invitations are sent." /><SubstitutesClient /></div>;
}
