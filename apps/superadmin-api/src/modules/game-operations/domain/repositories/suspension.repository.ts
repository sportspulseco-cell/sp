import type { Page, PageQuery } from "@sportspulse/kernel";
import type { Suspension } from "../entities/suspension.entity";
import { SuspensionId } from "../identifiers";

export interface ListSuspensionsQuery extends PageQuery {
  personId?: string;
  status?: string;
}

export interface SuspensionRepository {
  findById(id: SuspensionId): Promise<Suspension | null>;
  list(q: ListSuspensionsQuery): Promise<Page<Suspension>>;
  insert(susp: Suspension): Promise<void>;
  save(susp: Suspension): Promise<void>;
}

export const SUSPENSION_REPOSITORY = Symbol("SUSPENSION_REPOSITORY");
