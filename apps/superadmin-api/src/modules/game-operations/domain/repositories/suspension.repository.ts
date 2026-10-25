import type { Suspension } from "../entities/suspension.entity";
import { SuspensionId } from "../identifiers";

/**
 * Reads by id. Lists are scoped by the caller's visibility and live in
 * ListSuspensionsHandler; issue / lift / serve write inside their own
 * transactions (application/suspensions/handlers.ts).
 */
export interface SuspensionRepository {
  findById(id: SuspensionId): Promise<Suspension | null>;
}

export const SUSPENSION_REPOSITORY = Symbol("SUSPENSION_REPOSITORY");
