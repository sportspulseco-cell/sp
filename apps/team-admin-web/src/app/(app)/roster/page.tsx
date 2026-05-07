import { Construction } from "lucide-react";
import { EmptyState } from "@sportspulse/ui";
import { PageHeader } from "@/components/layout/page-header";

export const metadata = { title: "Roster — SportsPulse" };

export default function Page() {
  return (
    <>
      <PageHeader
        eyebrow="// ROSTER"
        title="Roster"
        description="Part of the Team admin console — full functionality lands in a follow-up slice."
      />
      <EmptyState
        icon={Construction}
        title="Coming soon"
        description="The Roster page is reserved in the navigation. The backend already has the data; the UI for managing it ships next."
      />
    </>
  );
}
