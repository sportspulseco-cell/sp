export type GameOfficialRole =
  | "referee"
  | "linesman"
  | "scorekeeper"
  | "timekeeper"
  | "video_review"
  | "commissioner"
  | "other";

export type GameOfficialStatus = "confirmed" | "tentative" | "declined";

export interface GameOfficialRow {
  id: string;
  gameId: string;
  personId: string;
  role: GameOfficialRole;
  slot: string | null;
  status: GameOfficialStatus;
  assignedByUserId: string | null;
  notes: string | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AssignOfficialInput {
  gameId: string;
  personId: string;
  role: GameOfficialRole;
  slot?: string | null;
  status?: GameOfficialStatus;
  assignedByUserId?: string | null;
  notes?: string | null;
}

export interface UpdateOfficialStatusInput {
  id: string;
  status: GameOfficialStatus;
}

export interface GameOfficialRepository {
  /** Active officials for a game (revoked excluded). */
  listForGame(gameId: string): Promise<GameOfficialRow[]>;
  /** All officials a person has been assigned to (active + history). */
  listForPerson(personId: string): Promise<GameOfficialRow[]>;
  findById(id: string): Promise<GameOfficialRow | null>;
  /**
   * Idempotent — if an active row already exists for
   * (gameId, role, slot, personId), returns it without inserting.
   */
  assign(input: AssignOfficialInput): Promise<GameOfficialRow>;
  updateStatus(input: UpdateOfficialStatusInput): Promise<GameOfficialRow>;
  /** Soft-revoke (sets revokedAt). */
  revoke(id: string): Promise<GameOfficialRow>;
}

export const GAME_OFFICIAL_REPOSITORY = Symbol("GAME_OFFICIAL_REPOSITORY");
