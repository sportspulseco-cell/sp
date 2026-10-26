import type { NotificationChannelStatus } from "@sportspulse/api-client";

/**
 * Plain statement of which channels cannot deliver yet, for admin
 * communications pages (FR-3.10.2). Shows nothing when all are set up.
 * Text and push copies of a message go only to people who turned them
 * on; when a channel is not set up those copies are recorded as not sent.
 */
export function ChannelStatusNotice({ status }: { status: NotificationChannelStatus | null }) {
  if (!status) return null;
  const lines: string[] = [];
  if (!status.email.available) lines.push("Email is not set up: emails are recorded but not sent.");
  if (!status.sms.available) lines.push("Text messages are not set up: texts are recorded as not sent.");
  if (!status.push.available) lines.push("Push notifications are not set up: pushes are recorded as not sent.");
  if (lines.length === 0) return null;
  return (
    <div
      className="rounded-md border border-border bg-surface-2 px-4 py-3 text-[13px] text-fg-muted"
      data-testid="channel-status-notice"
    >
      {lines.map((l) => (
        <p key={l}>{l}</p>
      ))}
    </div>
  );
}
