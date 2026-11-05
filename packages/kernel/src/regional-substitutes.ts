export const REGIONAL_SUB_POSITIONS = ["goalie", "skater", "any"] as const;
export type RegionalSubPosition = (typeof REGIONAL_SUB_POSITIONS)[number];
export interface RegionalSubRequestInput { requestKey: string; position: RegionalSubPosition; needed: number; note?: string }
export interface RegionalSubBroadcast {
  id: string; gameId: string; teamId: string; teamName: string; regionName: string;
  position: RegionalSubPosition; needed: number; filled: number; note: string;
  status: string; createdAt: string; reviewedAt: string | null; reviewNote: string | null;
  closedReason: string | null;
  startsAt: string; timezone: string; venueName: string | null; invitedCount: number;
  accepted?: Array<{ personId: string; name: string }>;
}
export interface RegionalSubGameView { regionName: string | null; problem: string | null; items: RegionalSubBroadcast[] }
export interface RegionalSubInbox {
  nextCursor: string | null;
  regions: Array<{ id: string; name: string; orgName: string; enabled: boolean; positions: string[] }>;
  invitations: Array<{ broadcast: RegionalSubBroadcast; response: string }>;
}
