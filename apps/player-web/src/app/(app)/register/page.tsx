import { Construction } from "lucide-react";
import { EmptyState } from "@sportspulse/ui";
import { PageHeader } from "@/components/layout/page-header";

export const metadata = { title: "Find a team — SportsPulse" };

export default function Page() {
  return (
    <>
      <PageHeader
        eyebrow="// FIND A TEAM"
        title="Find a team"
        description="Part of the Player console — full functionality lands in a follow-up slice."
      />
      <EmptyState
        icon={Construction}
        title="Coming soon"
        description="The Find a team page is reserved in the navigation. The backend already has the data; the UI for managing it ships next."
      />
    </>
  );
}
