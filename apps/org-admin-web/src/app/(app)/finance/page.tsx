import { Construction } from "lucide-react";
import { EmptyState } from "@sportspulse/ui";
import { PageHeader } from "@/components/layout/page-header";

export const metadata = { title: "Finance — SportsPulse" };

export default function Page() {
  return (
    <>
      <PageHeader
        eyebrow="// FINANCE"
        title="Finance"
        description="Part of the Org admin console — full functionality lands in a follow-up slice."
      />
      <EmptyState
        icon={Construction}
        title="Coming soon"
        description="The Finance page is reserved in the navigation. The backend already has the data; the UI for managing it ships next."
      />
    </>
  );
}
