import { Construction } from "lucide-react";
import { EmptyState } from "@sportspulse/ui";
import { PageHeader } from "@/components/layout/page-header";

export const metadata = { title: "Stats — SportsPulse" };

export default function Page() {
  return (
    <>
      <PageHeader
        eyebrow="// STATS"
        title="Stats"
        description="Part of the Team admin console — full functionality lands in a follow-up slice."
      />
      <EmptyState
        icon={Construction}
        title="Coming soon"
        description="The Stats page is reserved in the navigation. The backend already has the data; the UI for managing it ships next."
      />
    </>
  );
}
