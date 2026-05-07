import { Construction } from "lucide-react";
import { EmptyState } from "@sportspulse/ui";
import { PageHeader } from "@/components/layout/page-header";

export const metadata = { title: "My team — SportsPulse" };

export default function Page() {
  return (
    <>
      <PageHeader
        eyebrow="// MY TEAM"
        title="My team"
        description="Part of the Player console — full functionality lands in a follow-up slice."
      />
      <EmptyState
        icon={Construction}
        title="Coming soon"
        description="The My team page is reserved in the navigation. The backend already has the data; the UI for managing it ships next."
      />
    </>
  );
}
