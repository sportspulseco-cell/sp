import { Construction } from "lucide-react";
import { EmptyState } from "@sportspulse/ui";
import { PageHeader } from "@/components/layout/page-header";

export const metadata = { title: "My registrations — SportsPulse" };

export default function Page() {
  return (
    <>
      <PageHeader
        eyebrow="// MY REGISTRATIONS"
        title="My registrations"
        description="Part of the Player console — full functionality lands in a follow-up slice."
      />
      <EmptyState
        icon={Construction}
        title="Coming soon"
        description="The My registrations page is reserved in the navigation. The backend already has the data; the UI for managing it ships next."
      />
    </>
  );
}
