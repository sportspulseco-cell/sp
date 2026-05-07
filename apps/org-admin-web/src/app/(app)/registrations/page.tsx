import { Construction } from "lucide-react";
import { EmptyState } from "@sportspulse/ui";
import { PageHeader } from "@/components/layout/page-header";

export const metadata = { title: "Registrations — SportsPulse" };

export default function Page() {
  return (
    <>
      <PageHeader
        eyebrow="// REGISTRATIONS"
        title="Registrations"
        description="Part of the Org admin console — full functionality lands in a follow-up slice."
      />
      <EmptyState
        icon={Construction}
        title="Coming soon"
        description="The Registrations page is reserved in the navigation. The backend already has the data; the UI for managing it ships next."
      />
    </>
  );
}
