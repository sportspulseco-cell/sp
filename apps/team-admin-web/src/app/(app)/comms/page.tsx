import { Construction } from "lucide-react";
import { EmptyState } from "@sportspulse/ui";
import { PageHeader } from "@/components/layout/page-header";

export const metadata = { title: "Communications — SportsPulse" };

export default function Page() {
  return (
    <>
      <PageHeader
        eyebrow="// COMMUNICATIONS"
        title="Communications"
        description="Part of the Team admin console — full functionality lands in a follow-up slice."
      />
      <EmptyState
        icon={Construction}
        title="Coming soon"
        description="The Communications page is reserved in the navigation. The backend already has the data; the UI for managing it ships next."
      />
    </>
  );
}
