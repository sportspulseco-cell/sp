import { Video } from "lucide-react";
import { EmptyState } from "@sportspulse/ui";
import { PageHeader } from "@/components/layout/page-header";

export const metadata = { title: "Video — SportsPulse" };

export default function VideoPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="// Video"
        title="Video"
        description="Auto-clipped highlights, full game replays, and live streams."
      />
      <EmptyState
        icon={Video}
        title="Video pipeline coming soon"
        description="Highlights are clipped automatically from scorekeeper events. We're integrating with LiveBarn for the full-game replay layer; clips and replays land here once that pipeline ships."
      />
    </div>
  );
}
